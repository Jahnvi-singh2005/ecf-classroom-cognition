# ECF Classroom Cognition – Experiment App

This app now supports:

- Firebase-backed experiment session storage (user-wise + session-wise)
- Firebase-backed project settings sync
- Password-protected settings save flow (`VITE_SETTINGS_PASSWORD`, default `pass123`)
- History page to view all previously synced experiment sessions

## 1) Environment setup

1. Copy [.env.example](.env.example) to `.env`.
2. Fill your Firebase web config keys.
3. Keep this key set for password protection:

```bash
VITE_SETTINGS_PASSWORD=pass123
```

## 2) Firebase setup steps

1. Create a Firebase project.
2. Add a **Web App** and copy config values.
3. Enable **Cloud Firestore** in production or test mode.
4. Add your local/dev domain to authorized domains if needed.

## 3) Firestore collections used

- `projectMeta/settings` → synced experiment config
- `projectMeta/settingsPassword` → synced settings password record
- `experimentSessions/{sessionId}` → each completed experiment session
- `participants/{participantKey}` → participant metadata
- `participants/{participantKey}/sessions/{sessionId}` → user-wise session history

## 4) Run app

```bash
npm install
npm run dev
```

## 5) Notes

- Screen/video recordings remain local-only (downloaded locally), as requested.
- If Firebase env keys are missing, app still runs with local config and local flow.
- History and sync become active automatically once Firebase env is configured.
