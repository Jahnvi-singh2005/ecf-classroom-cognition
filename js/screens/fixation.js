// screens/fixation.js — Fixation Cross (EEG mode only). Rebuild plan §6.6.
// Shown before each of the 4 texts. No buttons, auto-advances at the fixed duration.
// Only ever mounted when eegMode is true — the screen before each fork point (this
// module's callers) decides that, so this module never checks eegMode itself.

import { getState } from '../state.js';
import { startTimer } from '../timer.js';
import { goToPhase } from '../main.js';
import { sendMarker, MARKERS } from '../markers.js';

let containerRef = null;
let cancelTimer = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span>
      <span class="topbar-badge">EEG Mode</span>
    </div>
    <div class="fixation-screen"><div class="fixation-cross">+</div></div>
  `;
}

function advance() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  sendMarker(MARKERS.FIXATION_OFFSET);
  goToPhase('stimulus');
}

export function mount(container) {
  containerRef = container;
  render();

  const { content } = getState();
  const durationMs = content?.globalTimingDefaults?.fixationCross?.durationMs;

  sendMarker(MARKERS.FIXATION_ONSET);

  // Missing timing config means no auto-advance.
  if (!durationMs) return;

  cancelTimer = startTimer({
    onTick: () => {},
    onComplete: advance,
    durationMs,
  });
}

export function unmount() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  containerRef = null;
}
