// screens/pra.js — Post-Reading Assessment. Build-spec §11.10 / rebuild plan §6.10.
// No buttons, no mouse interaction. 6 questions per text, one per screen, in array
// order. Each question: thinking phase (auto-advance only) -> response phase
// (MC: arrow keys + ArrowRight; written: type + ArrowRight gated by word count).
// Correct MC answers are never revealed here (rebuild plan §6.10).

import { getState, setState } from '../state.js';
import { getPraQuestions } from '../content.js';
import { startTimer } from '../timer.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { renderMarkdown } from '../utils/markdown.js';
import { countWords, isWithinRange } from '../utils/wordCount.js';
import { isTestingMode } from '../testingMode.js';
import { goToPhase } from '../main.js';
import { sendMarker, MARKERS } from '../markers.js';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const TOTAL_QUESTIONS = 6;

let containerRef = null;
let cancelTimer = null;

let questions = [];
let questionIndex = 0;
let question = null;

let selectedIndex = null;
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

  // Testing mode: no auto-advance timer at all — thinking phase otherwise has no
  // manual escape, so ArrowRight becomes the only way forward.
  if (isTestingMode()) {
    registerHandler('arrow-right', enterResponsePhase);
    return;
  }

  // Missing timing config means no auto-advance for this phase.
  if (!maxMs) return;

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
          <div class="kbd-hint"><kbd class="kbd">→</kbd> to submit</div>
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
  selectedIndex = selectedIndex === null
    ? OPTION_LETTERS.length - 1
    : (selectedIndex + OPTION_LETTERS.length - 1) % OPTION_LETTERS.length;
  updateMcSelection();
  markFirstInput();
  sendMarker(MARKERS.PRA_NAVIGATE);
}

function handleArrowDown() {
  selectedIndex = selectedIndex === null ? 0 : (selectedIndex + 1) % OPTION_LETTERS.length;
  updateMcSelection();
  markFirstInput();
  sendMarker(MARKERS.PRA_NAVIGATE);
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
        <div class="task-question">${renderMarkdown(question.prompt || '')}</div>
        <div class="word-count-row">
          <span class="word-count-label">Word count</span>
          <span class="word-count-val ${inRange ? '' : 'warn'}">${wordCount} / ${maxWords}</span>
        </div>
        <textarea class="free-resp-area" id="field-response" style="min-height:140px;">${typedText}</textarea>
        ${hint ? `<p class="field-error">${hint}</p>` : ''}
        <div class="task-footer">
          <div class="kbd-hint">${minWords}–${maxWords} words required to submit</div>
          <div class="kbd-hint"><kbd class="kbd">→</kbd> to submit</div>
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
  unregisterHandler('arrow-right'); // clears the testing-mode thinking-phase skip, if any
  t2ResponsePhaseStart = Date.now();

  const { content } = getState();
  const isWritten = question.type === 'written';
  const globalKey = isWritten ? 'praWrittenTextBox' : 'praMcOptions';
  const defaults = content?.globalTimingDefaults?.[globalKey];
  const maxMs = question.timing?.responseMaxMs ?? defaults?.maxMs;

  sendMarker(isWritten ? MARKERS.PRA_RESPOND_WRITTEN : MARKERS.PRA_RESPOND_MC);

  if (isWritten) {
    renderResponseWritten();
  } else {
    selectedIndex = null; // nothing pre-highlighted — first arrow key selects an option
    renderResponseMc();
    registerHandler('arrow-up', handleArrowUp);
    registerHandler('arrow-down', handleArrowDown);
  }
  registerHandler('arrow-right', handleSubmit);

  // Testing mode: no forced auto-submit — ArrowRight (already registered above,
  // still gated by word-count enforcement) is the only way to submit.
  if (isTestingMode()) return;

  // Missing timing config means no forced auto-submit — ArrowRight still works.
  if (!maxMs) return;

  cancelTimer = startTimer({
    onTick: () => {},
    onComplete: () => finalizeSubmission(true),
    durationMs: maxMs,
  });
}

function handleSubmit() {
  if (hasSubmitted) return;

  if (question.type !== 'written' && selectedIndex === null) {
    return;
  }

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
  unregisterHandler('arrow-right');
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

  sendMarker(question.type === 'written' ? MARKERS.PRA_SUBMIT_WRITTEN : MARKERS.PRA_SUBMIT_MC);

  advanceToNextQuestion();
}

function advanceToNextQuestion() {
  const nextIndex = questionIndex + 1;

  if (nextIndex >= questions.length) {
    sendMarker(MARKERS.PRA_END);

    finalizeText();
    setState({ currentPraIndex: 0 });

    goToPhase('postTextFeedback');
    return;
  }

  setState({ currentPraIndex: nextIndex });
  goToPhase('pra');
}

export function mount(container) {
  containerRef = container;

  const { currentTextIndex, currentPraIndex, content } = getState();
  questions = getPraQuestions(currentTextIndex);
  questionIndex = currentPraIndex;
  question = questions[questionIndex];

  selectedIndex = null;
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
    sendMarker(MARKERS.PRA_START);
  }
  sendMarker(question.type === 'written' ? MARKERS.PRA_QUESTION_ONSET_WRITTEN : MARKERS.PRA_QUESTION_ONSET_MC);
  sendMarker(MARKERS.PRA_THINK_START);

  renderThinking();
  startThinkingTimer(content);
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  unregisterHandler('arrow-right');
  unregisterHandler('arrow-up');
  unregisterHandler('arrow-down');
  containerRef = null;
}
