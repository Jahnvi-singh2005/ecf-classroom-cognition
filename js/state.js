// state.js — single session state singleton. Plain JS object, no framework.
// All screens read via getState() and write via setState(); no props passing, no event bus.

function createInitialState() {
  return {
    sessionId: null,
    participantKey: null,
    participant: {},
    assignedGroup: null,
    eegMode: false,
    sessionStartTime: null,
    sessionEndTime: null,
    currentTextIndex: 0,
    currentSlideIndex: 0,
    currentPraIndex: 0,
    phase: null,
    content: null,          // loaded from Firestore on session start
    selfReport: null,        // written after the Learner Self-Report screen
    consent: null,           // written after the Consent screen
    texts: [],               // session text results being built up
    postTextFeedback: {},    // keyed by textIndex — written after each text's PRA
    eventLog: [],
    visibilityEvents: [],
    draftTimer: null,        // reference to auto-save interval
  };
}

let _state = createInitialState();

export function getState() {
  return { ..._state };
}

export function setState(partial) {
  Object.assign(_state, partial);
}

export function resetState() {
  _state = createInitialState();
}
