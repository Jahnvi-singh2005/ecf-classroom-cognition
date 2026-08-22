// screens/done.js — Session Complete. Build-spec §11.12 / rebuild plan §6.12.
// No buttons, no input. Final Firestore writes fire when this screen mounts.

import { getState, setState } from '../state.js';
import { writeSession, writeParticipant, writeParticipantSession, completeDraft } from '../firebase.js';
import { exitFullScreen } from '../eeg.js';

let containerRef = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="center-wrap">
      <div class="break-inner">
        <div class="done-icon-wrap">✓</div>
        <span class="eyebrow">Session complete</span>
        <h2>Thank you</h2>
        <p class="subtitle" style="margin-bottom:0;">All four texts and assessments are complete. Please inform the experimenter that you have finished.</p>
        <p style="font-size:13px;color:var(--muted);margin-top:12px;">Session data has been saved. View all session logs at <strong style="color:var(--accent);">/history</strong></p>
      </div>
    </div>
  `;
}

function showErrorBanner(error) {
  if (!containerRef) return;
  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.innerHTML = `<div class="banner-dot"></div>Could not save session data (${error?.message || 'unknown error'}). Your progress was kept as a draft — please notify the experimenter.`;
  containerRef.prepend(banner);
}

// Only the session-record fields (build-spec §5.2) — not the full draft-shaped
// state, which also carries phase/currentSlideIndex/content and other draft-only
// bookkeeping that has no place in the final document.
function buildSessionPayload() {
  const state = getState();
  return {
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
    visibilityEvents: state.visibilityEvents,
    eventLog: state.eventLog,
  };
}

export async function mount(container) {
  containerRef = container;
  render();
  exitFullScreen();

  const { sessionId, participantKey } = getState();
  const payload = buildSessionPayload();
  setState({ sessionEndTime: payload.sessionEndTime });

  // MARKER STUB [phase 2]: session end
  // sendMarker(MARKERS.SESSION_END);

  try {
    await writeSession(sessionId, payload);
    await writeParticipant(participantKey, { participant: payload.participant });
    await writeParticipantSession(participantKey, sessionId, payload);
    await completeDraft(sessionId);
  } catch (error) {
    console.error('[done] Failed to write final session data. Draft left in place so data is not lost.', error);
    showErrorBanner(error);
  }
}

export function unmount() {
  containerRef = null;
}
