import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    setDoc,
} from 'firebase/firestore';
import type { ExperimentConfig, ExperimentSessionRecord, Participant, ProjectSettingsRecord } from '../types';
import { db } from './firebase';

const SETTINGS_DOC_PATH = ['projectMeta', 'settings'] as const;
const PASSWORD_DOC_PATH = ['projectMeta', 'settingsPassword'] as const;

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
    if (participant.email?.trim()) {
        return `email-${normalizeForKey(participant.email)}`;
    }

    const namePart = normalizeForKey(participant.name || 'unknown');
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
