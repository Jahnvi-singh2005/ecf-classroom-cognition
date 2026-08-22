// screens/stimulus.js — Reading Slides, all 4 conditions. Build-spec §11.7 /
// rebuild plan §6.7. No buttons, no mouse interaction. Spacebar advances after min
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
import { goToPhase } from '../main.js';

let containerRef = null;
let cancelTimer = null;
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

// Section N = 1 + how many guided-resolution slides (section terminators) precede
// this index in the mixed slide array.
function computeSectionNumber(slides, index) {
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    if (slides[i].type === 'guided-resolution') count += 1;
  }
  return count + 1;
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

function handleSpacebar() {
  if (elapsedMs < minTimeMs) return;
  advance('spacebar');
}

function advance(advancedBy) {
  if (hasAdvanced) return;
  hasAdvanced = true;
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('space');

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

  // MARKER STUB [phase 2]: slide advance
  // sendMarker(MARKERS.SLIDE_ADVANCE);

  routeToNextSlide(slides, currentSlideIndex);
}

function routeToNextSlide(slides, currentIndex) {
  const nextIndex = currentIndex + 1;
  setState({ currentSlideIndex: nextIndex });

  if (nextIndex >= slides.length) {
    // Text fully read — hand off to the Post-Reading Assessment.
    goToPhase('pra');
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

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="reading-layout">
      <div class="reading-body title-slide-body">
        <div class="title-slide-card">
          <h1 class="title-slide-heading">${title}</h1>
          ${author ? `<p class="title-slide-author">${author}</p>` : ''}
        </div>
      </div>
      <div class="reading-footer">
        <div class="kbd-hint"><kbd class="kbd">Spacebar</kbd> to begin</div>
      </div>
    </div>
  `;

  registerHandler('space', dismissTitleSlide);
}

function dismissTitleSlide() {
  unregisterHandler('space');
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

  const showSectionLabel = condition === 'active' || condition === 'constructive';
  const sectionNumber = showSectionLabel ? computeSectionNumber(slides, currentSlideIndex) : null;
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
          ${showSectionLabel ? `<span class="section-label">Section ${sectionNumber} of 4</span>` : ''}
          <div class="passage-text">${renderMarkdown(slide.content || '')}</div>
        </div>
      </div>
      <div class="reading-footer">
        <div class="kbd-hint"><kbd class="kbd">Spacebar</kbd> to continue when ready</div>
      </div>
    </div>
  `;

  const globalDefaults = content?.globalTimingDefaults?.pureText;
  minTimeMs = slide.timing?.minMs ?? globalDefaults?.minMs;
  maxTimeMs = slide.timing?.maxMs ?? globalDefaults?.maxMs;

  if (!maxTimeMs) {
    console.error('[stimulus] No duration configured for this slide (per-slide timing.maxMs or globalTimingDefaults.pureText.maxMs) — cannot auto-advance.');
    return;
  }

  registerHandler('space', handleSpacebar);

  cancelTimer = startTimer({
    onTick: (elapsed) => { elapsedMs = elapsed; },
    onComplete: () => advance('auto-timeout'),
    durationMs: maxTimeMs,
  });

  // MARKER STUB [phase 2]: slide onset
  // sendMarker(MARKERS.SLIDE_ONSET);
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('space');
  containerRef = null;
}
