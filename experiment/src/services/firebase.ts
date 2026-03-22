import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { Firestore, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredKeys = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.appId,
];

export const hasFirebaseConfig = requiredKeys.every((value) => Boolean(value));

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let firebaseInitError: string | null = null;

if (hasFirebaseConfig) {
    try {
        app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        db = getFirestore(app);
    } catch (error) {
        firebaseInitError = error instanceof Error ? error.message : 'Failed to initialize Firebase.';
    }
}

export { app, db, firebaseInitError };
