import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ExperimentSessionRecord } from '../types';
import { getExperimentHistory } from '../services/ExperimentDataService';
import { hasFirebaseConfig, firebaseInitError } from '../services/firebase';

const SessionDetails = lazy(() => import('./SessionDetails'));

interface HistoryPageProps {
    onBack: () => void;
}

const formatDateTime = (timestamp: number): string => {
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Invalid date';
    }
};

export default function HistoryPage({ onBack }: HistoryPageProps) {
    const [sessions, setSessions] = useState<ExperimentSessionRecord[]>([]);
    const [selectedSession, setSelectedSession] = useState<ExperimentSessionRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');

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
            const email = item.participant.email?.toLowerCase() || '';
            return (
                item.participant.name.toLowerCase().includes(normalized)
                || email.includes(normalized)
                || item.sessionId.toLowerCase().includes(normalized)
                || item.participantKey.toLowerCase().includes(normalized)
            );
        });
    }, [query, sessions]);

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
                                placeholder="Search by participant, email, key, or session id"
                                className="w-full md:max-w-lg rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 outline-none focus:ring-3 focus:ring-primary-100 focus:border-primary-400"
                            />
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-surface-200 bg-white/70 p-4">
                            {loading && <p className="text-sm text-surface-500">Loading history…</p>}

                            {!loading && error && (
                                <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
                                    {error}
                                </div>
                            )}

                            {!loading && !error && filteredSessions.length === 0 && (
                                <p className="text-sm text-surface-500">No sessions found.</p>
                            )}

                            {!loading && !error && filteredSessions.length > 0 && (
                                <div className="space-y-3">
                                    {filteredSessions.map((session) => {
                                        const textCount = Object.keys(session.assessments).length;
                                        return (
                                            <button
                                                type="button"
                                                key={session.sessionId}
                                                onClick={() => setSelectedSession(session)}
                                                className="w-full text-left rounded-xl border border-surface-200 bg-white p-4 cursor-pointer hover:border-primary-400 hover:shadow-md transition-all group focus:outline-none focus:ring-3 focus:ring-primary-100"
                                                aria-label={`Open session ${session.sessionId} for ${session.participant.name}`}
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-surface-900">{session.participant.name}</p>
                                                        <p className="text-xs text-surface-500 mt-1">{session.participant.email || 'No email'} · Age {session.participant.age}</p>
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
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
