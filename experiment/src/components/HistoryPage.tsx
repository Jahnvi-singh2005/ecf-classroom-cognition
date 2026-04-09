import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ExperimentSessionDraft, ExperimentSessionRecord } from '../types';
import {
    deleteExperimentSessions,
    getExperimentHistory,
    getInProgressSessionDrafts,
    validateSettingsPassword,
} from '../services/ExperimentDataService';
import { hasFirebaseConfig, firebaseInitError } from '../services/firebase';

const SessionDetails = lazy(() => import('./SessionDetails'));

interface HistoryPageProps {
    onBack: () => void;
    onResumeDraft?: (draft: ExperimentSessionDraft) => void;
}

const formatDateTime = (timestamp: number): string => {
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Invalid date';
    }
};

const participantPrimaryLabel = (participant: ExperimentSessionRecord['participant']): string => (
    participant.subjectId || participant.name || 'Unknown participant'
);

const participantSecondaryLabel = (participant: ExperimentSessionRecord['participant']): string => {
    const parts = [
        participant.name && participant.subjectId ? `Name: ${participant.name}` : '',
        Number.isFinite(participant.age) ? `Age ${participant.age}` : '',
        participant.sex,
        participant.yearOfStudy ? `Year ${participant.yearOfStudy}` : '',
        participant.disciplineOfStudy,
        participant.email,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : 'No participant metadata';
};

const participantSearchText = (participant: ExperimentSessionRecord['participant']): string => [
    participant.subjectId,
    participant.sex,
    participant.yearOfStudy,
    participant.disciplineOfStudy,
    participant.name,
    participant.email,
    Number.isFinite(participant.age) ? String(participant.age) : '',
]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export default function HistoryPage({ onBack, onResumeDraft }: HistoryPageProps) {
    const [sessions, setSessions] = useState<ExperimentSessionRecord[]>([]);
    const [resumableDrafts, setResumableDrafts] = useState<ExperimentSessionDraft[]>([]);
    const [selectedSession, setSelectedSession] = useState<ExperimentSessionRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadHistory = useCallback(async () => {
        if (!hasFirebaseConfig) {
            setError(firebaseInitError || 'Firebase is not configured yet.');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const data = await getExperimentHistory();
            setSessions(data);

            try {
                const drafts = await getInProgressSessionDrafts();
                setResumableDrafts(drafts);
            } catch {
                setResumableDrafts([]);
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Could not load experiment history.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    const filteredSessions = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return sessions;

        return sessions.filter((item) => {
            const participantText = participantSearchText(item.participant);
            return (
                participantText.includes(normalized)
                || item.sessionId.toLowerCase().includes(normalized)
                || item.participantKey.toLowerCase().includes(normalized)
            );
        });
    }, [query, sessions]);

    const filteredResumableDrafts = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return resumableDrafts;

        return resumableDrafts.filter((item) => {
            const participantText = participantSearchText(item.participant);
            return (
                participantText.includes(normalized)
                || item.sessionId.toLowerCase().includes(normalized)
                || item.participantKey.toLowerCase().includes(normalized)
            );
        });
    }, [query, resumableDrafts]);

    const filteredSessionIds = useMemo(() => filteredSessions.map((session) => session.sessionId), [filteredSessions]);

    const selectedCount = selectedSessionIds.length;

    const toggleDeleteMode = useCallback(() => {
        setIsDeleteMode((previous) => {
            const next = !previous;
            if (!next) {
                setSelectedSessionIds([]);
                setDeleteError(null);
                setDeleteSuccess(null);
                setShowDeleteModal(false);
                setDeletePassword('');
            }
            return next;
        });
    }, []);

    const toggleSessionSelection = useCallback((sessionId: string) => {
        setSelectedSessionIds((previous) => (
            previous.includes(sessionId)
                ? previous.filter((id) => id !== sessionId)
                : [...previous, sessionId]
        ));
    }, []);

    const selectAllFiltered = useCallback(() => {
        setSelectedSessionIds(filteredSessionIds);
    }, [filteredSessionIds]);

    const clearSelection = useCallback(() => {
        setSelectedSessionIds([]);
    }, []);

    const closeDeleteModal = useCallback(() => {
        if (isDeleting) return;
        setShowDeleteModal(false);
        setDeletePassword('');
        setDeleteError(null);
    }, [isDeleting]);

    const handleDeleteSelected = useCallback(async () => {
        if (selectedSessionIds.length === 0) {
            setDeleteError('Select at least one session to delete.');
            return;
        }

        try {
            setIsDeleting(true);
            setDeleteError(null);
            setDeleteSuccess(null);

            const isValid = await validateSettingsPassword(deletePassword);
            if (!isValid) {
                setDeleteError('Invalid password.');
                return;
            }

            const selectedRecords = sessions
                .filter((session) => selectedSessionIds.includes(session.sessionId))
                .map((session) => ({
                    sessionId: session.sessionId,
                    participantKey: session.participantKey,
                }));

            if (selectedRecords.length === 0) {
                setDeleteError('Selected sessions are no longer available.');
                return;
            }

            await deleteExperimentSessions(selectedRecords);

            setSessions((previous) => previous.filter((session) => !selectedSessionIds.includes(session.sessionId)));
            setSelectedSessionIds([]);
            setShowDeleteModal(false);
            setDeletePassword('');
            setDeleteSuccess(`Deleted ${selectedRecords.length} session${selectedRecords.length === 1 ? '' : 's'}.`);
        } catch (deleteSelectedError) {
            setDeleteError(deleteSelectedError instanceof Error ? deleteSelectedError.message : 'Could not delete selected sessions.');
        } finally {
            setIsDeleting(false);
        }
    }, [deletePassword, selectedSessionIds, sessions]);

    return (
        <div className="h-full min-h-0 flex items-center justify-center p-4 md:p-6 overflow-hidden">
            <div className="w-full max-w-6xl h-full panel p-6 md:p-8 flex flex-col min-h-0 relative">
                {selectedSession ? (
                    <Suspense
                        fallback={(
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-surface-500">Loading session details…</p>
                            </div>
                        )}
                    >
                        <SessionDetails
                            session={selectedSession}
                            onBack={() => setSelectedSession(null)}
                        />
                    </Suspense>
                ) : (
                    <>
                        <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                            <div>
                                <span className="chip">Experiment history</span>
                                <h2 className="text-2xl font-semibold text-surface-900 mt-3">Past sessions</h2>
                                <p className="text-sm text-surface-500 mt-1">View all previous participant sessions synced to Firebase.</p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={toggleDeleteMode}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDeleteMode
                                        ? 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                                        : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                >
                                    {isDeleteMode ? 'Cancel Delete' : 'Delete Sessions'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void loadHistory()}
                                    className="px-4 py-2 rounded-xl bg-surface-100 text-surface-700 text-sm font-semibold hover:bg-surface-200"
                                >
                                    Refresh
                                </button>
                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
                                >
                                    Back
                                </button>
                            </div>
                        </div>

                        <div className="mb-6 shrink-0">
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search by subject ID, participant details, key, or session id"
                                className="w-full md:max-w-lg rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 outline-none focus:ring-3 focus:ring-primary-100 focus:border-primary-400"
                            />
                        </div>

                        {isDeleteMode && (
                            <div className="mb-4 flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={selectAllFiltered}
                                    className="px-3 py-2 rounded-xl bg-surface-100 text-surface-700 text-sm font-semibold hover:bg-surface-200"
                                >
                                    Select all filtered
                                </button>
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="px-3 py-2 rounded-xl bg-surface-100 text-surface-700 text-sm font-semibold hover:bg-surface-200"
                                >
                                    Clear selection
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedCount === 0) {
                                            setDeleteError('Select at least one session to delete.');
                                            return;
                                        }
                                        setDeleteError(null);
                                        setDeleteSuccess(null);
                                        setDeletePassword('');
                                        setShowDeleteModal(true);
                                    }}
                                    className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:bg-red-300"
                                    disabled={selectedCount === 0}
                                >
                                    Delete selected ({selectedCount})
                                </button>
                            </div>
                        )}

                        {deleteSuccess && (
                            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm px-4 py-3 shrink-0">
                                {deleteSuccess}
                            </div>
                        )}

                        {deleteError && !showDeleteModal && (
                            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 shrink-0">
                                {deleteError}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-surface-200 bg-white/70 p-4">
                            {loading && <p className="text-sm text-surface-500">Loading history…</p>}

                            {!loading && error && (
                                <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
                                    {error}
                                </div>
                            )}

                            {!loading && !error && (
                                <div className="mb-4 rounded-xl border border-surface-200 bg-surface-50/70 p-4">
                                    <h3 className="text-sm font-semibold text-surface-900">Resumable sessions</h3>

                                    {filteredResumableDrafts.length === 0 ? (
                                        <p className="mt-2 text-sm text-surface-500">No in-progress sessions available.</p>
                                    ) : (
                                        <div className="mt-3 space-y-3">
                                            {filteredResumableDrafts.map((draft) => {
                                                const answeredCount = Object.keys(draft.assessments).length;
                                                return (
                                                    <div
                                                        key={`${draft.participantKey}-${draft.sessionId}`}
                                                        className="rounded-xl border border-surface-200 bg-white p-4"
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold text-surface-900">{participantPrimaryLabel(draft.participant)}</p>
                                                                <p className="text-xs text-surface-500 mt-1">{participantSecondaryLabel(draft.participant)}</p>
                                                                <p className="text-xs text-surface-500 mt-1">Session: {draft.sessionId}</p>
                                                            </div>

                                                            <div className="text-right text-xs text-surface-600">
                                                                <p>Last updated: {formatDateTime(draft.lastUpdatedAt)}</p>
                                                                <p>Texts answered: {answeredCount} / {draft.totalTexts}</p>
                                                            </div>

                                                            <div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onResumeDraft?.(draft)}
                                                                    className="px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
                                                                >
                                                                    Resume
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!loading && !error && filteredSessions.length === 0 && (
                                <p className="text-sm text-surface-500">No completed sessions found.</p>
                            )}

                            {!loading && !error && filteredSessions.length > 0 && (
                                <div className="space-y-3">
                                    {filteredSessions.map((session) => {
                                        const textCount = Object.keys(session.assessments).length;
                                        const isSelected = selectedSessionIds.includes(session.sessionId);

                                        if (!isDeleteMode) {
                                            return (
                                                <button
                                                    type="button"
                                                    key={session.sessionId}
                                                    onClick={() => setSelectedSession(session)}
                                                    className="w-full text-left rounded-xl border border-surface-200 bg-white p-4 cursor-pointer hover:border-primary-400 hover:shadow-md transition-all group focus:outline-none focus:ring-3 focus:ring-primary-100"
                                                    aria-label={`Open session ${session.sessionId} for ${participantPrimaryLabel(session.participant)}`}
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-surface-900">{participantPrimaryLabel(session.participant)}</p>
                                                            <p className="text-xs text-surface-500 mt-1">{participantSecondaryLabel(session.participant)}</p>
                                                            <p className="text-xs text-surface-500 mt-1">Session: {session.sessionId}</p>
                                                        </div>

                                                        <div className="text-right text-xs text-surface-600">
                                                            <p>Group: <strong>{session.assignedCondition}</strong></p>
                                                            <p>Started: {formatDateTime(session.startedAt)}</p>
                                                            <p>Completed: {formatDateTime(session.completedAt)}</p>
                                                            <p>Texts answered: {textCount} / {session.totalTexts}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        }

                                        return (
                                            <div
                                                key={session.sessionId}
                                                className={`w-full text-left rounded-xl border bg-white p-4 transition-all group ${isSelected
                                                    ? 'border-red-300 ring-2 ring-red-100'
                                                    : 'border-surface-200'}`}
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <label className="inline-flex items-center gap-2 text-sm text-surface-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSessionSelection(session.sessionId)}
                                                            className="h-4 w-4 rounded border-surface-300 text-red-600 focus:ring-red-200"
                                                            aria-label={`Select session ${session.sessionId} for deletion`}
                                                        />
                                                        Select
                                                    </label>

                                                    <div>
                                                        <p className="text-sm font-semibold text-surface-900">{participantPrimaryLabel(session.participant)}</p>
                                                        <p className="text-xs text-surface-500 mt-1">{participantSecondaryLabel(session.participant)}</p>
                                                        <p className="text-xs text-surface-500 mt-1">Session: {session.sessionId}</p>
                                                    </div>

                                                    <div className="text-right text-xs text-surface-600">
                                                        <p>Group: <strong>{session.assignedCondition}</strong></p>
                                                        <p>Started: {formatDateTime(session.startedAt)}</p>
                                                        <p>Completed: {formatDateTime(session.completedAt)}</p>
                                                        <p>Texts answered: {textCount} / {session.totalTexts}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {showDeleteModal && (
                            <div className="absolute inset-0 bg-surface-900/40 flex items-center justify-center p-4 z-20">
                                <div className="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
                                    <h3 className="text-lg font-semibold text-surface-900">Confirm deletion</h3>
                                    <p className="text-sm text-surface-600 mt-2">
                                        Enter settings password to delete {selectedCount} selected session{selectedCount === 1 ? '' : 's'}.
                                    </p>

                                    <div className="mt-4">
                                        <input
                                            type="password"
                                            value={deletePassword}
                                            onChange={(event) => {
                                                setDeletePassword(event.target.value);
                                                if (deleteError) setDeleteError(null);
                                            }}
                                            placeholder="Settings password"
                                            className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 outline-none focus:ring-3 focus:ring-primary-100 focus:border-primary-400"
                                        />
                                    </div>

                                    {deleteError && (
                                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
                                            {deleteError}
                                        </div>
                                    )}

                                    <div className="mt-5 flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={closeDeleteModal}
                                            className="px-4 py-2 rounded-xl bg-surface-100 text-surface-700 text-sm font-semibold hover:bg-surface-200"
                                            disabled={isDeleting}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleDeleteSelected()}
                                            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:bg-red-300"
                                            disabled={isDeleting || !deletePassword}
                                        >
                                            {isDeleting ? 'Deleting…' : `Delete selected (${selectedCount})`}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
