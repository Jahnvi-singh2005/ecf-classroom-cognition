// exitSession.js — Exit Session flow, reachable only via the Cmd+Shift+E /
// Ctrl+Shift+E keyboard shortcut throughout the experiment once a session exists.
// The keydown listener lives on <body> (not #app) so it survives every screen's
// innerHTML rebuild — main.js's goToPhase() enables/disables it based on phase.

import { getState } from './state.js';
import { writeSession, writeParticipant, writeParticipantSession, completeDraft, discardSession } from './firebase.js';
import { exitFullScreen } from './eeg.js';
import { isTestingMode } from './testingMode.js';
import { stopAutosave } from './main.js';

let dialogEl = null;
let overlayEl = null;
let exitShortcutAvailable = false;

function handleExitShortcut(event) {
  if (!exitShortcutAvailable) return;
  const isShortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e';
  if (!isShortcut) return;
  event.preventDefault();
  openExitDialog();
}

document.addEventListener('keydown', handleExitShortcut);

export function enableExitShortcut() {
  exitShortcutAvailable = true;
}

export function disableExitShortcut() {
  exitShortcutAvailable = false;
}

// Same session-record shape/write path as a normal completion (done.js), plus the
// abandoned-specific fields.
async function writeAbandonedSession(state) {
  const payload = {
    sessionId: state.sessionId,
    participantKey: state.participantKey,
    participant: state.participant,
    assignedGroup: state.assignedGroup,
    eegMode: state.eegMode,
    sessionStartTime: state.sessionStartTime,
    sessionEndTime: Date.now(),
    selfReport: state.selfReport,
    consent: state.consent,
    texts: state.texts,
    postTextFeedback: state.postTextFeedback,
    visibilityEvents: state.visibilityEvents,
    eventLog: state.eventLog,
    status: 'abandoned',
    abandonedAt: Date.now(),
  };

  await writeSession(state.sessionId, payload);
  await writeParticipant(state.participantKey, { participant: payload.participant });
  await writeParticipantSession(state.participantKey, state.sessionId, payload);
  await completeDraft(state.sessionId);
}

function openExitDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.id = 'exit-session-dialog';
  dialogEl.innerHTML = `
    <div class="exit-dialog-backdrop">
      <div class="exit-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="exit-dialog-title">
        <h2 id="exit-dialog-title">Exit Session</h2>
        <p>Choose how to exit. Discarding will permanently delete all data collected in this session.</p>
        <div class="exit-dialog-buttons">
          <button type="button" data-action="continue">Continue Session</button>
          <button type="button" data-action="save">Save and Exit</button>
          <button type="button" data-action="discard" class="exit-dialog-danger">Discard and Exit</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialogEl);

  dialogEl.querySelector('[data-action="continue"]').addEventListener('click', closeExitDialog);
  dialogEl.querySelector('[data-action="save"]').addEventListener('click', handleSaveAndExit);
  dialogEl.querySelector('[data-action="discard"]').addEventListener('click', handleDiscardAndExit);
}

function closeExitDialog() {
  if (!dialogEl) return;
  dialogEl.remove();
  dialogEl = null;
}

async function handleSaveAndExit() {
  closeExitDialog();

  const state = getState();

  try {
    await writeAbandonedSession(state);
  } catch (error) {
    console.error('[exitSession] Failed to write abandoned session record.', error);
  }

  exitFullScreen();
  window.location.href = '/index.html';
}

async function handleDiscardAndExit() {
  closeExitDialog();
  stopAutosave();

  const state = getState();
  await performDiscard(state);
}

function showDiscardOverlay(innerHTML) {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'discard-session-overlay';
    document.body.appendChild(overlayEl);
  }
  overlayEl.innerHTML = innerHTML;
}

function hideDiscardOverlay() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
}

async function performDiscard(state) {
  showDiscardOverlay('<div class="discard-overlay-box"><p>Discarding session data…</p></div>');

  try {
    if (!isTestingMode()) {
      await discardSession(state.sessionId, state.participantKey);
    }
    hideDiscardOverlay();
    exitFullScreen();
    window.location.href = '/index.html';
  } catch (error) {
    console.error('[exitSession] Failed to discard session.', error);
    showDiscardOverlay(`
      <div class="discard-overlay-box">
        <p>Discard failed. Please try again or contact the researcher.</p>
        <button type="button" id="discard-retry-btn">Retry</button>
      </div>
    `);
    overlayEl.querySelector('#discard-retry-btn').addEventListener('click', () => performDiscard(state));
  }
}
