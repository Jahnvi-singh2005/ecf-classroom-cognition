// screens/guidedResolution.js — Guided Resolution (Active/Constructive only).
// Build-spec §11.9 / rebuild plan §6.9. No buttons, no mouse interaction. ArrowRight
// advances after min time; auto-advances at max time. Shown after every embedded
// task response, regardless of correctness.

import { getState, setState } from '../state.js';
import { getCondition, getTextSlides } from '../content.js';
import { startTimer } from '../timer.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { renderMarkdown } from '../utils/markdown.js';
import { canProgress } from '../testingMode.js';
import { goToPhase } from '../main.js';
import { sendMarker, MARKERS } from '../markers.js';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

let containerRef = null;
let cancelTimer = null;
let cancelMinTimer = null;
let hasAdvanced = false;
let elapsedMs = 0;
let minTimeMs = 0;
let maxTimeMs = 0;
let resolutionSlideIndex = null;

function computeSectionNumber(slides, index) {
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    if (slides[i].type === 'guided-resolution') count += 1;
  }
  return count + 1; // this resolution's own section number (1-indexed)
}

function handleArrowRight() {
  if (!canProgress(elapsedMs, minTimeMs)) return;
  advance();
}

function advance() {
  if (hasAdvanced) return;
  hasAdvanced = true;
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  if (cancelMinTimer) { cancelMinTimer(); cancelMinTimer = null; }
  unregisterHandler('arrow-right');

  sendMarker(MARKERS.GUIDED_DISMISSED);

  const { currentTextIndex, assignedGroup } = getState();
  const condition = getCondition(assignedGroup, currentTextIndex);
  const slides = getTextSlides(condition, currentTextIndex);
  const nextIndex = resolutionSlideIndex + 1;
  setState({ currentSlideIndex: nextIndex });

  if (nextIndex >= slides.length) {
    goToPhase('praIntro');
    return;
  }

  const nextType = slides[nextIndex].type;
  if (nextType === 'pure-text') {
    goToPhase('stimulus');
  } else {
    console.error('[guidedResolution] Unexpected slide type following a guided-resolution slide:', nextType);
  }
}

export function mount(container) {
  containerRef = container;
  hasAdvanced = false;
  elapsedMs = 0;

  const { currentTextIndex, currentSlideIndex, assignedGroup, content, texts } = getState();
  const condition = getCondition(assignedGroup, currentTextIndex);
  const slides = getTextSlides(condition, currentTextIndex);
  resolutionSlideIndex = currentSlideIndex;
  const resolutionSlide = slides[resolutionSlideIndex];

  if (!resolutionSlide || resolutionSlide.type !== 'guided-resolution') {
    console.error('[guidedResolution] Expected a guided-resolution slide at the current index.', { currentSlideIndex, resolutionSlide });
    return;
  }

  const sectionNumber = computeSectionNumber(slides, resolutionSlideIndex);
  const nextIndex = resolutionSlideIndex + 1;
  const hasNextSection = nextIndex < slides.length;

  const textEntry = texts.find((t) => t.textIndex === currentTextIndex);
  const lastResponse = textEntry?.embeddedResponses?.[textEntry.embeddedResponses.length - 1] || null;

  // The options/textbox slide always immediately precedes its guided-resolution slide.
  const optionsSlide = slides[resolutionSlideIndex - 1];
  const isActive = optionsSlide?.type === 'active-options';

  let optionsHtml = '';
  if (isActive && lastResponse && lastResponse.selectedOptionIndex !== null) {
    const options = optionsSlide.options || {};
    const correctLetter = options.correct;
    const selectedLetter = OPTION_LETTERS[lastResponse.selectedOptionIndex];
    optionsHtml = `
      <div class="mc-options">
        ${OPTION_LETTERS.map((letter) => `
          <div class="mc-option ${letter === selectedLetter ? 'focused' : ''} ${letter === correctLetter ? 'correct' : ''}">
            <div class="mc-letter">${letter}</div>${options[letter] || ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="task-body" style="padding-top:40px;">
      <div class="resolution-card">
        <div>
          <span class="eyebrow">Question</span>
          <div class="resolution-q-recap">${renderMarkdown(lastResponse?.questionText || '')}</div>
        </div>
        ${optionsHtml}
        <div class="resolution-divider"></div>
        <div>
          <span class="resolution-label">Guided Resolution</span>
          <div class="resolution-text">${renderMarkdown(resolutionSlide.content || '')}</div>
        </div>
        <div class="resolution-footer">
          <div class="kbd-hint resolution-advance-wait">please wait…</div>
          <div class="kbd-hint resolution-advance-cue"><kbd class="kbd">→</kbd> to continue${hasNextSection ? ` to Section ${sectionNumber + 1}` : ''}</div>
        </div>
      </div>
    </div>
  `;

  const defaults = content?.globalTimingDefaults?.guidedResolution;
  minTimeMs = resolutionSlide.timing?.minMs ?? defaults?.minMs;
  maxTimeMs = resolutionSlide.timing?.maxMs ?? defaults?.maxMs;

  // Visual-only cue: mark the footer "advance-ready" once the minimum display time
  // has elapsed, purely for the CSS-driven arrow hint — does not affect canProgress.
  const markAdvanceReady = () => {
    containerRef?.querySelector('.resolution-footer')?.classList.add('advance-ready');
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

  sendMarker(MARKERS.GUIDED_ONSET);

  cancelTimer = startTimer({
    onTick: (elapsed) => { elapsedMs = elapsed; },
    onComplete: advance,
    durationMs: maxTimeMs,
  });
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  if (cancelMinTimer) { cancelMinTimer(); cancelMinTimer = null; }
  unregisterHandler('arrow-right');
  containerRef = null;
}
