// ONE-TIME CLEANUP — deletes ALL app data. Dry run by default. Irreversible when run with --confirm.
//
// Wipes every document from every collection this app writes to, in Firestore
// project "classcog-cap" (see js/config.js / js/firebase.js):
//   - experimentSessionDrafts/{sessionId}
//   - experimentSessions/{sessionId}
//   - participants/{participantKey}/sessions/{sessionId}  (subcollection, deleted first)
//   - participants/{participantKey}
//
// projectMeta/settings and projectMeta/settingsPassword are NOT touched.
//
// Usage:
//   node scripts/clear-all-data.js            # dry run (default)
//   node scripts/clear-all-data.js --confirm  # actually delete
//
// Auth: uses Application Default Credentials, e.g.
//   gcloud auth application-default login
// No service account key file is used or required.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'classcog-cap';
const CONFIRM = process.argv.includes('--confirm');

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();

const summary = {
  experimentSessionDrafts: { found: 0, deleted: 0 },
  experimentSessions: { found: 0, deleted: 0 },
  'participants/*/sessions': { found: 0, deleted: 0 },
  participants: { found: 0, deleted: 0 },
};

async function deleteDocRef(ref, label) {
  summary[label].found += 1;
  console.log(`${CONFIRM ? '[DELETE]' : '[DRY RUN]'} ${ref.path}`);
  if (CONFIRM) {
    await ref.delete();
    summary[label].deleted += 1;
  }
}

async function clearTopLevelCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  for (const docSnap of snapshot.docs) {
    await deleteDocRef(docSnap.ref, collectionName);
  }
}

async function clearParticipants() {
  const participantsSnapshot = await db.collection('participants').get();

  for (const participantDoc of participantsSnapshot.docs) {
    const sessionsSnapshot = await participantDoc.ref.collection('sessions').get();
    for (const sessionDoc of sessionsSnapshot.docs) {
      await deleteDocRef(sessionDoc.ref, 'participants/*/sessions');
    }
    await deleteDocRef(participantDoc.ref, 'participants');
  }
}

async function main() {
  console.log(`Mode: ${CONFIRM ? 'CONFIRM (will delete)' : 'DRY RUN (no deletions)'}`);
  console.log(`Project: ${PROJECT_ID}\n`);

  console.log('Scanning experimentSessionDrafts...');
  await clearTopLevelCollection('experimentSessionDrafts');

  console.log('Scanning experimentSessions...');
  await clearTopLevelCollection('experimentSessions');

  console.log('Scanning participants and their sessions subcollections...');
  await clearParticipants();

  const totalFound = Object.values(summary).reduce((sum, s) => sum + s.found, 0);
  const totalDeleted = Object.values(summary).reduce((sum, s) => sum + s.deleted, 0);

  console.log('\n=== Summary ===');
  for (const [label, { found, deleted }] of Object.entries(summary)) {
    console.log(`${label}: found=${found} ${CONFIRM ? `deleted=${deleted}` : `would-delete=${found}`}`);
  }
  console.log(`Total: found=${totalFound} ${CONFIRM ? `deleted=${totalDeleted}` : `would-delete=${totalFound}`}`);

  if (!CONFIRM) {
    console.log('\nDry run only — no documents were deleted. Re-run with --confirm to delete.');
  }
}

main().catch((error) => {
  console.error('Cleanup script failed:', error);
  process.exit(1);
});
