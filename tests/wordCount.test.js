import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, isWithinRange } from '../js/utils/wordCount.js';

describe('wordCount — countWords', () => {
  test('empty string returns 0', () => {
    assert.equal(countWords(''), 0);
  });

  test('single word returns 1', () => {
    assert.equal(countWords('hello'), 1);
  });

  test('multiple spaces between words counted correctly', () => {
    assert.equal(countWords('hello    world'), 2);
  });

  test('leading/trailing whitespace does not add to count', () => {
    assert.equal(countWords('   hello world   '), 2);
  });

  test('newlines treated as word separators', () => {
    assert.equal(countWords('hello\nworld\n\nfoo'), 3);
  });
});

describe('wordCount — isWithinRange', () => {
  test('returns true when count within min/max', () => {
    assert.equal(isWithinRange(5, 1, 10), true);
  });

  test('returns false when count below min', () => {
    assert.equal(isWithinRange(0, 1, 10), false);
  });

  test('returns false when count above max', () => {
    assert.equal(isWithinRange(11, 1, 10), false);
  });

  test('handles edge cases (exactly min, exactly max)', () => {
    assert.equal(isWithinRange(1, 1, 10), true);
    assert.equal(isWithinRange(10, 1, 10), true);
  });
});
