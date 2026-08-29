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

// This screen has no manual advance (no buttons, no keyboard handler) — it must
// always auto-advance. Falls back to this value when globalTimingDefaults.fixationCross
// .durationMs is unset/0 (e.g. a freshly-created project's default config), so a
// missing admin setting can never leave the experiment stuck on the fixation cross.
const DEFAULT_FIXATION_DURATION_MS = 2000;

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
  const durationMs = content?.globalTimingDefaults?.fixationCross?.durationMs || DEFAULT_FIXATION_DURATION_MS;

  sendMarker(MARKERS.FIXATION_ONSET);

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
