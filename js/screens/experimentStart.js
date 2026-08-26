// screens/experimentStart.js — "Experiment starts" announcement slide. Shown once,
// right after Experiment Instructions, before the participant reads the first text
// (before baseline/fixation in EEG mode, or straight into the first reading slide
// otherwise). No buttons, no mouse interaction — Spacebar is the only way forward,
// matching the reading-slide convention (visual style reused from stimulus.js's
// per-text title slide).

import { getState } from '../state.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { goToPhase } from '../main.js';

let containerRef = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="reading-layout">
      <div class="reading-body title-slide-body">
        <div class="title-slide-card">
          <h1 class="title-slide-heading">The experiment starts now</h1>
          <p class="title-slide-author">From this point on, use only the keyboard to navigate.</p>
        </div>
      </div>
      <div class="reading-footer">
        <div class="kbd-hint"><kbd class="kbd">Spacebar</kbd> to begin</div>
      </div>
    </div>
  `;

  registerHandler('space', advance);
}

function advance() {
  unregisterHandler('space');
  const { eegMode } = getState();
  goToPhase(eegMode ? 'baseline' : 'stimulus');
}

export function mount(container) {
  containerRef = container;
  render();
}

export function unmount() {
  unregisterHandler('space');
  containerRef = null;
}
