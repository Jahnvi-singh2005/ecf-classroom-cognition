// firebase.test.js — All Firestore calls mocked, no real network calls. Uses a
// node:module resolution hook (tests/helpers/fakeFirestoreHook.mjs) to redirect
// firebase.js's two hardcoded CDN imports to local fakes that record every call.
// node:test's mock.module() is not available in this Node version, and network ESM
// imports of https: URLs are unsupported without an experimental flag — the
// resolution-hook approach is the only built-in way to intercept them.

import { register } from 'node:module';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

register('./helpers/fakeFirestoreHook.mjs', import.meta.url);

const fb = await import('../js/firebase.js');
const fake = await import('./helpers/fakeFirebaseFirestore.mjs');

const FIRESTORE_CONFIG = {
  FIREBASE_API_KEY: 'test-key',
  FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_APP_ID: 'test-app-id',
};

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

function buildParticipant() {
  return {
    subjectId: 'P001', name: 'Test Participant', age: 21,
    sex: 'Female', yearOfStudy: '2nd Year', disciplineOfStudy: 'Psychology',
  };
}

function buildSessionPayload(overrides = {}) {
  return {
    sessionId: 'sess-1',
    participantKey: 'subject-p001',
    participant: buildParticipant(),
    assignedGroup: 1,
    eegMode: false,
    sessionStartTime: 1000,
    sessionEndTime: 2000,
    selfReport: {
      generalLearningInclination: 5,
      outOfDomainLearningInclination: 4,
      inDomainLearningInclination: 6,
      academicIntelligenceReflection: 'I feel good.',
      submittedAt: 900,
    },
    consent: { consentGiven: true, consentedAt: 800, statementVersion: 'v1' },
    texts: [],
    visibilityEvents: [],
    eventLog: [],
    ...overrides,
  };
}

describe('firebase.js — Firestore mode', () => {
  beforeEach(() => {
    fake.resetMock();
    globalThis.window = { ECF_CONFIG: FIRESTORE_CONFIG };
    fb.initFirebase();
  });

  test('writeDraft called with correct collection path', async () => {
    await fb.writeDraft('sess-1', { sessionId: 'sess-1', phase: 'reading' });
    assert.equal(fake.mockCalls.setDoc.length, 1);
    assert.equal(fake.mockCalls.setDoc[0].path, 'experimentSessionDrafts/sess-1');
  });

  test('writeDraft uses merge: true', async () => {
    await fb.writeDraft('sess-1', { sessionId: 'sess-1' });
    assert.deepEqual(fake.mockCalls.setDoc[0].options, { merge: true });
  });

  test('completeDraft sets completed: true', async () => {
    await fb.completeDraft('sess-1');
    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessionDrafts/sess-1');
    assert.equal(call.data.completed, true);
  });

  test('writeSession called with correct document shape (all required fields present)', async () => {
    await fb.writeSession('sess-1', buildSessionPayload());
    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessions/sess-1');
    assert.ok(call, 'expected a setDoc call to experimentSessions/sess-1');

    const requiredFields = [
      'sessionId', 'participantKey', 'participant', 'assignedGroup', 'eegMode',
      'sessionStartTime', 'sessionEndTime', 'texts', 'visibilityEvents', 'eventLog',
    ];
    requiredFields.forEach((field) => {
      assert.ok(field in call.data, `missing required field: ${field}`);
    });
  });

  test('writeSession document matches ExperimentSessionRecord schema', async () => {
    await fb.writeSession('sess-1', buildSessionPayload());
    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessions/sess-1');
    const { data } = call;

    assert.equal(typeof data.sessionId, 'string');
    assert.equal(typeof data.participantKey, 'string');
    assert.equal(typeof data.participant, 'object');
    assert.equal(typeof data.assignedGroup, 'number');
    assert.equal(typeof data.eegMode, 'boolean');
    assert.equal(typeof data.sessionStartTime, 'number');
    assert.equal(typeof data.sessionEndTime, 'number');
    assert.ok(Array.isArray(data.texts));
    assert.ok(Array.isArray(data.visibilityEvents));
    assert.ok(Array.isArray(data.eventLog));
  });

  test('praResponses array has correct shape per question type', async () => {
    const mcResponse = {
      questionIndex: 0, questionId: 'q1', questionType: 'mc', questionText: 'What?',
      timestamps: { t1QuestionShown: 1, t2ResponsePhaseStart: 2, t3FirstInput: 3, t4Submitted: 4 },
      metrics: { thinkingTimeMs: 1, responseTimeMs: 2, totalTimeMs: 3 },
      response: 'Option B', selectedOptionIndex: 1, wordCount: null, autoSubmitted: false,
    };
    const writtenResponse = {
      questionIndex: 3, questionId: 'q4', questionType: 'written', questionText: 'Explain.',
      timestamps: { t1QuestionShown: 1, t2ResponsePhaseStart: 2, t3FirstInput: 3, t4Submitted: 4 },
      metrics: { thinkingTimeMs: 1, responseTimeMs: 2, totalTimeMs: 3 },
      response: 'Because...', selectedOptionIndex: null, wordCount: 42, autoSubmitted: false,
    };

    await fb.writeSession('sess-1', buildSessionPayload({
      texts: [{
        textIndex: 0, textId: 'text1', textTitle: 'Text 1', condition: 'passive',
        startTime: 1, endTime: 2, readingAdvanceMarkers: [], embeddedResponses: [],
        praResponses: [mcResponse, writtenResponse],
      }],
    }));

    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessions/sess-1');
    const [pra1, pra2] = call.data.texts[0].praResponses;

    assert.equal(pra1.questionType, 'mc');
    assert.equal(typeof pra1.selectedOptionIndex, 'number');
    assert.equal(pra1.wordCount, null);

    assert.equal(pra2.questionType, 'written');
    assert.equal(pra2.selectedOptionIndex, null);
    assert.equal(typeof pra2.wordCount, 'number');
  });

  test('embeddedResponses array has correct shape for Active', async () => {
    const activeResponse = {
      sectionIndex: 0, questionText: 'Why?',
      timestamps: { t1QuestionShown: 1, t2ResponsePhaseStart: 2, t3FirstInput: 3, t4Submitted: 4 },
      metrics: { thinkingTimeMs: 1, responseTimeMs: 2, totalTimeMs: 3 },
      response: 'Option A', selectedOptionIndex: 0, isCorrect: true, autoSubmitted: false,
    };

    await fb.writeSession('sess-1', buildSessionPayload({
      texts: [{
        textIndex: 0, textId: 'text1', textTitle: 'Text 1', condition: 'active',
        startTime: 1, endTime: 2, readingAdvanceMarkers: [],
        embeddedResponses: [activeResponse], praResponses: [],
      }],
    }));

    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessions/sess-1');
    const entry = call.data.texts[0].embeddedResponses[0];
    assert.equal(typeof entry.selectedOptionIndex, 'number');
    assert.equal(typeof entry.isCorrect, 'boolean');
  });

  test('embeddedResponses array has correct shape for Constructive', async () => {
    const constructiveResponse = {
      sectionIndex: 0, questionText: 'Why?',
      timestamps: { t1QuestionShown: 1, t2ResponsePhaseStart: 2, t3FirstInput: 3, t4Submitted: 4 },
      metrics: { thinkingTimeMs: 1, responseTimeMs: 2, totalTimeMs: 3 },
      response: 'Because the text says...', selectedOptionIndex: null, isCorrect: null, autoSubmitted: false,
    };

    await fb.writeSession('sess-1', buildSessionPayload({
      texts: [{
        textIndex: 0, textId: 'text1', textTitle: 'Text 1', condition: 'constructive',
        startTime: 1, endTime: 2, readingAdvanceMarkers: [],
        embeddedResponses: [constructiveResponse], praResponses: [],
      }],
    }));

    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessions/sess-1');
    const entry = call.data.texts[0].embeddedResponses[0];
    assert.equal(entry.selectedOptionIndex, null);
    assert.equal(entry.isCorrect, null);
    assert.equal(typeof entry.response, 'string');
  });

  test('embeddedResponses is empty array for Passive and Control', async () => {
    await fb.writeSession('sess-1', buildSessionPayload({
      texts: [
        { textIndex: 0, textId: 'text1', textTitle: 'Text 1', condition: 'passive', startTime: 1, endTime: 2, readingAdvanceMarkers: [], embeddedResponses: [], praResponses: [] },
        { textIndex: 1, textId: 'text2', textTitle: 'Text 2', condition: 'control', startTime: 1, endTime: 2, readingAdvanceMarkers: [], embeddedResponses: [], praResponses: [] },
      ],
    }));

    const call = fake.mockCalls.setDoc.find((c) => c.path === 'experimentSessions/sess-1');
    assert.deepEqual(call.data.texts[0].embeddedResponses, []);
    assert.deepEqual(call.data.texts[1].embeddedResponses, []);
  });

  test('writeParticipant upserts (does not overwrite) existing participant', async () => {
    fake.mockData.docs.set('participants/subject-p001', { participant: { name: 'Old Name' }, note: 'existing' });
    await fb.writeParticipant('subject-p001', { participant: { name: 'New Name' } });
    const call = fake.mockCalls.setDoc.find((c) => c.path === 'participants/subject-p001');
    assert.deepEqual(call.options, { merge: true });
  });

  test('getAllSessions returns array sorted newest first (descending sessionStartTime)', async () => {
    fake.mockData.collections.set('experimentSessions', [
      { id: 'a', data: { sessionId: 'a', sessionStartTime: 1000 } },
      { id: 'b', data: { sessionId: 'b', sessionStartTime: 3000 } },
      { id: 'c', data: { sessionId: 'c', sessionStartTime: 2000 } },
    ]);
    const results = await fb.getAllSessions();
    assert.deepEqual(results.map((r) => r.sessionId), ['b', 'c', 'a']);
  });
});

describe('firebase.js — local-only mode', () => {
  beforeEach(() => {
    globalThis.window = undefined;
    globalThis.localStorage = createMemoryLocalStorage();
    fb.initFirebase();
  });

  test('Local-only mode: writeSession writes to localStorage when Firebase config missing', async () => {
    assert.equal(fb.isLocalOnly(), true);
    await fb.writeSession('sess-local', buildSessionPayload({ sessionId: 'sess-local' }));
    const raw = globalThis.localStorage.getItem('ecf-local:experimentSessions:sess-local');
    assert.ok(raw);
    assert.equal(JSON.parse(raw).sessionId, 'sess-local');
  });

  test('Local-only mode: writeDraft writes to localStorage when Firebase config missing', async () => {
    assert.equal(fb.isLocalOnly(), true);
    await fb.writeDraft('sess-local-2', { sessionId: 'sess-local-2', phase: 'reading' });
    const raw = globalThis.localStorage.getItem('ecf-local:experimentSessionDrafts:sess-local-2');
    assert.ok(raw);
    assert.equal(JSON.parse(raw).phase, 'reading');
  });
});
