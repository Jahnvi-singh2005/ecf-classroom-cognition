// markers.js — EEG event marker IDs + transport. Sends markers over WebSocket to the
// local LSL bridge (ws://localhost:8765, same endpoint eeg.js's checkLSLConnection()
// probes) whenever eegMode is active. No-op entirely outside EEG mode.

import { getState } from './state.js';

export const MARKERS = Object.freeze({
  // Session
  SESSION_START: 100,
  SESSION_END: 101,

  // Baseline
  BASELINE_START: 110,
  BASELINE_END: 111,

  // Fixation
  FIXATION_ONSET: 120,
  FIXATION_OFFSET: 121,

  // Title slide onset by condition
  TITLE_ONSET_PASSIVE: 200,
  TITLE_ONSET_ACTIVE: 201,
  TITLE_ONSET_CONSTRUCTIVE: 202,
  TITLE_ONSET_CONTROL: 203,

  // Slide onset by condition
  SLIDE_ONSET_PASSIVE: 210,
  SLIDE_ONSET_ACTIVE: 211,
  SLIDE_ONSET_CONSTRUCTIVE: 212,
  SLIDE_ONSET_CONTROL: 213,

  // Slide advance
  SLIDE_ADVANCE_KEY: 220,
  SLIDE_ADVANCE_TIMEOUT: 221,

  // Embedded task — Active
  EMBED_THINK_ACTIVE: 300,
  EMBED_RESPOND_ACTIVE: 310,
  EMBED_SUBMIT_ACTIVE: 320,
  EMBED_NAVIGATE_ACTIVE: 330,

  // Embedded task — Constructive
  EMBED_THINK_CONSTRUCTIVE: 301,
  EMBED_RESPOND_CONSTRUCTIVE: 311,
  EMBED_SUBMIT_CONSTRUCTIVE: 321,

  // Guided resolution
  GUIDED_ONSET: 340,
  GUIDED_DISMISSED: 341,

  // PRA
  PRA_START: 400,
  PRA_END: 401,
  PRA_QUESTION_ONSET_MC: 410,
  PRA_QUESTION_ONSET_WRITTEN: 411,
  PRA_THINK_START: 420,
  PRA_RESPOND_MC: 430,
  PRA_RESPOND_WRITTEN: 431,
  PRA_SUBMIT_MC: 440,
  PRA_SUBMIT_WRITTEN: 441,
  PRA_NAVIGATE: 450,

  // Post-text feedback
  FEEDBACK_ONSET: 500,
  FEEDBACK_SUBMITTED: 501,

  // Break
  BREAK_ONSET: 510,
  BREAK_DISMISSED: 511,

  // EEG integrity
  TAB_HIDDEN: 600,
  TAB_VISIBLE: 601,
  FULLSCREEN_EXIT: 610,
});

const MARKER_SERVER_URL = 'ws://localhost:8765';

let socket = null;
let pendingMarkers = [];

function reportFailure(markerIds) {
  markerIds.forEach((markerId) => console.log(`[EEG] marker ${markerId} failed to send`));
}

function flushPending(ws) {
  while (pendingMarkers.length > 0) {
    const markerId = pendingMarkers.shift();
    try {
      ws.send(JSON.stringify({ marker: markerId, timestamp: Date.now() }));
    } catch {
      reportFailure([markerId]);
    }
  }
}

// Reuses an already-open or already-connecting socket; only opens a new one
// (the single reconnect attempt) once the previous socket has closed/errored.
function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }

  let ws;
  try {
    ws = new WebSocket(MARKER_SERVER_URL);
  } catch {
    const stuck = pendingMarkers.splice(0, pendingMarkers.length);
    reportFailure(stuck);
    return null;
  }

  ws.addEventListener('open', () => flushPending(ws));
  ws.addEventListener('close', () => {
    if (socket === ws) socket = null;
    const stuck = pendingMarkers.splice(0, pendingMarkers.length);
    reportFailure(stuck);
  });
  ws.addEventListener('error', () => {
    if (socket === ws) socket = null;
  });

  socket = ws;
  return ws;
}

export function sendMarker(markerId) {
  console.log('[MARKER DEBUG] sendMarker called with', markerId, 'eegMode=', getState().eegMode);
  if (getState().eegMode !== true) return;

  const ws = ensureSocket();
  if (!ws) return;

  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ marker: markerId, timestamp: Date.now() }));
    } catch {
      console.log(`[EEG] marker ${markerId} failed to send`);
    }
    return;
  }

  // Connecting — queue it, flushed on open or reported on close/error above.
  pendingMarkers.push(markerId);
}
