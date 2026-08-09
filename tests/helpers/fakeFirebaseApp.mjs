// Fake stand-in for firebase/app, loaded via fakeFirestoreHook.mjs instead of the
// real CDN module during tests.
export function initializeApp(config) {
  return { __fakeApp: true, config };
}
