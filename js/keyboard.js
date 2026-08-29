// keyboard.js — global keyboard event management. Registered once on app init.
// Each screen registers its handlers on mount and unregisters on unmount, so no
// stale handlers fire on the wrong screen.
//
// Once the experiment proper begins, navigation is arrow-keys-only: ArrowRight
// advances/submits, ArrowUp/ArrowDown navigate MC options, ArrowLeft is a
// permanent no-op. A global guard (scoped to EXPERIMENT_PHASES below) swallows
// all four arrow keys for the whole in-experiment duration so they never scroll
// the page or move a textarea cursor, regardless of whether a handler is
// registered for the current screen. Pre-experiment screens, the consent flow,
// and the settings panel are untouched — arrow keys behave normally there.

import { getState } from './state.js';

const _handlers = new Map();

const EXPERIMENT_PHASES = [
  'experimentStart', 'baseline', 'fixation', 'stimulus',
  'embeddedTask', 'guidedResolution', 'praIntro', 'pra',
];

export function registerHandler(key, handler) {
  _handlers.set(key, handler);
}

export function unregisterHandler(key) {
  _handlers.delete(key);
}

export function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    if (!isArrowKey || !EXPERIMENT_PHASES.includes(getState().phase)) return;

    // Prevent page scroll / textarea cursor movement for every arrow key,
    // for the whole experiment duration — independent of whether a handler
    // is registered for the current screen.
    e.preventDefault();

    if (e.key === 'ArrowRight') { _handlers.get('arrow-right')?.(); return; }
    if (e.key === 'ArrowUp') { _handlers.get('arrow-up')?.(); return; }
    if (e.key === 'ArrowDown') { _handlers.get('arrow-down')?.(); return; }
    // ArrowLeft: swallowed above, intentionally no handler — permanent no-op.
  });
}
