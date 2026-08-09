import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getState, setState, resetState } from '../js/state.js';

describe('state', () => {
  beforeEach(() => resetState());

  test('initial state has correct default values', () => {
    const state = getState();
    assert.equal(state.sessionId, null);
    assert.equal(state.participantKey, null);
    assert.deepEqual(state.participant, {});
    assert.equal(state.assignedGroup, null);
    assert.equal(state.eegMode, false);
    assert.equal(state.sessionStartTime, null);
    assert.equal(state.sessionEndTime, null);
    assert.equal(state.currentTextIndex, 0);
    assert.equal(state.currentSlideIndex, 0);
    assert.equal(state.currentPraIndex, 0);
    assert.equal(state.phase, null);
    assert.equal(state.content, null);
    assert.equal(state.selfReport, null);
    assert.equal(state.consent, null);
    assert.deepEqual(state.texts, []);
    assert.deepEqual(state.eventLog, []);
    assert.deepEqual(state.visibilityEvents, []);
    assert.equal(state.draftTimer, null);
  });

  test('setState merges partial updates (does not wipe other fields)', () => {
    setState({ phase: 'registration' });
    setState({ currentTextIndex: 2 });
    const state = getState();
    assert.equal(state.phase, 'registration');
    assert.equal(state.currentTextIndex, 2);
  });

  test('getState returns a copy (mutations do not affect internal state)', () => {
    const state = getState();
    state.phase = 'mutated';
    assert.equal(getState().phase, null);
  });

  test('resetState restores all fields to initial values', () => {
    setState({ phase: 'done', currentTextIndex: 3, eegMode: true, texts: [{ a: 1 }] });
    resetState();
    const state = getState();
    assert.equal(state.phase, null);
    assert.equal(state.currentTextIndex, 0);
    assert.equal(state.eegMode, false);
    assert.deepEqual(state.texts, []);
  });

  test('phase transitions update phase field correctly', () => {
    setState({ phase: 'registration' });
    assert.equal(getState().phase, 'registration');
    setState({ phase: 'consent' });
    assert.equal(getState().phase, 'consent');
  });

  test('text index increments correctly across 4 texts', () => {
    for (let i = 0; i < 4; i += 1) {
      setState({ currentTextIndex: i });
      assert.equal(getState().currentTextIndex, i);
    }
  });

  test('event log appends correctly', () => {
    setState({ eventLog: [{ event: 'a' }] });
    setState({ eventLog: [...getState().eventLog, { event: 'b' }] });
    assert.deepEqual(getState().eventLog, [{ event: 'a' }, { event: 'b' }]);
  });
});
