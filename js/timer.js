// timer.js — timing utilities. Every slide that uses timing must store the returned
// cancel function and call it on cleanup (when navigating away from a slide).

import { getState } from './state.js';

// EEG mode — requestAnimationFrame loop.
function startTimerRaf({ onTick, onComplete, durationMs }) {
  const startTime = performance.now();
  let rafId;

  function tick() {
    const elapsed = Math.min(performance.now() - startTime, durationMs);
    onTick(elapsed);
    if (elapsed >= durationMs) {
      onComplete();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

// Non-EEG mode — setInterval, 100ms ticks.
function startTimerInterval({ onTick, onComplete, durationMs }) {
  const startTime = performance.now();
  const id = setInterval(() => {
    const elapsed = Math.min(Math.round(performance.now() - startTime), durationMs);
    onTick(elapsed);
    if (elapsed >= durationMs) {
      clearInterval(id);
      onComplete();
    }
  }, 100);
  return () => clearInterval(id);
}

// Selects the correct implementation based on getState().eegMode.
export function startTimer({ onTick, onComplete, durationMs }) {
  const { eegMode } = getState();
  return eegMode
    ? startTimerRaf({ onTick, onComplete, durationMs })
    : startTimerInterval({ onTick, onComplete, durationMs });
}
