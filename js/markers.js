// markers.js — EEG event marker IDs + transport. Sends markers over a Web Serial
// connection to recorder_final.py as bare integer strings terminated by a newline
// (e.g. "220\n") whenever eegMode is active. No-op entirely outside EEG mode.

import { getState } from './state.js';

export const MARKERS = Object.freeze({
  // Session
  SESSION_START: 100,
  SESSION_END: 101,

  // Reserved — connectivity test only, never part of the experiment scheme
  TEST_PING: 255,

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

const textEncoder = new TextEncoder();

let serialPort = null;
let serialWriter = null;

// Prompts the experimenter to pick a serial port and opens it at 115200 baud.
// Called from the EEG toggle handler on registration — a click is a valid user
// gesture for requestPort(). Resolves true on success, false on cancel/error.
export async function initSerialPort() {
  if (!navigator.serial) {
    alert('Web Serial API not supported. Please use Chrome or Edge.');
    return false;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });
    serialWriter = serialPort.writable.getWriter();
    console.log('[EEG] Serial port opened');
    return true;
  } catch {
    console.log('[EEG] Serial port failed to open');
    return false;
  }
}

// `force` bypasses the eegMode gate — used only by the registration screen's
// Send Test Marker button, which fires before eegMode is set in state.
export function sendMarker(markerId, { force = false } = {}) {
  if (!force && getState().eegMode !== true) return;

  if (!serialWriter) {
    console.log(`[EEG] marker ${markerId} dropped — serial port not open`);
    return;
  }

  const encodedData = textEncoder.encode(markerId.toString() + '\n');
  serialWriter.write(encodedData).catch(() => {
    console.log(`[EEG] marker ${markerId} failed to send`);
  });
}
