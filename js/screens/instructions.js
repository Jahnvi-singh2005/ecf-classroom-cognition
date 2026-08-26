// screens/instructions.js — Experiment Instructions (pre-experiment, mouse allowed).
// Content verbatim — rebuild plan §6.4 / prototype screen 4.
// This is the last mouse-clickable element for the participant until the break screen(s).

import { getState, setState } from '../state.js';
import { initEEGMode, requestFullScreen } from '../eeg.js';
import { goToPhase } from '../main.js';

let containerRef = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="center-wrap">
      <div class="form-card wide">
        <span class="eyebrow">Instructions</span>
        <h1>Experiment Instructions</h1>
        <p class="subtitle">Welcome to this reading experiment. You will read multiple texts presented as slides. Read each slide carefully and stay focused.</p>

        <div class="instr-block">
          <h3>Reading screen controls</h3>
          <ul class="instr-list">
            <li>Each slide has a minimum time before progression is enabled.</li>
            <li>You can continue by pressing <kbd class="kbd">Spacebar</kbd>.</li>
            <li>Each slide also has a maximum time and auto-advances at timeout.</li>
          </ul>
        </div>

        <div class="instr-block">
          <h3>Post-reading response flow (after each text)</h3>
          <ul class="instr-list">
            <li>A question prompt appears.</li>
            <li>Think before responding (thinking window).</li>
            <li>Press <kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">Enter</kbd> to start typing.</li>
            <li>Press <kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">Enter</kbd> again to submit.</li>
            <li>The screen advances automatically at maximum time if needed.</li>
          </ul>
        </div>

        <div class="instr-block" style="background:var(--accent-light);border-left:3px solid var(--accent);">
          <ul class="instr-list">
            <li style="font-weight:500;">You cannot go back to previous questions. Please answer sincerely and concisely.</li>
          </ul>
        </div>

        <button type="button" id="btn-begin" class="btn btn-primary">Begin Experiment →</button>
      </div>
    </div>
  `;

  containerRef.querySelector('#btn-begin').addEventListener('click', handleBegin);
}

// Baseline and fixation are EEG-mode-only screens (rebuild plan §6.5/§6.6). This is the
// one place that decides whether to route through them or straight into the reading
// loop, so baseline.js and fixation.js themselves never need to check eegMode.
function handleBegin() {
  const { eegMode } = getState();
  setState({ currentTextIndex: 0, currentSlideIndex: 0 });

  // Must run synchronously inside this click handler — browsers only honour
  // requestFullscreen() when called directly from a user gesture.
  requestFullScreen();

  if (eegMode) {
    initEEGMode();
  }
  goToPhase('experimentStart');
}

export function mount(container) {
  containerRef = container;
  render();
}

export function unmount() {
  containerRef = null;
}
