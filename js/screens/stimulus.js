// screens/stimulus.js — Reading Slides, all 4 conditions. Build-spec §11.7 /
// rebuild plan §6.7. No buttons, no mouse interaction. ArrowRight advances after min
// time; auto-advances at max time. Every advance is logged to readingAdvanceMarkers.
//
// state.currentSlideIndex indexes into the FULL per-text slide array (pure-text,
// question-probe, options, guided-resolution slide types interleaved for Active/
// Constructive). This module only ever renders 'pure-text' slides; when the next
// slide in the array is a question-probe type it hands off to embeddedTask, and when
// the array is exhausted it hands off to pra. guidedResolution.js (not this module)
// is what routes back into stimulus.js for the next section's prose.

import { getState, setState } from '../state.js';
import { getCondition, getConditionContent, getTextMeta, getTextSlides } from '../content.js';
import { startTimer } from '../timer.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { renderMarkdown } from '../utils/markdown.js';
import { canProgress } from '../testingMode.js';
import { goToPhase } from '../main.js';
import { sendMarker, MARKERS } from '../markers.js';

let containerRef = null;
let cancelTimer = null;
let cancelMinTimer = null;
let hasAdvanced = false;
let elapsedMs = 0;
let minTimeMs = 0;
let maxTimeMs = 0;

function ensureTextEntry(condition, textId, textTitle) {
  const { texts, currentTextIndex } = getState();
  const existing = texts.find((t) => t.textIndex === currentTextIndex);
  if (existing) return existing;

  const entry = {
    textIndex: currentTextIndex,
    textId,
    textTitle,
    condition,
    startTime: Date.now(),
    endTime: null,
    readingAdvanceMarkers: [],
    embeddedResponses: [],
    praResponses: [],
  };
  setState({ texts: [...texts, entry] });
  return entry;
}

function appendReadingMarker(marker) {
  const { texts, currentTextIndex } = getState();
  const updated = texts.map((t) => (
    t.textIndex === currentTextIndex
      ? { ...t, readingAdvanceMarkers: [...t.readingAdvanceMarkers, marker] }
      : t
  ));
  setState({ texts: updated });
}

// Position of the slide at `index` among pure-text slides only, e.g. "Slide 3 of 7".
function computePureTextPosition(slides, index) {
  const pureTextSlides = slides.filter((s) => s.type === 'pure-text');
  const current = slides.slice(0, index + 1).filter((s) => s.type === 'pure-text').length;
  return { current, total: pureTextSlides.length };
}

// The `title` field already reads "Title - Author"/"Title – Author" (e.g. "The Market
// for Lemons - GA Akerlof") — split it for the title card rather than adding a
// separate author field to the text object.
function parseTitleAndAuthor(rawTitle) {
  const match = /^(.*?)\s[-–—]\s(.+)$/.exec(rawTitle || '');
  if (!match) return { title: rawTitle || '', author: '' };
  return { title: match[1], author: match[2] };
}

function handleArrowRight() {
  if (!canProgress(elapsedMs, minTimeMs)) return;
  advance('arrow-right');
}

function advance(advancedBy) {
  if (hasAdvanced) return;
  hasAdvanced = true;
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  if (cancelMinTimer) { cancelMinTimer(); cancelMinTimer = null; }
  unregisterHandler('arrow-right');

  const { currentTextIndex, currentSlideIndex, assignedGroup } = getState();
  const condition = getCondition(assignedGroup, currentTextIndex);
  const slides = getTextSlides(condition, currentTextIndex);

  appendReadingMarker({
    slideIndex: currentSlideIndex,
    totalSlides: slides.filter((s) => s.type === 'pure-text').length,
    advancedBy,
    markedAt: Date.now(),
    elapsedMs: Math.min(elapsedMs, maxTimeMs),
    minTimeMs,
    maxTimeMs,
  });

  sendMarker(advancedBy === 'auto-timeout' ? MARKERS.SLIDE_ADVANCE_TIMEOUT : MARKERS.SLIDE_ADVANCE_KEY);

  routeToNextSlide(slides, currentSlideIndex);
}

function routeToNextSlide(slides, currentIndex) {
  const nextIndex = currentIndex + 1;
  setState({ currentSlideIndex: nextIndex });

  if (nextIndex >= slides.length) {
    // Text fully read — hand off to the Post-Reading Assessment announcement slide.
    goToPhase('praIntro');
    return;
  }

  const nextType = slides[nextIndex].type;

  if (nextType === 'pure-text') {
    goToPhase('stimulus');
  } else if (nextType === 'active-question-probe' || nextType === 'constructive-question-probe') {
    goToPhase('embeddedTask');
  } else {
    console.error('[stimulus] Unexpected slide type following a pure-text slide:', nextType);
  }
}

// Shown once, before the first pure-text slide of each text — not counted in the
// "Slide N of Total" numbering, which only tracks the underlying slides array.
function renderTitleSlide(textMeta) {
  const { title, author } = parseTitleAndAuthor(textMeta?.title);
  const { assignedGroup, currentTextIndex } = getState();

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="reading-layout">
      <div class="reading-body title-slide-body">
        <div class="title-slide-card">
          <span class="eyebrow">Text ${currentTextIndex + 1}</span>
          <h1 class="title-slide-heading">${title}</h1>
          ${author ? `<p class="title-slide-author">${author}</p>` : ''}
        </div>
      </div>
      <div class="reading-footer">
        <div class="kbd-hint"><kbd class="kbd">→</kbd> to begin</div>
      </div>
    </div>
  `;

  registerHandler('arrow-right', dismissTitleSlide);

  const condition = getCondition(assignedGroup, currentTextIndex);
  sendMarker(MARKERS['TITLE_ONSET_' + condition.toUpperCase()]);
}

function dismissTitleSlide() {
  unregisterHandler('arrow-right');
  renderContentSlide();
}

export function mount(container) {
  containerRef = container;
  hasAdvanced = false;
  elapsedMs = 0;

  const { currentSlideIndex } = getState();
  if (currentSlideIndex === 0) {
    renderTitleSlide(getTextMeta(getState().currentTextIndex));
    return;
  }

  renderContentSlide();
}

function renderContentSlide() {
  const { currentTextIndex, currentSlideIndex, assignedGroup, content } = getState();
  const condition = getCondition(assignedGroup, currentTextIndex);
  const conditionContent = getConditionContent(condition, currentTextIndex);
  const textMeta = getTextMeta(currentTextIndex);
  const slides = conditionContent?.slides ?? [];
  const slide = slides[currentSlideIndex];

  if (!slide || slide.type !== 'pure-text') {
    console.error('[stimulus] Expected a pure-text slide at the current index — content may be misconfigured.', { currentSlideIndex, slide });
    return;
  }

  ensureTextEntry(condition, `text${currentTextIndex + 1}`, textMeta?.title || '');

  const { current: slideNumber, total: slideTotal } = computePureTextPosition(slides, currentSlideIndex);
  const { title: headerTitle } = parseTitleAndAuthor(textMeta?.title);

  containerRef.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span>
      <div class="topbar-meta">
        <span class="topbar-text-title">${headerTitle}</span>
        <span class="topbar-badge">Slide ${slideNumber} of ${slideTotal}</span>
      </div>
    </div>
    <div class="reading-layout">
      <div class="reading-body">
        <div class="passage-card">
          <div class="passage-text">${renderMarkdown(slide.content || '')}</div>
          <span class="advance-cue">→ continue</span>
        </div>
      </div>
      <div class="reading-footer">
        <div class="kbd-hint"><kbd class="kbd">→</kbd> to continue when ready</div>
      </div>
    </div>
  `;

  const globalDefaults = content?.globalTimingDefaults?.pureText;
  minTimeMs = slide.timing?.minMs ?? globalDefaults?.minMs;
  maxTimeMs = slide.timing?.maxMs ?? globalDefaults?.maxMs;

  // Visual-only cue: mark the slide "advance-ready" once the minimum display time
  // has elapsed, purely for the CSS-driven arrow hint — does not affect canProgress.
  const markAdvanceReady = () => {
    containerRef?.querySelector('.reading-layout')?.classList.add('advance-ready');
  };
  if (minTimeMs > 0) {
    cancelMinTimer = startTimer({
      onTick: () => {},
      onComplete: markAdvanceReady,
      durationMs: minTimeMs,
    });
  } else {
    markAdvanceReady();
  }

  // ArrowRight must work regardless of whether auto-advance timing is configured —
  // a missing/zero maxMs should only disable the auto-timeout below, not advancing.
  registerHandler('arrow-right', handleArrowRight);

  // Missing timing config means no auto-advance — ArrowRight (registered above) still works.
  if (!maxTimeMs) return;

  cancelTimer = startTimer({
    onTick: (elapsed) => { elapsedMs = elapsed; },
    onComplete: () => advance('auto-timeout'),
    durationMs: maxTimeMs,
  });

  sendMarker(MARKERS[`SLIDE_ONSET_${condition.toUpperCase()}`]);
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  if (cancelMinTimer) { cancelMinTimer(); cancelMinTimer = null; }
  unregisterHandler('arrow-right');
  containerRef = null;
}
