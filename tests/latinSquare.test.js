import { register } from 'node:module';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// content.js imports firebase.js, which imports the Firebase CDN URLs directly —
// register the same interception hook firebase.test.js uses so this file's import
// chain never attempts a real network request.
register('./helpers/fakeFirestoreHook.mjs', import.meta.url);

const { LATIN_SQUARE_DEFAULT, getDefaultCondition } = await import('../js/latinSquare.js');
const { getCondition } = await import('../js/content.js');
const { setState, resetState } = await import('../js/state.js');

describe('latinSquare — getDefaultCondition (hardcoded)', () => {
  test('Group 1 gets passive for text 1', () => {
    assert.equal(getDefaultCondition(1, 0), 'passive');
  });

  test('Group 1 gets active for text 2', () => {
    assert.equal(getDefaultCondition(1, 1), 'active');
  });

  test('Group 1 gets constructive for text 3', () => {
    assert.equal(getDefaultCondition(1, 2), 'constructive');
  });

  test('Group 1 gets control for text 4', () => {
    assert.equal(getDefaultCondition(1, 3), 'control');
  });

  test('Group 2 gets active for text 1', () => {
    assert.equal(getDefaultCondition(2, 0), 'active');
  });

  test('all 16 group/text combinations match LATIN_SQUARE_DEFAULT', () => {
    for (let group = 1; group <= 4; group += 1) {
      for (let textIndex = 0; textIndex <= 3; textIndex += 1) {
        const groupKey = `group${group}`;
        const textKey = `text${textIndex + 1}`;
        assert.equal(getDefaultCondition(group, textIndex), LATIN_SQUARE_DEFAULT[groupKey][textKey]);
      }
    }
  });

  test('each condition appears exactly once per group', () => {
    for (let group = 1; group <= 4; group += 1) {
      const conditions = [0, 1, 2, 3].map((i) => getDefaultCondition(group, i));
      assert.equal(new Set(conditions).size, 4);
    }
  });

  test('each condition appears exactly once per text position', () => {
    for (let textIndex = 0; textIndex <= 3; textIndex += 1) {
      const conditions = [1, 2, 3, 4].map((g) => getDefaultCondition(g, textIndex));
      assert.equal(new Set(conditions).size, 4);
    }
  });
});

describe('content.js — getCondition (state + Firestore override)', () => {
  test('returns hardcoded default when Firestore content is null', () => {
    resetState();
    setState({ content: null });
    assert.equal(getCondition(1, 0), 'passive');
    resetState();
  });

  test('returns Firestore override when content is loaded', () => {
    resetState();
    setState({
      content: {
        latinSquare: {
          group1: { text1: 'control', text2: 'control', text3: 'control', text4: 'control' },
        },
      },
    });
    assert.equal(getCondition(1, 0), 'control');
    resetState();
  });
});
