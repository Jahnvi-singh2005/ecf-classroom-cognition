// testingMode.js — in-memory-only "testing mode" flag for bypassing slide timers
// during manual testing. Never persisted to Firestore or localStorage/sessionStorage,
// so it always resets to off on page reload. Gated behind the same settings password
// as the admin panel (validatePassword() in firebase.js) — toggled from the
// registration screen (js/screens/registration.js).

let testingModeOn = false;
let badgeEl = null;

export function isTestingMode() {
  return testingModeOn;
}

export function setTestingMode(value) {
  testingModeOn = Boolean(value);
  syncBadge();
}

// Shared progression gate for every slide type with a spacebar min-time lock
// (stimulus.js, guidedResolution.js) — one check point instead of patching each.
export function canProgress(elapsedMs, minTimeMs) {
  return testingModeOn || elapsedMs >= minTimeMs;
}

function syncBadge() {
  if (testingModeOn) {
    if (badgeEl) return;
    badgeEl = document.createElement('div');
    badgeEl.id = 'testing-mode-badge';
    badgeEl.textContent = 'Testing Mode — timers bypassed';
    document.body.appendChild(badgeEl);
  } else if (badgeEl) {
    badgeEl.remove();
    badgeEl = null;
  }
}
