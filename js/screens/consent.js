// screens/consent.js — Consent Form (pre-experiment, mouse allowed).
// Content verbatim from the existing repo — rebuild plan §6.2 / prototype screen 2.

import { setState } from '../state.js';
import { goToPhase } from '../main.js';

let containerRef = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="center-wrap">
      <div class="form-card wide">
        <span class="eyebrow">Before we begin</span>
        <h1>Consent Form</h1>
        <p class="subtitle">Please read and confirm before starting the experiment.</p>
        <div class="consent-body">
          <p>I voluntarily agree to participate in this study.</p>
          <p>I have had the purpose and nature of the study explained to me in writing and I have had the opportunity to ask questions about the study.</p>
          <p>I understand that I am free to contact any of the people involved in the research to seek further clarification and information.</p>
        </div>
        <div class="consent-check-row">
          <input type="checkbox" id="consent-check"/>
          <label for="consent-check">I give my consent</label>
        </div>
        <button type="button" id="btn-continue" class="btn btn-primary" disabled>Start Experiment →</button>
      </div>
    </div>
  `;

  const checkbox = containerRef.querySelector('#consent-check');
  const button = containerRef.querySelector('#btn-continue');

  checkbox.addEventListener('change', () => {
    button.disabled = !checkbox.checked;
  });

  button.addEventListener('click', () => {
    if (!checkbox.checked) return;

    setState({
      consent: {
        consentGiven: true,
        consentedAt: Date.now(),
        statementVersion: 'v1',
      },
    });

    goToPhase('selfReport');
  });
}

export function mount(container) {
  containerRef = container;
  render();
}

export function unmount() {
  containerRef = null;
}
