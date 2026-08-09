// firebase.js — all Firestore reads/writes live here. No other module touches Firestore directly.
// Falls back to localStorage (local-only mode) when window.ECF_CONFIG is missing/blank.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const LOCAL_PREFIX = 'ecf-local';
const FALLBACK_PASSWORD = 'cndl2025';

let app = null;
let db = null;
let usingLocalOnly = true;

function readConfig() {
  return (typeof window !== 'undefined' && window.ECF_CONFIG) || {};
}

export function initFirebase() {
  const cfg = readConfig();
  const requiredKeys = [cfg.FIREBASE_API_KEY, cfg.FIREBASE_AUTH_DOMAIN, cfg.FIREBASE_PROJECT_ID, cfg.FIREBASE_APP_ID];
  const hasConfig = requiredKeys.every((value) => typeof value === 'string' && value.trim().length > 0);

  if (!hasConfig) {
    usingLocalOnly = true;
    console.warn('[firebase] Missing Firebase config in window.ECF_CONFIG — running in local-only mode. Data will be saved to localStorage only.');
    return { ok: false, localOnly: true };
  }

  try {
    app = initializeApp({
      apiKey: cfg.FIREBASE_API_KEY,
      authDomain: cfg.FIREBASE_AUTH_DOMAIN,
      projectId: cfg.FIREBASE_PROJECT_ID,
      storageBucket: cfg.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: cfg.FIREBASE_MESSAGING_SENDER_ID,
      appId: cfg.FIREBASE_APP_ID,
    });
    db = getFirestore(app);
    usingLocalOnly = false;
    return { ok: true, localOnly: false };
  } catch (error) {
    usingLocalOnly = true;
    console.error('[firebase] Failed to initialise Firebase — falling back to local-only mode.', error);
    return { ok: false, localOnly: true, error };
  }
}

export function isLocalOnly() {
  return usingLocalOnly;
}

// ─── Local-only fallback helpers ──────────────────────────────────────────

function localStorageKey(...parts) {
  return `${LOCAL_PREFIX}:${parts.join(':')}`;
}

function localRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function localWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('[firebase] localStorage write failed.', error);
  }
}

function localReadAllWithPrefix(prefix) {
  const out = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const value = localRead(key);
      if (value) out.push(value);
    }
  }
  return out;
}

// ─── Content (projectMeta/settings) ───────────────────────────────────────

export async function loadContent() {
  if (usingLocalOnly) {
    return localRead(localStorageKey('projectMeta', 'settings'));
  }
  const snapshot = await getDoc(doc(db, 'projectMeta', 'settings'));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveContent(content, password) {
  const valid = await validatePassword(password);
  if (!valid) {
    throw new Error('Invalid settings password.');
  }

  const payload = { ...content, updatedAt: Date.now() };

  if (usingLocalOnly) {
    localWrite(localStorageKey('projectMeta', 'settings'), payload);
    return;
  }

  await setDoc(doc(db, 'projectMeta', 'settings'), payload);
}

// ─── Password (projectMeta/settingsPassword) ──────────────────────────────

export async function validatePassword(input) {
  const cfg = readConfig();
  const configuredFallback = cfg.SETTINGS_PASSWORD || FALLBACK_PASSWORD;

  if (usingLocalOnly) {
    const stored = localRead(localStorageKey('projectMeta', 'settingsPassword'));
    const expected = stored?.password || configuredFallback;
    return input === expected;
  }

  const snapshot = await getDoc(doc(db, 'projectMeta', 'settingsPassword'));
  const expected = snapshot.exists() ? snapshot.data().password : configuredFallback;
  return input === expected;
}

export async function changePassword(newPassword) {
  const payload = { password: newPassword, updatedAt: Date.now() };

  if (usingLocalOnly) {
    localWrite(localStorageKey('projectMeta', 'settingsPassword'), payload);
    return;
  }

  await setDoc(doc(db, 'projectMeta', 'settingsPassword'), payload);
}

// ─── Drafts (experimentSessionDrafts/{sessionId}) ─────────────────────────

export async function writeDraft(sessionId, data) {
  const payload = { ...data, sessionId, draftSavedAt: Date.now() };

  if (usingLocalOnly) {
    const existing = localRead(localStorageKey('experimentSessionDrafts', sessionId)) || {};
    localWrite(localStorageKey('experimentSessionDrafts', sessionId), { ...existing, ...payload });
    return;
  }

  await setDoc(doc(db, 'experimentSessionDrafts', sessionId), payload, { merge: true });
}

export async function completeDraft(sessionId) {
  const payload = { completed: true, draftSavedAt: Date.now() };

  if (usingLocalOnly) {
    const existing = localRead(localStorageKey('experimentSessionDrafts', sessionId)) || {};
    localWrite(localStorageKey('experimentSessionDrafts', sessionId), { ...existing, ...payload });
    return;
  }

  await setDoc(doc(db, 'experimentSessionDrafts', sessionId), payload, { merge: true });
}

export async function checkIncompleteDraft() {
  if (usingLocalOnly) {
    const drafts = localReadAllWithPrefix(localStorageKey('experimentSessionDrafts', ''));
    const incomplete = drafts.filter((draft) => !draft.completed);
    incomplete.sort((a, b) => (b.draftSavedAt || 0) - (a.draftSavedAt || 0));
    return incomplete[0] || null;
  }

  const draftsRef = collection(db, 'experimentSessionDrafts');
  const snapshot = await getDocs(query(draftsRef, limit(300)));
  const drafts = snapshot.docs
    .map((docSnap) => docSnap.data())
    .filter((draft) => !draft.completed);
  drafts.sort((a, b) => (b.draftSavedAt || 0) - (a.draftSavedAt || 0));
  return drafts[0] || null;
}

// All drafts (used by the History page to list in-progress/incomplete sessions
// alongside completed ones — checkIncompleteDraft() only returns one, for resume).
export async function getAllDrafts() {
  if (usingLocalOnly) {
    return localReadAllWithPrefix(localStorageKey('experimentSessionDrafts', ''));
  }

  const draftsRef = collection(db, 'experimentSessionDrafts');
  const snapshot = await getDocs(query(draftsRef, limit(300)));
  return snapshot.docs.map((docSnap) => docSnap.data());
}

// ─── Sessions (experimentSessions/{sessionId}) ────────────────────────────

export async function writeSession(sessionId, data) {
  const payload = { ...data, sessionId };

  if (usingLocalOnly) {
    localWrite(localStorageKey('experimentSessions', sessionId), payload);
    return;
  }

  await setDoc(doc(db, 'experimentSessions', sessionId), payload);
}

export async function getSession(sessionId) {
  if (usingLocalOnly) {
    return localRead(localStorageKey('experimentSessions', sessionId));
  }
  const snapshot = await getDoc(doc(db, 'experimentSessions', sessionId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function getAllSessions() {
  if (usingLocalOnly) {
    const sessions = localReadAllWithPrefix(localStorageKey('experimentSessions', ''));
    sessions.sort((a, b) => (b.sessionStartTime || 0) - (a.sessionStartTime || 0));
    return sessions;
  }

  const sessionsRef = collection(db, 'experimentSessions');
  const sessionsQuery = query(sessionsRef, orderBy('sessionStartTime', 'desc'), limit(300));
  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs.map((docSnap) => docSnap.data());
}

// ─── Participants (participants/{participantKey}) ─────────────────────────

export async function writeParticipant(participantKey, data) {
  const payload = { ...data, updatedAt: Date.now() };

  if (usingLocalOnly) {
    const existing = localRead(localStorageKey('participants', participantKey)) || {};
    localWrite(localStorageKey('participants', participantKey), { ...existing, ...payload });
    return;
  }

  await setDoc(doc(db, 'participants', participantKey), payload, { merge: true });
}

export async function writeParticipantSession(participantKey, sessionId, data) {
  const payload = { ...data, sessionId };

  if (usingLocalOnly) {
    localWrite(localStorageKey('participants', participantKey, 'sessions', sessionId), payload);
    return;
  }

  await setDoc(doc(db, 'participants', participantKey, 'sessions', sessionId), payload);
}
