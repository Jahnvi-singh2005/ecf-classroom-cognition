// eeg.js — EEG mode logic: full-screen enforcement, tab-switch lock + visibility
// logging, EEG background colour, and the LSL bridge connectivity check used on the
// registration screen. Marker transport is phase 2 (see EEG_ARCHITECTURE.md) — every
// marker point in the screen modules carries an inert `MARKER STUB [phase 2]` comment
// pair and this file sends nothing over the wire.

import { getState, setState } from './state.js';

const LSL_BRIDGE_URL = 'ws://localhost:8765';
const LSL_CHECK_TIMEOUT_MS = 1500;

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
    document.documentElement.requestFullscreen().catch(() => undefined);
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

function enforceFullScreen() {
  document.documentElement.requestFullscreen().catch(() => undefined);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
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
      // MARKER STUB [phase 2]: tab hidden detected
      // sendMarker(MARKERS.TAB_HIDDEN);
      showBlockingOverlay('tab-switch');
    } else {
      logVisibilityEvent('visible');
      // MARKER STUB [phase 2]: tab visible (returned)
      // sendMarker(MARKERS.TAB_VISIBLE);
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
  // MARKER STUB [phase 2]: session start
  // sendMarker(MARKERS.SESSION_START);
}

// Attempts a WebSocket connection to the Python bridge. Resolves true if it opens,
// false otherwise (bridge not running, connection refused, or timeout). Used by the
// registration screen to show the amber "LSL bridge not connected" banner.
export function checkLSLConnection() {
  return new Promise((resolve) => {
    let settled = false;
    let socket;

    try {
      socket = new WebSocket(LSL_BRIDGE_URL);
    } catch {
      console.warn('[EEG MODE] WARNING: LSL bridge not connected. Markers will not be sent.');
      resolve(false);
      return;
    }

    const finish = (connected) => {
      if (settled) return;
      settled = true;
      if (!connected) {
        console.warn('[EEG MODE] WARNING: LSL bridge not connected. Markers will not be sent.');
      }
      resolve(connected);
    };

    socket.addEventListener('open', () => {
      finish(true);
      socket.close();
    });
    socket.addEventListener('error', () => finish(false));

    setTimeout(() => finish(false), LSL_CHECK_TIMEOUT_MS);
  });
}
