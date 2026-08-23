// screens/embeddedTask.js — Active/Constructive embedded task. Build-spec §11.8 /
// rebuild plan §6.8. No buttons, no mouse interaction on options. Thinking phase
// auto-advances to response phase; response phase submits via Ctrl+Enter (Active:
// arrow-key-selected option; Constructive: typed text gated by word count).
//
// Mounted with state.currentSlideIndex pointing at the question-probe slide; the very
// next slide in the array is always the matching options/textbox slide (probe+options
// or probe+textbox pairs, per the slide-type table in build-spec §15).

import { getState, setState } from '../state.js';
import { getCondition, getTextSlides } from '../content.js';
import { startTimer } from '../timer.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { renderMarkdown } from '../utils/markdown.js';
import { countWords, isWithinRange } from '../utils/wordCount.js';
import { isTestingMode } from '../testingMode.js';
import { goToPhase } from '../main.js';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

let containerRef = null;
let cancelTimer = null;

let probeIndex = null;
let probeSlide = null;
let optionsSlide = null;
let condition = null; // 'active' | 'constructive'
let sectionIndex = 0;

let selectedIndex = 0;
let typedText = '';
let hint = '';

let t1QuestionShown = null;
let t2ResponsePhaseStart = null;
let t3FirstInput = null;
let hasSubmitted = false;

function computeSectionIndex(slides, index) {
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    if (slides[i].type === 'guided-resolution') count += 1;
  }
  return count; // 0-indexed
}

function appendEmbeddedResponse(entry) {
  const { texts, currentTextIndex } = getState();
  const updated = texts.map((t) => (
    t.textIndex === currentTextIndex
      ? { ...t, embeddedResponses: [...t.embeddedResponses, entry] }
      : t
  ));
  setState({ texts: updated });
}

// ─── Thinking phase ────────────────────────────────────────────────────────

function renderThinking() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="think-bar-wrap">
      <div class="think-bar-label">Thinking time — read the question carefully</div>
      <div class="think-bar-track"><div class="think-bar-fill" id="think-fill" style="width:0%"></div></div>
    </div>
    <div class="task-body">
      <div class="task-card">
        <div class="task-question">${renderMarkdown(probeSlide.content || '')}</div>
        <div style="font-size:13px;color:var(--muted);font-style:italic;">${
          condition === 'active'
            ? 'Options will appear when thinking time ends.'
            : 'Your response area will appear when thinking time ends.'
        }</div>
      </div>
    </div>
  `;
}

function startThinkingTimer(content) {
  const defaults = content?.globalTimingDefaults?.questionProbe;
  const maxMs = probeSlide.timing?.maxMs ?? defaults?.maxMs;

  // Testing mode: no auto-advance timer at all — thinking phase otherwise has no
  // manual escape, so Spacebar becomes the only way forward.
  if (isTestingMode()) {
    registerHandler('space', enterResponsePhase);
    return;
  }

  if (!maxMs) {
    console.error('[embeddedTask] No thinking-phase duration configured (probe timing.maxMs or globalTimingDefaults.questionProbe.maxMs).');
    return;
  }

  cancelTimer = startTimer({
    onTick: (elapsed) => {
      const fill = containerRef.querySelector('#think-fill');
      if (fill) fill.style.width = `${Math.min((elapsed / maxMs) * 100, 100)}%`;
    },
    onComplete: enterResponsePhase,
    durationMs: maxMs,
  });
}

// ─── Response phase — Active ───────────────────────────────────────────────

function renderResponseActive() {
  const options = optionsSlide.options || {};
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="task-body" style="padding-top:32px;">
      <div class="task-card">
        <div class="task-question">${renderMarkdown(probeSlide.content || '')}</div>
        <div class="mc-options">
          ${OPTION_LETTERS.map((letter, i) => `
            <div class="mc-option ${i === selectedIndex ? 'focused' : ''}" data-index="${i}">
              <div class="mc-letter">${letter}</div>${options[letter] || ''}
            </div>
          `).join('')}
        </div>
        <div class="task-footer">
          <div class="kbd-hint"><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> to navigate</div>
          <div class="kbd-hint"><kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">Enter</kbd> to submit</div>
        </div>
      </div>
    </div>
  `;
}

function updateActiveSelection() {
  containerRef.querySelectorAll('.mc-option').forEach((el) => {
    el.classList.toggle('focused', Number(el.dataset.index) === selectedIndex);
  });
}

function markFirstInput() {
  if (t3FirstInput === null) t3FirstInput = Date.now();
}

function handleArrowUp() {
  selectedIndex = (selectedIndex + OPTION_LETTERS.length - 1) % OPTION_LETTERS.length;
  updateActiveSelection();
  markFirstInput();
  // MARKER STUB [phase 2]: option navigated
  // sendMarker(MARKERS.OPTION_NAVIGATED);
}

function handleArrowDown() {
  selectedIndex = (selectedIndex + 1) % OPTION_LETTERS.length;
  updateActiveSelection();
  markFirstInput();
  // MARKER STUB [phase 2]: option navigated
  // sendMarker(MARKERS.OPTION_NAVIGATED);
}

// ─── Response phase — Constructive ─────────────────────────────────────────

function renderResponseConstructive() {
  const wordCount = countWords(typedText);
  const minWords = optionsSlide.timing?.minWords ?? 0;
  const maxWords = optionsSlide.timing?.maxWords ?? 999;
  const inRange = isWithinRange(wordCount, minWords, maxWords);

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="task-body" style="padding-top:32px;">
      <div class="task-card">
        <div class="task-question">${renderMarkdown(probeSlide.content || '')}</div>
        <div class="word-count-row">
          <span class="word-count-label">Word count</span>
          <span class="word-count-val ${inRange ? '' : 'warn'}">${wordCount} words</span>
        </div>
        <textarea class="free-resp-area" id="field-response" style="min-height:140px;">${typedText}</textarea>
        ${hint ? `<p class="field-error">${hint}</p>` : ''}
        <div class="task-footer">
          <div class="kbd-hint">Word count must be within range (${minWords}–${maxWords})</div>
          <div class="kbd-hint"><kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">Enter</kbd> to submit</div>
        </div>
      </div>
    </div>
  `;

  const textarea = containerRef.querySelector('#field-response');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.addEventListener('input', handleConstructiveInput);
  textarea.addEventListener('keydown', markFirstInput);
}

function handleConstructiveInput(event) {
  typedText = event.target.value;
  const wordCount = countWords(typedText);
  const minWords = optionsSlide.timing?.minWords ?? 0;
  const maxWords = optionsSlide.timing?.maxWords ?? 999;
  const inRange = isWithinRange(wordCount, minWords, maxWords);

  const countEl = containerRef.querySelector('.word-count-val');
  if (countEl) {
    countEl.textContent = `${wordCount} words`;
    countEl.classList.toggle('warn', !inRange);
  }
}

// ─── Shared response-phase entry / submission ──────────────────────────────

function enterResponsePhase() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('space'); // clears the testing-mode thinking-phase skip, if any
  t2ResponsePhaseStart = Date.now();

  const { content } = getState();
  const globalKey = condition === 'active' ? 'activeOptions' : 'constructiveTextBox';
  const defaults = content?.globalTimingDefaults?.[globalKey];
  const maxMs = optionsSlide.timing?.maxMs ?? defaults?.maxMs;

  // MARKER STUB [phase 2]: response phase start
  // sendMarker(MARKERS.RESPONSE_PHASE_START);

  if (condition === 'active') {
    selectedIndex = 0; // first option pre-highlighted
    renderResponseActive();
    registerHandler('arrow-up', handleArrowUp);
    registerHandler('arrow-down', handleArrowDown);
  } else {
    renderResponseConstructive();
  }
  registerHandler('ctrl+enter', handleSubmit);

  // Testing mode: no forced auto-submit — Ctrl+Enter (already registered above,
  // still gated by word-count enforcement) is the only way to submit.
  if (isTestingMode()) return;

  if (!maxMs) {
    console.error('[embeddedTask] No response-phase duration configured.');
    return;
  }

  cancelTimer = startTimer({
    onTick: () => {},
    onComplete: () => finalizeSubmission(true),
    durationMs: maxMs,
  });
}

function handleSubmit() {
  if (hasSubmitted) return;

  if (condition === 'constructive') {
    const wordCount = countWords(typedText);
    const minWords = optionsSlide.timing?.minWords ?? 0;
    const maxWords = optionsSlide.timing?.maxWords ?? 999;
    if (!isWithinRange(wordCount, minWords, maxWords)) {
      hint = `Response must be between ${minWords} and ${maxWords} words.`;
      renderResponseConstructive();
      return;
    }
  }

  finalizeSubmission(false);
}

function finalizeSubmission(autoSubmitted) {
  if (hasSubmitted) return;
  hasSubmitted = true;
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('ctrl+enter');
  unregisterHandler('arrow-up');
  unregisterHandler('arrow-down');

  const t4Submitted = Date.now();
  let response = '';
  let selectedOptionIndex = null;
  let isCorrect = null;

  if (condition === 'active') {
    const letter = OPTION_LETTERS[selectedIndex];
    response = (optionsSlide.options || {})[letter] || '';
    selectedOptionIndex = selectedIndex;
    const correctLetter = optionsSlide.options?.correct;
    isCorrect = correctLetter ? letter === correctLetter : null;
  } else {
    response = typedText.trim();
  }

  appendEmbeddedResponse({
    sectionIndex,
    questionText: probeSlide.content || '',
    timestamps: { t1QuestionShown, t2ResponsePhaseStart, t3FirstInput, t4Submitted },
    metrics: {
      thinkingTimeMs: t2ResponsePhaseStart - t1QuestionShown,
      responseTimeMs: t4Submitted - t2ResponsePhaseStart,
      totalTimeMs: t4Submitted - t1QuestionShown,
    },
    response,
    selectedOptionIndex,
    isCorrect,
    autoSubmitted,
  });

  // MARKER STUB [phase 2]: response submitted
  // sendMarker(MARKERS.RESPONSE_SUBMITTED);

  // Advance state.currentSlideIndex past the options/textbox slide, onto the
  // guided-resolution slide that always follows it, then hand off.
  setState({ currentSlideIndex: probeIndex + 2 });
  goToPhase('guidedResolution');
}

// ─── Mount / unmount ────────────────────────────────────────────────────────

export function mount(container) {
  containerRef = container;

  const { currentTextIndex, currentSlideIndex, assignedGroup, content } = getState();
  const condition = getCondition(assignedGroup, currentTextIndex);
  const slides = getTextSlides(condition, currentTextIndex);

  probeIndex = currentSlideIndex;
  probeSlide = slides[probeIndex];
  optionsSlide = slides[probeIndex + 1];
  condition = probeSlide?.type === 'active-question-probe' ? 'active' : 'constructive';
  sectionIndex = computeSectionIndex(slides, probeIndex);

  selectedIndex = 0;
  typedText = '';
  hint = '';
  t3FirstInput = null;
  t2ResponsePhaseStart = null;
  hasSubmitted = false;

  if (!probeSlide || !optionsSlide) {
    console.error('[embeddedTask] Missing probe or options/textbox slide at the expected positions.', { probeIndex, probeSlide, optionsSlide });
    return;
  }

  t1QuestionShown = Date.now();

  // MARKER STUB [phase 2]: thinking phase start
  // sendMarker(MARKERS.THINKING_PHASE_START);

  renderThinking();
  startThinkingTimer(content);
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('space');
  unregisterHandler('ctrl+enter');
  unregisterHandler('arrow-up');
  unregisterHandler('arrow-down');
  containerRef = null;
}
