# ECF Classroom Cognition — Reading Experiment

A research experiment delivery tool for a cognitive neuroscience study. Participants read texts and answer questions while the app records precise timing data for EEG analysis. It runs on a single lab desktop, full-screen, supervised by a researcher. The app is a vanilla-JS, no-build, multi-page site — three independent static pages (`/`, `/settings`, `/history`) sharing a Firebase Firestore backend.

## 1) Setup

1. Copy `config.js.example` to `js/config.js`.
2. Fill in your Firebase web app credentials (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`) and set `SETTINGS_PASSWORD` before deployment (the placeholder is `"cndl2025"`).
3. `js/config.js` is gitignored and must never be committed.

If `js/config.js` is missing or its keys are blank, the app still runs — it falls back to a local-only mode where session and draft data is written to `localStorage` instead of Firestore, clearly labelled as such wherever the sync status is shown.

## 2) Running locally

Open `index.html` directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`, `npx serve`). No build step, no `npm install` required to run the app itself.

## 3) Running tests

```bash
npm test
```

Runs the full suite (`node --test tests/**/*.test.js`) — logic-layer tests only, no browser automation. All Firestore calls are mocked via a `node:module` resolution hook (see `tests/helpers/`), so tests never hit the network. Use `npm run test:watch` for watch mode.

## 4) Admin panel

Navigate to `/settings`. Enter the settings password to unlock three tabs: General Settings (global timing defaults, EEG/baseline timing, the Latin square), Content Editor (per-group, per-text slides and PRA questions), and Security (change the password). All saves write to `projectMeta/settings` in Firestore.

## 5) Session history

Navigate to `/history`. Same password as `/settings`. Lists every session — completed and in-progress — newest first, with a "View JSON" modal per row and a "Export all as CSV" button.

## 6) EEG mode

Toggled on the Registration screen. When on, it adds a Baseline screen and a Fixation cross before each text, uses `requestAnimationFrame`-based timing instead of `setInterval`, switches the background to a neutral mid-grey (reduces luminance-related visual artefacts), enforces full-screen with a blocking overlay if the participant exits it or switches tabs, and logs every visibility change to the session record.

Before starting an EEG session, the Python bridge (`localhost:8765`) needs to be running — the Registration screen attempts a WebSocket connection when EEG mode is toggled on and shows an amber warning banner if it can't connect. See `EEG_ARCHITECTURE-2.md` for the full hardware/software pipeline and pre-session checklist.

## 7) Phase 2 — LSL markers

Marker *sending* is out of scope for this build. Every point in the code where a marker should eventually be sent carries an inert two-line stub comment:

```js
// MARKER STUB [phase 2]: <event description>
// sendMarker(MARKERS.<NAME>);
```

The full marker scheme, WebSocket transport, and Python bridge implementation are documented separately in `EEG_ARCHITECTURE-2.md`.

## 8) Deploying to Vercel

No `vercel.json` needed — this is a multi-page site of separate HTML files, and Vercel serves each at its natural path. In the Vercel dashboard when connecting the repo:

- **Framework preset:** Other
- **Build command:** *(empty)*
- **Output directory:** `.`
- **Install command:** *(empty)*

**Open item — `js/config.js` on the deployed site:** `js/config.js` is gitignored by design (§4.1 of the build spec), so it is never part of what gets pushed to Vercel. That means a deploy driven purely by `git push` will **not** have Firebase credentials available at runtime, and the live site will silently run in local-only mode for every participant. Neither `ecf-build-spec.md` nor `ecf-rebuild-plan-v2-2.md` describes how `js/config.js` is supposed to reach the deployed instance — Vercel environment variables were explicitly ruled out (`js/config.js` is loaded as a static `<script>` tag, not read from `process.env` at build time, and there is no build step to inject one into the other). Until this is resolved, treat any Vercel deployment as **local-only unless `js/config.js` is added to the deployed output through some channel outside the normal git-based deploy** (e.g. Vercel's dashboard file overrides, or a separate non-git upload step) — confirm the intended mechanism with the researcher before relying on a deployed instance to write real session data to Firestore.

## 9) Firestore security

See `firestore.rules`. `projectMeta` (experiment content + settings password) is writable by anyone who can reach the Firestore endpoint — access there is enforced by the admin panel's password gate at the application layer, not by Firestore rules, since this is a single-experimenter research tool rather than a multi-tenant product.
