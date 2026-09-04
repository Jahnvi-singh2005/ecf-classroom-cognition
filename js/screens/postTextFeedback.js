// screens/postTextFeedback.js — Post-Text Feedback. Shown after each text's PRA
// completes, before the break/next-text screen (or 'done' after the final text —
// same fork pra.js used to make itself; moved here since submission is the gate now).
// 10 Likert items (1–7), all required before Submit is enabled.
//
// Responses are appended to state (same pattern as PRA responses in pra.js) and
// picked up by the periodic draft autosave / the final session write in done.js —
// no separate immediate Firestore write here.

import { getState, setState } from '../state.js';
import { isTestingMode } from '../testingMode.js';
import { goToPhase } from '../main.js';

const QUESTIONS = [
  { key: 'perceivedDifficulty', text: 'How difficult was this text to read?', low: 'Low', high: 'High' },
  { key: 'perceivedEngagement', text: 'How engaging did you find this text?', low: 'Low', high: 'High' },
  { key: 'perceivedConfusion', text: 'How confused did you feel while reading?', low: 'Low', high: 'High' },
  { key: 'perceivedEffort', text: 'How much effort did you put into this task?', low: 'Low', high: 'High' },
  {
    key: 'confidenceInAnswers',
    text: 'How confident are you in the answers you just gave?',
    low: 'Not confident at all',
    high: 'Completely confident',
  },
  {
    key: 'understandingImproved',
    text: 'I understand this topic better now than before I read the text.',
    low: 'Strongly disagree',
    high: 'Strongly agree',
  },
  {
    key: 'priorFamiliarity',
    text: 'How much did you already know about this topic before reading?',
    low: 'Not familiar at all',
    high: 'Well aware of the topic',
  },
  {
    key: 'difficultyMeaningful',
    text: 'The difficulty in this text felt worthwhile, not just confusing.',
    low: 'Completely confusing',
    high: 'Completely meaningful',
  },
  {
    key: 'requiredInference',
    text: 'This task required me to think beyond what the text directly stated.',
    low: 'Strongly disagree',
    high: 'Strongly agree',
  },
  {
    key: 'attentionFluctuation',
    text: 'How often did your mind wander while reading?',
    low: 'Not at all',
    high: 'Did not pay attention at all',
  },
];

let containerRef = null;
let answers = {};

function likertScaleHtml(key) {
  let html = '<div class="likert-scale">';
  for (let i = 1; i <= 7; i += 1) {
    const selected = answers[key] === i ? 'selected' : '';
    html += `<div class="likert-btn ${selected}" data-key="${key}" data-value="${i}">${i}</div>`;
  }
  html += '</div>';
  return html;
}

function render() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="center-wrap" style="align-items:flex-start;padding-top:40px;overflow-y:auto;">
      <div class="form-card wide" style="width:960px;max-width:94vw;">
        <span class="eyebrow">After this text</span>
        <h1>Feedback</h1>
        <p class="subtitle">Rate each item from 1 (low) to 7 (high).</p>

        <div class="field-row">
          ${QUESTIONS.map((q) => `
            <div class="likert-item">
              <div class="likert-q">${q.text}</div>
              ${likertScaleHtml(q.key)}
              <div class="likert-labels"><span>${q.low}</span><span>${q.high}</span></div>
            </div>
          `).join('')}
        </div>

        <button type="button" id="btn-submit" class="btn btn-primary" disabled>Submit feedback &amp; continue →</button>
      </div>
    </div>
  `;

  bindEvents();
}

function updateSubmitState() {
  const button = containerRef.querySelector('#btn-submit');
  if (button) button.disabled = !QUESTIONS.every((q) => typeof answers[q.key] === 'number');
}

function bindEvents() {
  containerRef.querySelectorAll('.likert-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { key } = btn.dataset;
      const value = Number(btn.dataset.value);
      answers[key] = value;
      containerRef.querySelectorAll(`.likert-btn[data-key="${key}"]`).forEach((sibling) => {
        sibling.classList.toggle('selected', Number(sibling.dataset.value) === value);
      });
      updateSubmitState();
    });
  });

  containerRef.querySelector('#btn-submit').addEventListener('click', handleSubmit);
}

function handleSubmit() {
  if (!QUESTIONS.every((q) => typeof answers[q.key] === 'number')) return;

  const { currentTextIndex, postTextFeedback, content } = getState();

  const responses = { submittedAt: Date.now() };
  QUESTIONS.forEach((q) => { responses[q.key] = answers[q.key]; });

  setState({
    postTextFeedback: { ...postTextFeedback, [currentTextIndex]: responses },
  });

  // Break screen is skipped after the final text (rebuild plan §6.11).
  const totalTexts = Object.keys(content?.texts || {}).length;
  const isLastText = currentTextIndex >= totalTexts - 1;
  goToPhase(isLastText ? 'done' : 'breakScreen');
}

export function mount(container) {
  containerRef = container;
  answers = {};
  if (isTestingMode()) {
    fillTestData();
  }
  render();
}

// Testing mode bypasses the need to hand-fill every item on each test run —
// values are pre-set before the first render, same as registration.js's and
// selfReport.js's fillTestData, so "Submit feedback & continue" works with a
// single click.
function fillTestData() {
  QUESTIONS.forEach((q) => { answers[q.key] = 4; });
}

export function unmount() {
  containerRef = null;
}
