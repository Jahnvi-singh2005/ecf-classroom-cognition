// eeg.js — EEG mode logic: full-screen enforcement, tab-switch lock + visibility
// logging, EEG background colour, and the serial port connectivity check used on the
// registration screen. Event markers are sent via markers.js's sendMarker().

import { getState, setState } from './state.js';
import { sendMarker, MARKERS } from './markers.js';

let overlayEl = null;
let blockingKeydownGuard = null;

function logVisibilityEvent(type) {
  const { visibilityEvents, phase } = getState();
  setState({
    visibilityEvents: [
      ...visibilityEvents,
      { timestamp: Date.now(), type, context: phase },
    ],
  });
}

function showBlockingOverlay(reason) {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'eeg-blocking-overlay';
  overlayEl.innerHTML = `
    <div class="eeg-blocking-card">
      <p class="eeg-blocking-message">${
        reason === 'full-screen'
          ? 'Please return to full screen to continue.'
          : 'Please return to this tab to continue.'
      }</p>
      <button type="button" class="btn btn-primary eeg-blocking-btn">Return to full screen</button>
    </div>
  `;

  overlayEl.querySelector('.eeg-blocking-btn').addEventListener('click', () => {
    requestFullScreen();
  });

  document.body.appendChild(overlayEl);

  // Session paused — no keyboard handlers active while overlay visible.
  // Captured ahead of keyboard.js's bubble-phase listener so registered
  // screen handlers never fire while the overlay is up.
  blockingKeydownGuard = (event) => event.stopImmediatePropagation();
  document.addEventListener('keydown', blockingKeydownGuard, { capture: true });
}

function hideBlockingOverlay() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;

  if (blockingKeydownGuard) {
    document.removeEventListener('keydown', blockingKeydownGuard, { capture: true });
    blockingKeydownGuard = null;
  }
}

// Requested unconditionally on experiment start (see instructions.js), and again
// here for EEG mode's fullscreen-exit enforcement below.
export function requestFullScreen() {
  document.documentElement.requestFullscreen().catch(() => undefined);
}

export function exitFullScreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => undefined);
  }
}

function enforceFullScreen() {
  requestFullScreen();
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      sendMarker(MARKERS.FULLSCREEN_EXIT);
      showBlockingOverlay('full-screen');
    } else {
      hideBlockingOverlay();
    }
  });
}

function lockTabSwitching() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      logVisibilityEvent('hidden');
      sendMarker(MARKERS.TAB_HIDDEN);
      showBlockingOverlay('tab-switch');
    } else {
      logVisibilityEvent('visible');
      sendMarker(MARKERS.TAB_VISIBLE);
      hideBlockingOverlay();
    }
  });
}

export function applyBackgroundClass(eegMode) {
  document.body.classList.toggle('eeg-mode', Boolean(eegMode));
}

export function initEEGMode() {
  applyBackgroundClass(true);
  enforceFullScreen();
  lockTabSwitching();
  sendMarker(MARKERS.SESSION_START);
}

