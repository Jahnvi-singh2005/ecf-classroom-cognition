// ONE-TIME CLEANUP — safe to run multiple times (idempotent). Dry run by default.
//
// Deletes all test-mode session data from Firestore project "classcog-cap"
// (see js/config.js). Test sessions are identified by a `testMode: true`
// field on the document.
//
// Locations checked:
//   - experimentSessionDrafts/{sessionId}         (testMode == true)
//   - experimentSessions/{sessionId}               (testMode == true)
//   - participants/{participantKey}/sessions/{id}  (testMode == true, subcollection)
//   - participants/{participantKey}                (deleted only if ALL of its
//                                                    sessions were test sessions)
//
// Usage:
//   node scripts/cleanup-test-sessions.js            # dry run (default)
//   node scripts/cleanup-test-sessions.js --confirm  # actually delete
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

async function cleanupTopLevelCollection(collectionName) {
  const snapshot = await db.collection(collectionName).where('testMode', '==', true).get();
  for (const docSnap of snapshot.docs) {
    console.log(`  sessionId=${docSnap.data().sessionId ?? docSnap.id}`);
    await deleteDocRef(docSnap.ref, collectionName);
  }
}

async function cleanupParticipants() {
  const participantsSnapshot = await db.collection('participants').get();

  for (const participantDoc of participantsSnapshot.docs) {
    const participantKey = participantDoc.id;
    const sessionsRef = participantDoc.ref.collection('sessions');
    const sessionsSnapshot = await sessionsRef.get();

    const testSessionDocs = sessionsSnapshot.docs.filter((s) => s.data().testMode === true);
    const allSessionsAreTest =
      sessionsSnapshot.docs.length > 0 && testSessionDocs.length === sessionsSnapshot.docs.length;

    for (const sessionDoc of testSessionDocs) {
      console.log(
        `  participantKey=${participantKey} sessionId=${sessionDoc.data().sessionId ?? sessionDoc.id}`,
      );
      await deleteDocRef(sessionDoc.ref, 'participants/*/sessions');
    }

    if (allSessionsAreTest) {
      console.log(`  participantKey=${participantKey} (all sessions were test mode)`);
      await deleteDocRef(participantDoc.ref, 'participants');
    }
  }
}

async function main() {
  console.log(`Mode: ${CONFIRM ? 'CONFIRM (will delete)' : 'DRY RUN (no deletions)'}`);
  console.log(`Project: ${PROJECT_ID}\n`);

  console.log('Scanning experimentSessionDrafts...');
  await cleanupTopLevelCollection('experimentSessionDrafts');

  console.log('Scanning experimentSessions...');
  await cleanupTopLevelCollection('experimentSessions');

  console.log('Scanning participants and their sessions subcollections...');
  await cleanupParticipants();

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
