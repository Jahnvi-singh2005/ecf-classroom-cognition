import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    setDoc,
    where,
} from 'firebase/firestore';
import type {
    ExperimentConfig,
    ExperimentSessionDraft,
    ExperimentSessionRecord,
    Participant,
    ProjectSettingsRecord,
} from '../types';
import { db } from './firebase';

const SETTINGS_DOC_PATH = ['projectMeta', 'settings'] as const;
const PASSWORD_DOC_PATH = ['projectMeta', 'settingsPassword'] as const;
const DRAFT_COLLECTION = 'experimentSessionDrafts';
const DEFAULT_SETTINGS_PASSWORD = import.meta.env.VITE_SETTINGS_PASSWORD || 'pass123';

const normalizeForKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const stripUndefined = <T,>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefined(item)) as T;
    }

    if (value && typeof value === 'object') {
        const cleanedEntries = Object.entries(value as Record<string, unknown>)
            .filter(([, fieldValue]) => fieldValue !== undefined)
            .map(([key, fieldValue]) => [key, stripUndefined(fieldValue)]);
        return Object.fromEntries(cleanedEntries) as T;
    }

    return value;
};

export const buildParticipantKey = (participant: Participant): string => {
    if (participant.subjectId?.trim()) {
        return `subject-${normalizeForKey(participant.subjectId)}`;
    }

    if (participant.email?.trim()) {
        return `email-${normalizeForKey(participant.email)}`;
    }

    const namePart = normalizeForKey(participant.name || participant.subjectId || 'unknown');
    const agePart = Number.isFinite(participant.age) ? String(participant.age) : 'na';
    return `participant-${namePart}-${agePart}`;
};

const ensureDb = () => {
    if (!db) {
        throw new Error('Firebase is not configured. Please add Firebase environment variables.');
    }
    return db;
};

export const saveExperimentSession = async (record: ExperimentSessionRecord): Promise<void> => {
    const firestore = ensureDb();
    const sanitizedRecord = stripUndefined(record);
    const sanitizedParticipant = stripUndefined(record.participant);

    await Promise.all([
        setDoc(doc(firestore, 'experimentSessions', record.sessionId), sanitizedRecord),
        setDoc(doc(firestore, 'participants', record.participantKey), {
            participant: sanitizedParticipant,
            lastSessionId: record.sessionId,
            lastSessionAt: record.completedAt,
            updatedAt: Date.now(),
        }, { merge: true }),
        setDoc(doc(firestore, 'participants', record.participantKey, 'sessions', record.sessionId), sanitizedRecord),
    ]);
};

export const upsertSessionDraft = async (draft: ExperimentSessionDraft): Promise<void> => {
    const firestore = ensureDb();
    const sanitizedDraft = stripUndefined(draft);
    await setDoc(doc(firestore, DRAFT_COLLECTION, draft.sessionId), sanitizedDraft, { merge: true });
};

export const getSessionDraft = async (sessionId: string): Promise<ExperimentSessionDraft | null> => {
    const firestore = ensureDb();
    const snapshot = await getDoc(doc(firestore, DRAFT_COLLECTION, sessionId));
    if (!snapshot.exists()) return null;
    return snapshot.data() as ExperimentSessionDraft;
};

export const getLatestInProgressDraftByParticipant = async (participantKey: string): Promise<ExperimentSessionDraft | null> => {
    const firestore = ensureDb();
    const draftsRef = collection(firestore, DRAFT_COLLECTION);
    const draftsQuery = query(
        draftsRef,
        where('participantKey', '==', participantKey),
        where('status', '==', 'in-progress'),
        limit(10),
    );
    const snapshot = await getDocs(draftsQuery);
    if (snapshot.empty) return null;

    const drafts = snapshot.docs.map((item) => item.data() as ExperimentSessionDraft);
    drafts.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
    return drafts[0] || null;
};

export const getInProgressSessionDrafts = async (): Promise<ExperimentSessionDraft[]> => {
    const firestore = ensureDb();
    const draftsRef = collection(firestore, DRAFT_COLLECTION);
    const draftsQuery = query(draftsRef, limit(300));
    const snapshot = await getDocs(draftsQuery);
    const drafts = snapshot.docs
        .map((item) => item.data() as ExperimentSessionDraft)
        .filter((draft) => draft.status === 'in-progress');

    drafts.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
    return drafts;
};

export const markSessionDraftCompleted = async (sessionId: string): Promise<void> => {
    const firestore = ensureDb();
    await setDoc(doc(firestore, DRAFT_COLLECTION, sessionId), {
        status: 'completed',
        lastUpdatedAt: Date.now(),
        lastSyncedAt: Date.now(),
    }, { merge: true });
};

export const deleteSessionDraft = async (sessionId: string): Promise<void> => {
    const firestore = ensureDb();
    await deleteDoc(doc(firestore, DRAFT_COLLECTION, sessionId));
};

export const purgeCompletedDrafts = async (
    options?: { olderThanDays?: number; batchSize?: number; maxBatches?: number },
): Promise<{ deletedCount: number; scannedBatches: number }> => {
    const firestore = ensureDb();
    const olderThanDays = options?.olderThanDays ?? 14;
    const batchSize = options?.batchSize ?? 50;
    const maxBatches = options?.maxBatches ?? 4;
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    let deletedCount = 0;
    let scannedBatches = 0;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
        const draftsRef = collection(firestore, DRAFT_COLLECTION);
        const draftsQuery = query(draftsRef, limit(batchSize * 4));

        const snapshot = await getDocs(draftsQuery);
        scannedBatches += 1;

        if (snapshot.empty) {
            break;
        }

        const eligibleDrafts = snapshot.docs
            .map((draft) => ({ ref: draft.ref, data: draft.data() as ExperimentSessionDraft }))
            .filter(({ data }) => data.status === 'completed' && (data.lastUpdatedAt || 0) <= cutoff)
            .sort((a, b) => (a.data.lastUpdatedAt || 0) - (b.data.lastUpdatedAt || 0));

        if (eligibleDrafts.length === 0) {
            break;
        }

        const toDelete = eligibleDrafts.slice(0, batchSize);
        await Promise.all(toDelete.map((draft) => deleteDoc(draft.ref)));
        deletedCount += toDelete.length;
    }

    return { deletedCount, scannedBatches };
};

export const getExperimentHistory = async (): Promise<ExperimentSessionRecord[]> => {
    const firestore = ensureDb();
    const sessionsRef = collection(firestore, 'experimentSessions');
    const sessionsQuery = query(sessionsRef, orderBy('completedAt', 'desc'), limit(300));
    const snapshot = await getDocs(sessionsQuery);
    return snapshot.docs.map((item) => item.data() as ExperimentSessionRecord);
};

export const saveProjectSettings = async (config: ExperimentConfig, password: string): Promise<void> => {
    const firestore = ensureDb();
    const now = Date.now();

    const payload: ProjectSettingsRecord = {
        config,
        updatedAt: now,
    };

    const sanitizedPayload = stripUndefined(payload);

    await Promise.all([
        setDoc(doc(firestore, SETTINGS_DOC_PATH[0], SETTINGS_DOC_PATH[1]), sanitizedPayload),
        setDoc(doc(firestore, PASSWORD_DOC_PATH[0], PASSWORD_DOC_PATH[1]), {
            password,
            updatedAt: now,
        }),
    ]);
};

export const getProjectSettings = async (): Promise<ExperimentConfig | null> => {
    const firestore = ensureDb();
    const snapshot = await getDoc(doc(firestore, SETTINGS_DOC_PATH[0], SETTINGS_DOC_PATH[1]));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as ProjectSettingsRecord;
    return data.config;
};

export const getStoredSettingsPassword = async (): Promise<string | null> => {
    const firestore = ensureDb();
    const snapshot = await getDoc(doc(firestore, PASSWORD_DOC_PATH[0], PASSWORD_DOC_PATH[1]));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as { password?: string };
    return data.password || null;
};

export const validateSettingsPassword = async (password: string): Promise<boolean> => {
    const stored = await getStoredSettingsPassword();
    const expected = stored || DEFAULT_SETTINGS_PASSWORD;
    return password === expected;
};

export const deleteExperimentSession = async (record: Pick<ExperimentSessionRecord, 'sessionId' | 'participantKey'>): Promise<void> => {
    const firestore = ensureDb();

    await Promise.all([
        deleteDoc(doc(firestore, 'experimentSessions', record.sessionId)),
        deleteDoc(doc(firestore, 'participants', record.participantKey, 'sessions', record.sessionId)),
        deleteDoc(doc(firestore, DRAFT_COLLECTION, record.sessionId)),
    ]);
};

export const deleteExperimentSessions = async (records: Array<Pick<ExperimentSessionRecord, 'sessionId' | 'participantKey'>>): Promise<void> => {
    await Promise.all(records.map((record) => deleteExperimentSession(record)));
};
