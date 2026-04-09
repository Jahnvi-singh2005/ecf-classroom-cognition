import { useMemo } from 'react';
import type { ExperimentSessionRecord } from '../types';

interface SessionDetailsProps {
    session: ExperimentSessionRecord;
    onBack: () => void;
}

const formatDateTime = (timestamp: number): string => {
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Invalid date';
    }
};

const formatDateTimeWithMs = (timestamp: number | null | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        return `${date.toLocaleString()} (${date.getMilliseconds().toString().padStart(3, '0')} ms)`;
    } catch {
        return 'Invalid date';
    }
};

const formatDuration = (ms: number | null): string => {
    if (ms === null || ms === undefined) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

export default function SessionDetails({ session, onBack }: SessionDetailsProps) {
    const textIds = useMemo(() => Object.keys(session.assessments || {}), [session.assessments]);
    const participantPrimaryLabel = session.participant.subjectId || session.participant.name || 'Unknown participant';
    const participantMetaLine = [
        session.participant.name && session.participant.subjectId ? `Name: ${session.participant.name}` : '',
        Number.isFinite(session.participant.age) ? `Age ${session.participant.age}` : '',
        session.participant.sex,
        session.participant.yearOfStudy ? `Year ${session.participant.yearOfStudy}` : '',
        session.participant.disciplineOfStudy,
        session.participant.email,
    ].filter(Boolean);

    return (
        <div className="flex flex-col h-full min-h-0 bg-white rounded-2xl w-full">
            {/* Header */}
            <div className="mb-5 flex items-center gap-4 border-b border-surface-200 pb-4 shrink-0">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 rounded-xl text-surface-500 hover:text-surface-900 hover:bg-surface-200 transition-all focus:outline-none"
                    title="Back to List"
                    type="button"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-surface-900 leading-tight">
                        {participantPrimaryLabel}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-surface-600 font-medium">
                        {participantMetaLine.length > 0 ? (
                            participantMetaLine.map((item, index) => (
                                <div key={`${item}-${index}`} className="inline-flex items-center gap-2">
                                    {index > 0 && <span className="text-surface-300">&bull;</span>}
                                    <span>{item}</span>
                                </div>
                            ))
                        ) : (
                            <span>No participant metadata</span>
                        )}
                        <span className="capitalize font-bold text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded-lg border border-primary-100">
                            Group: {session.assignedCondition}
                        </span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-2 pb-4 space-y-6">

                {/* Meta Settings Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-surface-50 p-4 rounded-xl border border-surface-200 flex flex-col">
                        <span className="text-xs uppercase text-surface-500 font-bold tracking-wider">Session ID</span>
                        <span className="mt-1.5 text-sm font-semibold text-surface-800 wrap-break-word">{session.sessionId}</span>
                    </div>
                    <div className="bg-surface-50 p-4 rounded-xl border border-surface-200 flex flex-col">
                        <span className="text-xs uppercase text-surface-500 font-bold tracking-wider">Timing</span>
                        <div className="mt-1.5 flex flex-col gap-1 text-sm font-semibold text-surface-800">
                            <span>Started: <span className="font-normal">{formatDateTime(session.startedAt)}</span></span>
                            <span>Ended: <span className="font-normal">{formatDateTime(session.completedAt)}</span></span>
                        </div>
                    </div>
                    <div className="bg-surface-50 p-4 rounded-xl border border-surface-200 flex flex-col sm:col-span-2">
                        <span className="text-xs uppercase text-surface-500 font-bold tracking-wider">Consent</span>
                        <div className="mt-1.5 text-sm text-surface-800">
                            {session.consent?.consentGiven
                                ? `Given at ${formatDateTime(session.consent.consentedAt)} (version ${session.consent.statementVersion})`
                                : 'Consent record unavailable (older session or consent not captured).'}
                        </div>
                    </div>

                    {session.learnerSelfReport && (
                        <div className="bg-surface-50 p-4 rounded-xl border border-surface-200 flex flex-col sm:col-span-2">
                            <span className="text-xs uppercase text-surface-500 font-bold tracking-wider">Learner Self Report</span>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-surface-700">
                                <span className="bg-white border border-surface-200 rounded-md px-2 py-1">General learning inclination: {session.learnerSelfReport.generalLearningInclination} / 7</span>
                                <span className="bg-white border border-surface-200 rounded-md px-2 py-1">Out-of-domain inclination: {session.learnerSelfReport.outOfDomainLearningInclination} / 7</span>
                                <span className="bg-white border border-surface-200 rounded-md px-2 py-1">In-domain inclination: {session.learnerSelfReport.inDomainLearningInclination} / 7</span>
                            </div>
                            <div className="mt-3 rounded-lg border border-surface-200 bg-white p-3 text-sm text-surface-800">
                                {session.learnerSelfReport.academicIntelligenceReflection}
                            </div>
                        </div>
                    )}
                </div>

                {textIds.length === 0 && (
                    <div className="text-center p-8 bg-surface-50 rounded-xl border border-surface-200">
                        <p className="text-surface-500 font-medium">No assessments were completed in this session.</p>
                    </div>
                )}

                {/* Iterate texts */}
                {textIds.map((textId, index) => {
                    const textData = session.assessments[textId];
                    const feedbackCount = Object.keys(textData.feedbackRatings || {}).length;
                    const readingMarkers = [...(session.readingAdvanceMarkers || [])]
                        .filter((marker) => marker.textId === textId)
                        .sort((a, b) => a.textIndex - b.textIndex || a.slideIndex - b.slideIndex || a.markedAt - b.markedAt);

                    return (
                        <div key={textId} className="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="bg-linear-to-r from-surface-50 to-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-200">
                                <h3 className="font-bold text-surface-800 text-lg flex items-center gap-2">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs">{index + 1}</span>
                                    {textData.textTitle}
                                </h3>
                                <div className="flex items-center text-xs text-surface-500 font-semibold bg-surface-100 px-3 py-1.5 rounded-lg border border-surface-200">
                                    <svg className="w-4 h-4 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Submitted: {formatDateTime(textData.submittedAt)}
                                </div>
                            </div>

                            <div className="p-5 space-y-6">
                                {/* Responses */}
                                {textData.subjectiveResponses?.length > 0 ? (
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-bold uppercase tracking-wider text-surface-400 mb-3 ml-1">Questions &amp; Answers</h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            {textData.subjectiveResponses.map((resp, idx) => (
                                                <div key={resp.questionId} className="bg-surface-50 rounded-xl p-5 border border-surface-200/60 shadow-sm relative overflow-hidden group">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-surface-200 group-hover:bg-primary-400 transition-colors"></div>
                                                    <div className="flex gap-3 mb-3 pl-1">
                                                        <span className="text-primary-600 font-black shrink-0 text-base">Q{idx + 1}.</span>
                                                        <p className="text-sm font-bold text-surface-800 leading-snug pt-0.5">{resp.prompt}</p>
                                                    </div>
                                                    <div className="pl-7 space-y-3.5">
                                                        <div className="bg-white border border-surface-200/80 rounded-lg p-4 text-sm text-surface-700 leading-relaxed shadow-sm min-h-12">
                                                            {resp.response ? resp.response : <span className="italic text-surface-400">No response provided</span>}
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                                            <div className="rounded-lg border border-surface-200 bg-white px-3 py-2">
                                                                <p className="text-surface-500 font-semibold">T1 Question appears</p>
                                                                <p className="text-surface-800 mt-1">{formatDateTimeWithMs(resp.timestamps?.t1QuestionShown)}</p>
                                                            </div>
                                                            <div className="rounded-lg border border-surface-200 bg-white px-3 py-2">
                                                                <p className="text-surface-500 font-semibold">T2 Space pressed</p>
                                                                <p className="text-surface-800 mt-1">{formatDateTimeWithMs(resp.timestamps?.t2TypingStarted)}</p>
                                                            </div>
                                                            <div className="rounded-lg border border-surface-200 bg-white px-3 py-2">
                                                                <p className="text-surface-500 font-semibold">T3 First keypress</p>
                                                                <p className="text-surface-800 mt-1">{formatDateTimeWithMs(resp.timestamps?.t3FirstKeypress)}</p>
                                                            </div>
                                                            <div className="rounded-lg border border-surface-200 bg-white px-3 py-2">
                                                                <p className="text-surface-500 font-semibold">T4 Submitted</p>
                                                                <p className="text-surface-800 mt-1">{formatDateTimeWithMs(resp.timestamps?.t4Submitted)}</p>
                                                            </div>
                                                        </div>

                                                        {/* Metrics for this response */}
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
                                                            {resp.autoSubmitted && (
                                                                <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 flex items-center gap-1.5">
                                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                                                    Auto-submitted
                                                                </span>
                                                            )}
                                                            <span className="text-surface-600 bg-surface-100 px-2.5 py-1 rounded-md border border-surface-200" title="Words written">Words: {resp.wordCount}</span>
                                                            <span className="text-surface-600 bg-surface-100 px-2.5 py-1 rounded-md border border-surface-200" title="T2 - T1">Thinking time: {formatDuration(resp.metrics?.thinkingTimeMs)}</span>
                                                            <span className="text-surface-600 bg-surface-100 px-2.5 py-1 rounded-md border border-surface-200" title="T3 - T2">First keypress latency: {formatDuration(resp.metrics?.firstKeypressLatencyMs)}</span>
                                                            <span className="text-surface-600 bg-surface-100 px-2.5 py-1 rounded-md border border-surface-200" title="T4 - T2">Total response time: {formatDuration(resp.metrics?.totalResponseTimeMs)}</span>
                                                            <span className="text-surface-600 bg-surface-100 px-2.5 py-1 rounded-md border border-surface-200" title="T4 - T1">Total question time: {formatDuration(resp.metrics?.totalQuestionTimeMs)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-surface-500 italic bg-surface-50 p-4 rounded-xl border border-surface-100">No responses recorded for this text.</p>
                                )}

                                {readingMarkers.length > 0 && (
                                    <div className="pt-2">
                                        <h4 className="text-sm font-bold uppercase tracking-wider text-surface-400 mb-3 ml-1">Reading slide markers</h4>
                                        <div className="space-y-2">
                                            {readingMarkers.map((marker, markerIndex) => (
                                                <div key={`${textId}-${marker.slideIndex}-${marker.markedAt}-${markerIndex}`} className="rounded-xl border border-surface-200 bg-surface-50/70 p-3 text-xs text-surface-700">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="font-semibold text-surface-900">
                                                            Slide {marker.slideIndex + 1} / {marker.totalSlides}
                                                        </p>
                                                        <span className={`inline-flex px-2 py-0.5 rounded-md border ${marker.advancedBy === 'auto-timeout'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            }`}
                                                        >
                                                            {marker.advancedBy === 'auto-timeout' ? 'Auto next' : 'Manual next'}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <span className="bg-white border border-surface-200 rounded-md px-2 py-1">Marked: {formatDateTimeWithMs(marker.markedAt)}</span>
                                                        <span className="bg-white border border-surface-200 rounded-md px-2 py-1">Elapsed: {formatDuration(marker.elapsedMs)}</span>
                                                        <span className="bg-white border border-surface-200 rounded-md px-2 py-1">Min: {formatDuration(marker.minTimeMs)}</span>
                                                        <span className="bg-white border border-surface-200 rounded-md px-2 py-1">Max: {formatDuration(marker.maxTimeMs)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Feedback */}
                                {feedbackCount > 0 && (
                                    <div className="pt-2">
                                        <h4 className="text-sm font-bold uppercase tracking-wider text-surface-400 mb-3 ml-1">Self-Reported Feedback</h4>
                                        <div className="flex flex-wrap gap-3">
                                            {Object.entries(textData.feedbackRatings).map(([key, value]) => (
                                                <div key={key} className="flex flex-col gap-1.5 bg-indigo-50/50 border border-indigo-100/80 rounded-xl p-3 min-w-30">
                                                    <span className="text-[11px] text-indigo-900/60 font-black uppercase tracking-widest">{key}</span>
                                                    <div className="flex items-end gap-2">
                                                        <span className="text-2xl font-black text-indigo-600 leading-none">{value}</span>
                                                        <span className="text-xs font-bold text-indigo-300 mb-0.5">/ 7</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
