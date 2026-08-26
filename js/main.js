// main.js — entry point + phase router for the participant experiment app (index.html).
// Owns the single #app container; every screen module's mount(container)/unmount()
// is called from here. Build-spec §9, §10.

import { getState, setState, resetState } from './state.js';
import { initFirebase, writeDraft, checkIncompleteDraft } from './firebase.js';
import { loadContentIntoState } from './content.js';
import { initKeyboard } from './keyboard.js';
import { initEEGMode } from './eeg.js';
import { showExitSessionButton, hideExitSessionButton } from './exitSession.js';

import * as registration from './screens/registration.js';
import * as consent from './screens/consent.js';
import * as selfReport from './screens/selfReport.js';
import * as instructions from './screens/instructions.js';
import * as baseline from './screens/baseline.js';
import * as fixation from './screens/fixation.js';
import * as stimulus from './screens/stimulus.js';
import * as embeddedTask from './screens/embeddedTask.js';
import * as guidedResolution from './screens/guidedResolution.js';
import * as pra from './screens/pra.js';
import * as postTextFeedback from './screens/postTextFeedback.js';
import * as breakScreen from './screens/breakScreen.js';
import * as done from './screens/done.js';

const SCREENS = {
  registration,
  consent,
  selfReport,
  instructions,
  baseline,
  fixation,
  stimulus,
  embeddedTask,
  guidedResolution,
  pra,
  postTextFeedback,
  breakScreen,
  done,
};

const DRAFT_AUTOSAVE_INTERVAL_MS = 10000;

// Phases the participant navigates purely with the keyboard (no buttons to
// click) — the mouse cursor is hidden there so it doesn't sit on screen as
// a stray, unusable pointer once the experiment proper begins.
const KEYBOARD_ONLY_PHASES = ['fixation', 'stimulus', 'embeddedTask', 'guidedResolution', 'pra'];

let appContainer = null;
let currentScreen = null;
let autosaveIntervalId = null;

export function goToPhase(phaseName) {
  const screenModule = SCREENS[phaseName];
  if (!screenModule) {
    console.error(`[main] Unknown phase "${phaseName}" — no matching screen module.`);
    return;
  }

  if (currentScreen) {
    currentScreen.unmount();
  }

  setState({ phase: phaseName });
  currentScreen = screenModule;
  currentScreen.mount(appContainer);

  // Exit Session is available for the whole experiment — from registration
  // submit (when a session first exists) through to the final PRA/feedback.
  // Hidden before a session exists and after it's already complete.
  if (phaseName === 'registration' || phaseName === 'done') {
    hideExitSessionButton();
  } else {
    showExitSessionButton();
  }

  document.body.classList.toggle('cursor-hidden', KEYBOARD_ONLY_PHASES.includes(phaseName));

  if (phaseName === 'done') {
    stopAutosave();
  } else if (getState().sessionId) {
    startAutosave();
  }
}

function startAutosave() {
  if (autosaveIntervalId !== null) return;
  autosaveIntervalId = window.setInterval(() => {
    const state = getState();
    if (!state.sessionId) return;
    writeDraft(state.sessionId, state).catch((error) => {
      console.error('[main] Periodic draft autosave failed.', error);
    });
  }, DRAFT_AUTOSAVE_INTERVAL_MS);
}

function stopAutosave() {
  if (autosaveIntervalId !== null) {
    window.clearInterval(autosaveIntervalId);
    autosaveIntervalId = null;
  }
}

function resumeFromDraft(draft, content) {
  resetState();
  setState({
    content,
    sessionId: draft.sessionId,
    participantKey: draft.participantKey,
    participant: draft.participant,
    assignedGroup: draft.assignedGroup,
    eegMode: draft.eegMode,
    sessionStartTime: draft.sessionStartTime,
    selfReport: draft.selfReport || null,
    consent: draft.consent || null,
    currentTextIndex: draft.currentTextIndex || 0,
    currentSlideIndex: draft.currentSlideIndex || 0,
    currentPraIndex: draft.currentPraIndex || 0,
    texts: draft.texts || [],
    postTextFeedback: draft.postTextFeedback || {},
    eventLog: draft.eventLog || [],
    visibilityEvents: draft.visibilityEvents || [],
  });

  if (draft.eegMode) {
    // Re-engage full-screen + tab-lock enforcement for the resumed session. Safe to
    // call synchronously here — it runs off the window.confirm() user gesture that
    // triggered this function, so requestFullscreen() is still honoured.
    initEEGMode();
  }

  goToPhase(draft.phase || 'registration');
}

async function initApp() {
  appContainer = document.getElementById('app');

  initKeyboard();
  initFirebase();

  const content = await loadContentIntoState();

  const incompleteDraft = await checkIncompleteDraft();
  if (incompleteDraft) {
    const startedLabel = incompleteDraft.sessionStartTime
      ? new Date(incompleteDraft.sessionStartTime).toLocaleString()
      : 'an earlier time';
    const participantLabel = incompleteDraft.participant?.name || 'a previous participant';
    const shouldResume = window.confirm(
      `An incomplete session was found for ${participantLabel} (started ${startedLabel}). Resume it?`,
    );
    if (shouldResume) {
      resumeFromDraft(incompleteDraft, content);
      return;
    }
  }

  resetState();
  setState({ content });
  goToPhase('registration');
}

initApp();
