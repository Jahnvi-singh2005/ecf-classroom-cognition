// screens/registration.js — Participant Registration (pre-experiment, mouse allowed).
// Rebuild plan §6.1 / prototype screens 1 & 1b.

import { getState, setState } from '../state.js';
import { initSerialPort, sendMarker, MARKERS } from '../markers.js';
import { buildParticipantKey } from '../utils/buildParticipantKey.js';
import { writeDraft, writeParticipant, validatePassword } from '../firebase.js';
import { isTestingMode, setTestingMode } from '../testingMode.js';
import { goToPhase } from '../main.js';

const GROUPS = [1, 2, 3, 4];
const SEX_OPTIONS = ['Male', 'Female'];

function randomGroup() {
  return GROUPS[Math.floor(Math.random() * GROUPS.length)];
}

let containerRef = null;
let currentGroup = randomGroup();
let eegOn = false;
let eegTestOn = false;
let serialConnected = false;

function render() {
  containerRef.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span>
      ${eegOn ? '<span class="topbar-badge">EEG Mode</span>' : ''}
    </div>
    <div id="serial-banner-slot"></div>
    <div class="center-wrap" style="align-items:flex-start;padding-top:40px;overflow-y:auto;">
      <div class="form-card wide">
        <span class="eyebrow">Session Setup</span>
        <h1>Participant Registration</h1>
        <p class="subtitle">Complete all required fields before beginning the session.</p>

        <div class="field-section-label">Experiment Group</div>
        <div class="field-row">
          <div class="field">
            <label>Assigned Group <span>*</span></label>
            <select id="field-group">
              ${GROUPS.map((g) => `<option value="${g}" ${g === currentGroup ? 'selected' : ''}>Group ${g}</option>`).join('')}
            </select>
            <span class="field-hint">Randomly preselected. Override if needed.</span>
          </div>
          <div class="field" style="justify-content:flex-end;">
            <label style="visibility:hidden">x</label>
            <button type="button" id="btn-randomise" class="btn btn-ghost" style="border:1px solid var(--border);font-size:12px;padding:7px 14px;align-self:flex-start;margin-top:4px;">↺ Randomise</button>
          </div>
        </div>

        <div class="field-section-label">Basic Information</div>
        <div class="field-row">
          <div class="field">
            <label>Full Name <span>*</span></label>
            <input type="text" id="field-name" placeholder="Enter full name"/>
            <span class="field-error" id="error-name"></span>
          </div>
          <div class="field">
            <label>Age <span>*</span></label>
            <input type="number" id="field-age" placeholder="e.g. 21"/>
            <span class="field-error" id="error-age"></span>
          </div>
        </div>

        <div class="field-section-label">Academic Profile</div>
        <div class="field-row">
          <div class="field">
            <label>Subject ID <span>*</span></label>
            <input type="text" id="field-subject-id" placeholder="e.g. sub-001"/>
            <span class="field-error" id="error-subject-id"></span>
          </div>
          <div class="field">
            <label>Sex <span>*</span></label>
            <select id="field-sex">
              <option value="">Select</option>
              ${SEX_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <span class="field-error" id="error-sex"></span>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Year of Study <span>*</span></label>
            <input type="text" id="field-year" placeholder="e.g. 3rd Year"/>
            <span class="field-error" id="error-year"></span>
          </div>
          <div class="field">
            <label>Discipline of Study <span>*</span></label>
            <input type="text" id="field-discipline" placeholder="e.g. Computer Science"/>
            <span class="field-error" id="error-discipline"></span>
          </div>
        </div>

        <div class="field-section-label">Contact &amp; Notes</div>
        <div class="field-row">
          <div class="field">
            <label>Email <span style="color:var(--muted);font-weight:400">(optional)</span></label>
            <input type="email" id="field-email" placeholder="participant@example.com"/>
            <span class="field-error" id="error-email"></span>
          </div>
          <div class="field">
            <label>Notes <span style="color:var(--muted);font-weight:400">(optional)</span></label>
            <input type="text" id="field-notes" placeholder="Any additional notes"/>
          </div>
        </div>

        <div class="toggle-row">
          <div class="toggle-info">
            <strong>EEG Mode</strong>
            <span>Enables baseline screen, fixation crosses, LSL markers, and EEG-optimised display</span>
          </div>
          <div class="toggle-switch ${eegOn ? 'on' : ''}" id="eeg-toggle" role="switch" aria-checked="${eegOn}" tabindex="0"></div>
        </div>

        <div class="toggle-row ${!eegOn ? 'toggle-row-disabled' : ''}">
          <div class="toggle-info">
            <strong>EEG Test Mode</strong>
            <span>Fires real EEG markers, but applies Testing Mode's timing/auto-fill overrides so you can run the marker pipeline without sitting through full session timing. Requires EEG Mode.</span>
          </div>
          <div class="toggle-switch ${eegTestOn ? 'on' : ''} ${!eegOn ? 'disabled' : ''}" id="eeg-test-toggle" role="switch" aria-checked="${eegTestOn}" aria-disabled="${!eegOn}" tabindex="0"></div>
        </div>

        ${eegOn && eegTestOn && serialConnected ? `
        <button type="button" id="btn-send-test-marker" class="btn btn-outline-neutral">Send Test Marker</button>
        <span class="test-marker-confirm" id="test-marker-confirm"></span>
        ` : ''}

        <div class="toggle-row">
          <div class="toggle-info">
            <strong>Testing Mode</strong>
            <span>Bypasses all slide timers for development/testing. Password protected — do not leave on for a real session.</span>
          </div>
          <div class="toggle-switch ${isTestingMode() ? 'on' : ''}" id="testing-toggle" role="switch" aria-checked="${isTestingMode()}" tabindex="0"></div>
        </div>

        <span class="field-error" id="error-form"></span>
        <button type="button" id="btn-submit" class="btn btn-primary">Begin Session →</button>
      </div>
    </div>
  `;

  bindEvents();

  if (isTestingMode()) {
    fillTestData();
  }
}

// Testing mode bypasses the need to hand-fill every required field on each test
// run — called right after render() whenever testing mode is on, and again the
// moment it's switched on, so "Begin Session" works immediately either way.
function fillTestData() {
  containerRef.querySelector('#field-name').value = 'Test Participant';
  containerRef.querySelector('#field-age').value = '25';
  containerRef.querySelector('#field-subject-id').value = 'sub-001';
  containerRef.querySelector('#field-sex').value = SEX_OPTIONS[0];
  containerRef.querySelector('#field-year').value = '1st Year';
  containerRef.querySelector('#field-discipline').value = 'Computer Science';
}

function renderSerialBanner(connected) {
  const slot = containerRef?.querySelector('#serial-banner-slot');
  if (!slot) return;
  if (connected === true) {
    slot.innerHTML = '<div class="banner"><div class="banner-dot"></div>Serial port connected.</div>';
  } else if (connected === false) {
    slot.innerHTML = '<div class="banner"><div class="banner-dot"></div>Serial port not selected — EEG mode disabled.</div>';
  } else {
    slot.innerHTML = '';
  }
}

function bindEvents() {
  containerRef.querySelector('#btn-randomise').addEventListener('click', () => {
    currentGroup = randomGroup();
    containerRef.querySelector('#field-group').value = String(currentGroup);
  });

  containerRef.querySelector('#field-group').addEventListener('change', (event) => {
    currentGroup = Number(event.target.value);
  });

  const toggleEl = containerRef.querySelector('#eeg-toggle');
  const onToggle = async () => {
    eegOn = !eegOn;
    // EEG Test Mode requires EEG Mode — turning EEG Mode off takes it with it.
    if (!eegOn) {
      eegTestOn = false;
      serialConnected = false;
    }
    render();
    if (eegOn) {
      const connected = await initSerialPort();
      serialConnected = connected;
      if (!connected) {
        eegOn = false;
        eegTestOn = false;
      }
      render();
      renderSerialBanner(connected);
    }
  };
  toggleEl.addEventListener('click', onToggle);
  toggleEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  });

  const eegTestToggleEl = containerRef.querySelector('#eeg-test-toggle');
  const onEegTestToggle = () => {
    if (!eegOn) return; // disabled while EEG Mode is off
    eegTestOn = !eegTestOn;
    if (eegTestOn) eegOn = true; // enabling it implicitly enables EEG mode
    render();
  };
  eegTestToggleEl.addEventListener('click', onEegTestToggle);
  eegTestToggleEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEegTestToggle();
    }
  });

  const sendTestMarkerBtn = containerRef.querySelector('#btn-send-test-marker');
  sendTestMarkerBtn?.addEventListener('click', handleSendTestMarker);

  const testingToggleEl = containerRef.querySelector('#testing-toggle');
  testingToggleEl.addEventListener('click', handleTestingModeToggle);
  testingToggleEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTestingModeToggle();
    }
  });

  containerRef.querySelector('#btn-submit').addEventListener('click', handleSubmit);
}

function handleSendTestMarker() {
  sendMarker(MARKERS.SESSION_START, { force: true });
  setTimeout(() => sendMarker(MARKERS.TEST_PING, { force: true }), 500);
  setTimeout(() => sendMarker(MARKERS.SESSION_END, { force: true }), 1000);

  const confirmEl = containerRef?.querySelector('#test-marker-confirm');
  if (confirmEl) {
    confirmEl.textContent = 'Test markers sent — check your receiver.';
    setTimeout(() => {
      if (confirmEl.isConnected) confirmEl.textContent = '';
    }, 3000);
  }
}

async function handleTestingModeToggle() {
  if (isTestingMode()) {
    setTestingMode(false);
    render();
    return;
  }

  openPasswordModal(async (password) => {
    const valid = await validatePassword(password);
    if (valid) {
      setTestingMode(true);
      render();
    }
    return valid;
  });
}

// Masked password entry for the Testing Mode gate — window.prompt() has no way to
// hide typed characters, so the password would show in plain text on screen.
function openPasswordModal(onValidate) {
  const overlay = document.createElement('div');
  overlay.className = 'password-modal-overlay';
  overlay.innerHTML = `
    <div class="password-modal-card">
      <h3 style="margin-bottom:6px;">Enable Testing Mode</h3>
      <p class="subtitle" style="margin-bottom:16px;">Enter the settings password to continue.</p>
      <div class="field">
        <label>Password</label>
        <input type="password" id="password-modal-input" autocomplete="off"/>
      </div>
      <span class="field-error" id="password-modal-error"></span>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button type="button" id="password-modal-cancel" class="btn btn-ghost" style="flex:1;justify-content:center;border:1px solid var(--border);">Cancel</button>
        <button type="button" id="password-modal-submit" class="btn btn-primary" style="flex:1;margin-top:0;">Submit</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#password-modal-input');
  const errorEl = overlay.querySelector('#password-modal-error');
  input.focus();

  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  async function submit() {
    const password = input.value;
    if (!password) return;
    const valid = await onValidate(password);
    if (!valid) {
      errorEl.textContent = 'Incorrect password.';
      input.value = '';
      input.focus();
      return;
    }
    close();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }

  overlay.querySelector('#password-modal-cancel').addEventListener('click', close);
  overlay.querySelector('#password-modal-submit').addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  document.addEventListener('keydown', onKeydown);
}

function fieldValue(id) {
  return containerRef.querySelector(`#${id}`).value.trim();
}

function setError(id, message) {
  const el = containerRef.querySelector(`#error-${id}`);
  if (el) el.textContent = message || '';
}

function validate() {
  let valid = true;
  const name = fieldValue('field-name');
  const age = fieldValue('field-age');
  const subjectId = fieldValue('field-subject-id');
  const sex = fieldValue('field-sex');
  const year = fieldValue('field-year');
  const discipline = fieldValue('field-discipline');
  const email = fieldValue('field-email');

  ['name', 'age', 'subject-id', 'sex', 'year', 'discipline', 'email', 'form'].forEach((id) => setError(id, ''));

  if (!name) { setError('name', 'Name is required'); valid = false; }
  if (!age || Number.isNaN(Number(age)) || Number(age) < 1 || Number(age) > 120) {
    setError('age', 'Please enter a valid age (1-120)'); valid = false;
  }
  if (!subjectId) {
    setError('subject-id', 'Subject ID is required'); valid = false;
  } else if (!/^sub-\d{3}$/.test(subjectId)) {
    setError('subject-id', 'Subject ID must be in the format sub-001'); valid = false;
  }
  if (!sex) { setError('sex', 'Sex is required'); valid = false; }
  if (!year) { setError('year', 'Year of study is required'); valid = false; }
  if (!discipline) { setError('discipline', 'Discipline of study is required'); valid = false; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('email', 'Please enter a valid email address'); valid = false;
  }

  return valid;
}

function handleSubmit() {
  if (!validate()) return;

  const participant = {
    name: fieldValue('field-name'),
    age: Number(fieldValue('field-age')),
    subjectId: fieldValue('field-subject-id'),
    sex: fieldValue('field-sex'),
    yearOfStudy: fieldValue('field-year'),
    disciplineOfStudy: fieldValue('field-discipline'),
  };
  const email = fieldValue('field-email');
  const notes = fieldValue('field-notes');
  if (email) participant.email = email;
  if (notes) participant.notes = notes;

  const participantKey = buildParticipantKey(participant);
  const sessionId = `${participantKey}_${Date.now()}`;

  // EEG Test Mode fires markers like EEG mode but reuses every Testing Mode
  // override (timing bypass, auto-fill, Firestore write suppression) — same
  // in-memory flag the Testing Mode toggle sets, so it never needs duplicating.
  if (eegTestOn) setTestingMode(true);

  setState({
    participant,
    participantKey,
    sessionId,
    assignedGroup: currentGroup,
    eegMode: eegOn || eegTestOn,
    eegTestMode: eegTestOn,
    sessionStartTime: Date.now(),
  });

  const snapshot = getState();
  writeDraft(sessionId, snapshot).catch((error) => {
    console.error('[registration] Failed to write initial draft.', error);
  });
  writeParticipant(participantKey, { participant }).catch((error) => {
    console.error('[registration] Failed to write participant record.', error);
  });

  goToPhase('consent');
}

export function mount(container) {
  containerRef = container;
  currentGroup = randomGroup();
  eegOn = false;
  eegTestOn = false;
  serialConnected = false;
  render();
}

export function unmount() {
  containerRef = null;
}
