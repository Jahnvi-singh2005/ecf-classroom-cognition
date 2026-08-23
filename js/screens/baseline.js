// screens/baseline.js — Baseline Recording (EEG mode only). Rebuild plan §6.5.
// No buttons except "Skip baseline" — auto-advances at max time. Only ever mounted
// when eegMode is true (instructions.js decides that), so no eegMode check here.

import { getState } from '../state.js';
import { startTimer } from '../timer.js';
import { goToPhase } from '../main.js';

let containerRef = null;
let cancelTimer = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span>
      <span class="topbar-badge">EEG Mode</span>
    </div>
    <div class="fixation-screen">
      <div class="fixation-cross">+</div>
      <div class="fixation-label">Baseline recording — please sit still and relax</div>
      <div style="font-size:13px;color:var(--muted);margin-top:8px;text-align:center;max-width:380px;line-height:1.6;">Keep your eyes on the cross. Try not to move or blink more than necessary.</div>
    </div>
    <button type="button" id="btn-skip" class="btn btn-ghost eeg-skip-link">Skip baseline</button>
  `;

  containerRef.querySelector('#btn-skip').addEventListener('click', advance);
}

function advance() {
  if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  // MARKER STUB [phase 2]: baseline end
  // sendMarker(MARKERS.BASELINE_END);
  goToPhase('fixation');
}

export function mount(container) {
  containerRef = container;
  render();

  const { content } = getState();
  const durationMs = content?.globalTimingDefaults?.baseline?.maxMs;

  // MARKER STUB [phase 2]: baseline start
  // sendMarker(MARKERS.BASELINE_START);

  // Missing timing config means no auto-advance — "Skip baseline" is still available.
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
