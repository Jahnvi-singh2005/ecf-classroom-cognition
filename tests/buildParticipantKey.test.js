import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildParticipantKey } from '../js/utils/buildParticipantKey.js';

describe('buildParticipantKey', () => {
  test('returns subjectId normalised to lowercase-kebab when provided', () => {
    assert.equal(buildParticipantKey({ subjectId: 'P 001' }), 'subject-p-001');
  });

  test('falls back to email when subjectId absent', () => {
    assert.equal(buildParticipantKey({ email: 'Jane.Doe@Example.com' }), 'email-jane-doe-example-com');
  });

  test('falls back to name+age when both subjectId and email absent', () => {
    assert.equal(buildParticipantKey({ name: 'Jane Doe', age: 21 }), 'participant-jane-doe-21');
  });

  test('normalises special characters and spaces', () => {
    assert.equal(buildParticipantKey({ subjectId: "O'Brien #1!!" }), 'subject-o-brien-1');
  });

  test('produces same key for same input (deterministic)', () => {
    const participant = { subjectId: 'P002' };
    assert.equal(buildParticipantKey(participant), buildParticipantKey({ ...participant }));
  });

  test('produces different keys for different participants', () => {
    assert.notEqual(
      buildParticipantKey({ subjectId: 'P001' }),
      buildParticipantKey({ subjectId: 'P002' }),
    );
  });
});
