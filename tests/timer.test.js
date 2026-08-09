import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTimer } from '../js/timer.js';
import { resetState } from '../js/state.js';

// requestAnimationFrame does not exist in plain Node, so these tests exercise the
// setInterval-based (non-EEG) implementation — the one that actually runs by default,
// since state.eegMode is false unless a screen explicitly turns EEG mode on. The
// public contract under test (onTick/onComplete/cancel/elapsed clamping) is the same
// for both internal implementations; only the underlying scheduling primitive differs.

beforeEach(() => resetState());

describe('timer', () => {
  test('onTick called with increasing elapsed values', () => {
    return new Promise((resolve) => {
      const seen = [];
      startTimer({
        onTick: (elapsed) => seen.push(elapsed),
        onComplete: () => {
          assert.ok(seen.length > 1, 'expected multiple ticks');
          for (let i = 1; i < seen.length; i += 1) {
            assert.ok(seen[i] >= seen[i - 1], `elapsed should be non-decreasing: ${seen}`);
          }
          resolve();
        },
        durationMs: 300,
      });
    });
  });

  test('onComplete fires at or after durationMs', () => {
    return new Promise((resolve) => {
      const start = Date.now();
      startTimer({
        onTick: () => {},
        onComplete: () => {
          assert.ok(Date.now() - start >= 200, 'onComplete fired before durationMs elapsed');
          resolve();
        },
        durationMs: 200,
      });
    });
  });

  test('cancel function stops further ticks', () => {
    return new Promise((resolve) => {
      let tickCount = 0;
      const cancel = startTimer({
        onTick: () => { tickCount += 1; },
        onComplete: () => assert.fail('should not complete after cancel'),
        durationMs: 500,
      });

      setTimeout(() => {
        cancel();
        const countAtCancel = tickCount;
        setTimeout(() => {
          assert.equal(tickCount, countAtCancel, 'ticks should not increase after cancel');
          resolve();
        }, 250);
      }, 150);
    });
  });

  test('cancel function stops auto-complete', () => {
    return new Promise((resolve) => {
      const cancel = startTimer({
        onTick: () => {},
        onComplete: () => assert.fail('onComplete should not fire after cancel'),
        durationMs: 150,
      });
      cancel();
      setTimeout(resolve, 300);
    });
  });

  test('two simultaneous timers do not interfere', () => {
    return new Promise((resolve) => {
      let doneA = false;
      let doneB = false;
      const finishIfBothDone = () => { if (doneA && doneB) resolve(); };

      startTimer({ onTick: () => {}, onComplete: () => { doneA = true; finishIfBothDone(); }, durationMs: 150 });
      startTimer({ onTick: () => {}, onComplete: () => { doneB = true; finishIfBothDone(); }, durationMs: 250 });
    });
  });

  test('elapsed never exceeds durationMs', () => {
    return new Promise((resolve) => {
      let maxElapsed = 0;
      startTimer({
        onTick: (elapsed) => { maxElapsed = Math.max(maxElapsed, elapsed); },
        onComplete: () => {
          assert.ok(maxElapsed <= 200, `elapsed exceeded durationMs: ${maxElapsed}`);
          resolve();
        },
        durationMs: 200,
      });
    });
  });
});
