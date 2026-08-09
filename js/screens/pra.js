// screens/pra.js — Post-Reading Assessment. Build-spec §11.10 / rebuild plan §6.10.
// No buttons, no mouse interaction. 6 questions per text, one per screen, in array
// order. Each question: thinking phase (auto-advance only) -> response phase
// (MC: arrow keys + Ctrl+Enter; written: type + Ctrl+Enter gated by word count).
// Correct MC answers are never revealed here (rebuild plan §6.10).

import { getState, setState } from '../state.js';
import { getCondition, getPraQuestions } from '../content.js';
import { startTimer } from '../timer.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { renderMarkdown } from '../utils/markdown.js';
import { countWords, isWithinRange } from '../utils/wordCount.js';
import { goToPhase } from '../main.js';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const TOTAL_QUESTIONS = 6;

let containerRef = null;
let cancelTimer = null;

let questions = [];
let questionIndex = 0;
let question = null;

let selectedIndex = 0;
let typedText = '';
let hint = '';

let t1QuestionShown = null;
let t2ResponsePhaseStart = null;
let t3FirstInput = null;
let hasSubmitted = false;

function appendPraResponse(entry) {
  const { texts, currentTextIndex } = getState();
  const updated = texts.map((t) => (
    t.textIndex === currentTextIndex
      ? { ...t, praResponses: [...t.praResponses, entry] }
      : t
  ));
  setState({ texts: updated });
}

function finalizeText() {
  const { texts, currentTextIndex } = getState();
  const updated = texts.map((t) => (
    t.textIndex === currentTextIndex ? { ...t, endTime: Date.now() } : t
  ));
  setState({ texts: updated });
}

function renderHeader() {
  const { currentTextIndex } = getState();
  let dots = '';
  for (let i = 0; i < TOTAL_QUESTIONS; i += 1) {
    const cls = i < questionIndex ? 'done' : i === questionIndex ? 'current' : '';
    dots += `<div class="pra-dot ${cls}"></div>`;
  }
  return `
    <div class="pra-header">
      <span class="pra-tag">Post-Reading Assessment — Text ${currentTextIndex + 1}</span>
      <div class="pra-progress-dots">${dots}</div>
    </div>
  `;
}

// ─── Thinking phase ────────────────────────────────────────────────────────

function renderThinking() {
  const isWritten = question.type === 'written';
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    ${renderHeader()}
    <div class="think-bar-wrap">
      <div class="think-bar-label">Thinking time — read the question carefully</div>
      <div class="think-bar-track"><div class="think-bar-fill" id="think-fill" style="width:0%"></div></div>
    </div>
    <div class="task-body">
      <div class="task-card">
        ${isWritten ? `<span class="eyebrow">${question.wordLimits?.min ?? 0} – ${question.wordLimits?.max ?? 0} words required</span>` : ''}
        <div class="task-question">${renderMarkdown(question.prompt || '')}</div>
        <div style="font-size:13px;color:var(--muted);font-style:italic;">${
          isWritten
            ? 'Your response area will appear when thinking time ends.'
            : 'Options will appear when thinking time ends.'
        }</div>
      </div>
    </div>
  `;
}

function startThinkingTimer(content) {
  const defaults = content?.globalTimingDefaults?.questionProbe;
  const maxMs = question.timing?.thinkingMaxMs ?? defaults?.maxMs;

  if (!maxMs) {
    console.error('[pra] No thinking-phase duration configured (question timing.thinkingMaxMs or globalTimingDefaults.questionProbe.maxMs).');
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

// ─── Response phase — MC (Q1–Q3 by content convention, order is data-driven) ──

function renderResponseMc() {
  const options = question.options || {};
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    ${renderHeader()}
    <div class="task-body" style="padding-top:32px;">
      <div class="task-card">
        <div class="task-question">${renderMarkdown(question.prompt || '')}</div>
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

function updateMcSelection() {
  containerRef.querySelectorAll('.mc-option').forEach((el) => {
    el.classList.toggle('focused', Number(el.dataset.index) === selectedIndex);
  });
}

function markFirstInput() {
  if (t3FirstInput === null) t3FirstInput = Date.now();
}

function handleArrowUp() {
  selectedIndex = (selectedIndex + OPTION_LETTERS.length - 1) % OPTION_LETTERS.length;
  updateMcSelection();
  markFirstInput();
  // MARKER STUB [phase 2]: option navigated (MC)
  // sendMarker(MARKERS.OPTION_NAVIGATED);
}

function handleArrowDown() {
  selectedIndex = (selectedIndex + 1) % OPTION_LETTERS.length;
  updateMcSelection();
  markFirstInput();
  // MARKER STUB [phase 2]: option navigated (MC)
  // sendMarker(MARKERS.OPTION_NAVIGATED);
}

// ─── Response phase — written (Q4–Q6 by content convention) ───────────────────

function renderResponseWritten() {
  const wordCount = countWords(typedText);
  const minWords = question.wordLimits?.min ?? 0;
  const maxWords = question.wordLimits?.max ?? 999;
  const inRange = isWithinRange(wordCount, minWords, maxWords);

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    ${renderHeader()}
    <div class="task-body" style="padding-top:32px;">
      <div class="task-card">
        <span class="eyebrow">${minWords} – ${maxWords} words required</span>
        <div class="task-question">${renderMarkdown(question.prompt || '')}</div>
        <div class="word-count-row">
          <span class="word-count-label">Word count</span>
          <span class="word-count-val ${inRange ? '' : 'warn'}">${wordCount} / ${maxWords}</span>
        </div>
        <textarea class="free-resp-area" id="field-response" style="min-height:140px;">${typedText}</textarea>
        ${hint ? `<p class="field-error">${hint}</p>` : ''}
        <div class="task-footer">
          <div class="kbd-hint">${minWords}–${maxWords} words required to submit</div>
          <div class="kbd-hint"><kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">Enter</kbd> to submit</div>
        </div>
      </div>
    </div>
  `;

  const textarea = containerRef.querySelector('#field-response');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.addEventListener('input', handleWrittenInput);
  textarea.addEventListener('keydown', markFirstInput);
}

function handleWrittenInput(event) {
  typedText = event.target.value;
  const wordCount = countWords(typedText);
  const minWords = question.wordLimits?.min ?? 0;
  const maxWords = question.wordLimits?.max ?? 999;
  const inRange = isWithinRange(wordCount, minWords, maxWords);

  const countEl = containerRef.querySelector('.word-count-val');
  if (countEl) {
    countEl.textContent = `${wordCount} / ${maxWords}`;
    countEl.classList.toggle('warn', !inRange);
  }
}

// ─── Shared response-phase entry / submission ──────────────────────────────

function enterResponsePhase() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  t2ResponsePhaseStart = Date.now();

  const { content } = getState();
  const isWritten = question.type === 'written';
  const globalKey = isWritten ? 'praWrittenTextBox' : 'praMcOptions';
  const defaults = content?.globalTimingDefaults?.[globalKey];
  const maxMs = question.timing?.responseMaxMs ?? defaults?.maxMs;

  // MARKER STUB [phase 2]: response phase start
  // sendMarker(MARKERS.RESPONSE_PHASE_START);

  if (isWritten) {
    renderResponseWritten();
  } else {
    selectedIndex = 0;
    renderResponseMc();
    registerHandler('arrow-up', handleArrowUp);
    registerHandler('arrow-down', handleArrowDown);
  }
  registerHandler('ctrl+enter', handleSubmit);

  if (!maxMs) {
    console.error('[pra] No response-phase duration configured.');
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

  if (question.type === 'written') {
    const wordCount = countWords(typedText);
    const minWords = question.wordLimits?.min ?? 0;
    const maxWords = question.wordLimits?.max ?? 999;
    if (!isWithinRange(wordCount, minWords, maxWords)) {
      hint = `Response must be between ${minWords} and ${maxWords} words.`;
      renderResponseWritten();
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
  let wordCount = null;

  if (question.type === 'written') {
    response = typedText.trim();
    wordCount = countWords(response);
  } else {
    const letter = OPTION_LETTERS[selectedIndex];
    response = (question.options || {})[letter] || '';
    selectedOptionIndex = selectedIndex;
  }

  appendPraResponse({
    questionIndex,
    questionId: question.id,
    questionType: question.type,
    questionText: question.prompt || '',
    timestamps: { t1QuestionShown, t2ResponsePhaseStart, t3FirstInput, t4Submitted },
    metrics: {
      thinkingTimeMs: t2ResponsePhaseStart - t1QuestionShown,
      responseTimeMs: t4Submitted - t2ResponsePhaseStart,
      totalTimeMs: t4Submitted - t1QuestionShown,
    },
    response,
    selectedOptionIndex,
    wordCount,
    autoSubmitted,
  });

  // MARKER STUB [phase 2]: response submitted
  // sendMarker(MARKERS.RESPONSE_SUBMITTED);

  advanceToNextQuestion();
}

function advanceToNextQuestion() {
  const nextIndex = questionIndex + 1;

  if (nextIndex >= questions.length) {
    // MARKER STUB [phase 2]: PRA end
    // sendMarker(MARKERS.PRA_END);

    finalizeText();
    setState({ currentPraIndex: 0 });

    // Break screen is skipped after the final text (rebuild plan §6.11).
    const { currentTextIndex, content } = getState();
    const totalTexts = Object.keys(content?.texts || {}).length;
    const isLastText = currentTextIndex >= totalTexts - 1;
    goToPhase(isLastText ? 'done' : 'breakScreen');
    return;
  }

  setState({ currentPraIndex: nextIndex });
  goToPhase('pra');
}

export function mount(container) {
  containerRef = container;

  const { currentTextIndex, currentPraIndex, assignedGroup, content } = getState();
  const condition = getCondition(assignedGroup, currentTextIndex);
  questions = getPraQuestions(condition, currentTextIndex);
  questionIndex = currentPraIndex;
  question = questions[questionIndex];

  selectedIndex = 0;
  typedText = '';
  hint = '';
  t3FirstInput = null;
  t2ResponsePhaseStart = null;
  hasSubmitted = false;

  if (!question) {
    console.error('[pra] No PRA question found at the current index.', { questionIndex, questions });
    return;
  }

  t1QuestionShown = Date.now();

  if (questionIndex === 0) {
    // MARKER STUB [phase 2]: PRA start
    // sendMarker(MARKERS.PRA_START);
  }
  // MARKER STUB [phase 2]: question onset
  // sendMarker(MARKERS.QUESTION_ONSET);
  // MARKER STUB [phase 2]: thinking phase start
  // sendMarker(MARKERS.THINKING_PHASE_START);

  renderThinking();
  startThinkingTimer(content);
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('ctrl+enter');
  unregisterHandler('arrow-up');
  unregisterHandler('arrow-down');
  containerRef = null;
}
