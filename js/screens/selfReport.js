// screens/selfReport.js — Learner Self-Report (pre-experiment, mouse allowed).
// Rebuild plan §6.3 / prototype screen 3.

import { setState } from '../state.js';
import { goToPhase } from '../main.js';

const QUESTIONS = [
  { key: 'generalLearningInclination', text: '1. Rate your inclination towards learning in general.' },
  { key: 'outOfDomainLearningInclination', text: '2. Rate your inclination towards learning topics outside your domain / degree.' },
  { key: 'inDomainLearningInclination', text: '3. Rate your inclination towards learning topics from your domain / degree.' },
];

let containerRef = null;
let answers = {};
let reflection = '';

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
      <div class="form-card wide">
        <span class="eyebrow">Before we begin</span>
        <h1>Learner Self-Report</h1>
        <p class="subtitle">Please answer all items. Likert scale: 1 to 7.</p>

        ${QUESTIONS.map((q) => `
          <div class="likert-item">
            <div class="likert-q">${q.text}</div>
            ${likertScaleHtml(q.key)}
            <div class="likert-labels"><span>Not at all</span><span>Very much</span></div>
          </div>
        `).join('')}

        <div class="likert-item">
          <div class="likert-q">4. How do you feel about your academic intelligence?</div>
          <textarea class="free-resp-area" id="field-reflection" placeholder="Write your response here…">${reflection}</textarea>
        </div>

        <span class="field-error" id="error-selfreport"></span>
        <button type="button" id="btn-continue" class="btn btn-primary">Continue to Instructions →</button>
      </div>
    </div>
  `;

  bindEvents();
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
    });
  });

  containerRef.querySelector('#field-reflection').addEventListener('input', (event) => {
    reflection = event.target.value;
  });

  containerRef.querySelector('#btn-continue').addEventListener('click', handleSubmit);
}

function handleSubmit() {
  const errorEl = containerRef.querySelector('#error-selfreport');
  const allRated = QUESTIONS.every((q) => typeof answers[q.key] === 'number');
  const hasReflection = reflection.trim().length > 0;

  if (!allRated || !hasReflection) {
    errorEl.textContent = 'Please answer all items before continuing.';
    return;
  }
  errorEl.textContent = '';

  setState({
    selfReport: {
      generalLearningInclination: answers.generalLearningInclination,
      outOfDomainLearningInclination: answers.outOfDomainLearningInclination,
      inDomainLearningInclination: answers.inDomainLearningInclination,
      academicIntelligenceReflection: reflection.trim(),
      submittedAt: Date.now(),
    },
  });

  goToPhase('instructions');
}

export function mount(container) {
  containerRef = container;
  answers = {};
  reflection = '';
  render();
}

export function unmount() {
  containerRef = null;
}
