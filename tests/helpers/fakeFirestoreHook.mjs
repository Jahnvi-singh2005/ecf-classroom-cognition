// fakeFirestoreHook.mjs — a Node module-customization hook (node:module register())
// that redirects the two Firebase CDN URL imports in js/firebase.js to local fake
// implementations, so tests never make a real network call. This is the only
// built-in (no npm dependency) way to intercept a hardcoded https: import specifier
// in plain Node — node:test's mock.module() is not available in this Node version.

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js') {
    return { url: new URL('./fakeFirebaseApp.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js') {
    return { url: new URL('./fakeFirebaseFirestore.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
