// exitSession.js — persistent "Exit Session" corner button, shown throughout the
// experiment once a session exists. Appended directly to <body> (not #app) so it
// survives every screen's innerHTML rebuild, instead of duplicating markup into
// every screen file — main.js's goToPhase() shows/hides it based on phase.

import { getState } from './state.js';
import { writeSession, writeParticipant, writeParticipantSession, completeDraft } from './firebase.js';
import { exitFullScreen } from './eeg.js';

let buttonEl = null;

export function showExitSessionButton() {
  if (buttonEl) return;
  buttonEl = document.createElement('button');
  buttonEl.type = 'button';
  buttonEl.id = 'exit-session-btn';
  buttonEl.textContent = 'Exit Session';
  buttonEl.addEventListener('click', handleExitClick);
  document.body.appendChild(buttonEl);
}

export function hideExitSessionButton() {
  if (!buttonEl) return;
  buttonEl.remove();
  buttonEl = null;
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

async function handleExitClick() {
  const confirmed = window.confirm('Are you sure you want to end this session? This cannot be undone.');
  if (!confirmed) return;

  const state = getState();

  try {
    await writeAbandonedSession(state);
  } catch (error) {
    console.error('[exitSession] Failed to write abandoned session record.', error);
  }

  exitFullScreen();
  window.location.href = '/index.html';
}
