import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    FeedbackQuestion,
    PostAssessmentSettings,
    Question,
    SubjectiveResponse,
    TextAssessmentResult,
} from '../types';

interface PostAssessmentProps {
    textId: string;
    textTitle: string;
    questions: Question[];
    feedbackQuestions: FeedbackQuestion[];
    settings: PostAssessmentSettings;
    onSubmit: (result: TextAssessmentResult) => void;
}

interface ActiveQuestionState {
    questionId: string;
    questionType: 'mcq' | 'objective' | 'short-answer';
    prompt: string;
    response: string;
    selectedOptionId: string | null;
    t1QuestionShown: number;
    t2TypingStarted: number | null;
    t3FirstKeypress: number | null;
}

const wordsIn = (text: string): number => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
};

const clampWords = (value: string, limit: number): string => {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length <= limit) return value;
    return words.slice(0, limit).join(' ');
};

const isObjectiveQuestion = (type?: Question['type']): boolean => type === 'mcq' || type === 'objective';

export default function PostAssessment({
    textId,
    textTitle,
    questions,
    feedbackQuestions,
    settings,
    onSubmit,
}: PostAssessmentProps) {
    const normalizedQuestions = useMemo(
        () => questions.filter((q) => Boolean(q?.id && q?.question?.trim())),
        [questions],
    );

    const [stage, setStage] = useState<'subjective' | 'feedback'>(
        normalizedQuestions.length > 0 ? 'subjective' : 'feedback',
    );
    const [index, setIndex] = useState(0);
    const [mode, setMode] = useState<'thinking' | 'typing'>('thinking');
    const [elapsedMs, setElapsedMs] = useState(0);
    const [responses, setResponses] = useState<SubjectiveResponse[]>([]);
    const [hint, setHint] = useState<string | null>(null);
    const [ratings, setRatings] = useState<Record<string, number>>({});

    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
    const autoSubmittedRef = useRef(false);

    const currentQuestion = normalizedQuestions[index];
    const hasQuestions = normalizedQuestions.length > 0;

    const [activeQuestion, setActiveQuestion] = useState<ActiveQuestionState>(() => ({
        questionId: currentQuestion?.id || 'no-question',
        questionType: currentQuestion?.type || 'short-answer',
        prompt: currentQuestion?.question || 'No question configured.',
        response: '',
        selectedOptionId: null,
        t1QuestionShown: Date.now(),
        t2TypingStarted: isObjectiveQuestion(currentQuestion?.type) ? Date.now() : null,
        t3FirstKeypress: null,
    }));

    const minQuestionMs = (currentQuestion?.minSeconds ?? settings.questionMinSeconds) * 1000;
    const maxQuestionMs = (currentQuestion?.maxSeconds ?? settings.questionMaxSeconds) * 1000;
    const minThinkingMs = isObjectiveQuestion(currentQuestion?.type) ? 0 : settings.thinkingMinSeconds * 1000;
    const maxWords = currentQuestion?.wordLimit ?? settings.wordLimit;

    const canStartTyping = elapsedMs >= minThinkingMs;
    const canSubmit = elapsedMs >= minQuestionMs;
    const questionRemainingMs = Math.max(maxQuestionMs - elapsedMs, 0);
    const minRemainingMs = Math.max(minQuestionMs - elapsedMs, 0);
    const thinkingRemainingMs = Math.max(minThinkingMs - elapsedMs, 0);

    const feedbackScale = useMemo(() => {
        const values: number[] = [];
        for (let i = settings.feedbackScaleMin; i <= settings.feedbackScaleMax; i += 1) {
            values.push(i);
        }
        return values;
    }, [settings.feedbackScaleMin, settings.feedbackScaleMax]);

    const resetForNextQuestion = useCallback((nextIndex: number) => {
        const nextQuestion = normalizedQuestions[nextIndex];
        if (!nextQuestion) {
            setStage('feedback');
            return;
        }

        setElapsedMs(0);
        setHint(null);
        setMode(isObjectiveQuestion(nextQuestion.type) ? 'typing' : 'thinking');
        setActiveQuestion({
            questionId: nextQuestion.id,
            questionType: nextQuestion.type,
            prompt: nextQuestion.question,
            response: '',
            selectedOptionId: null,
            t1QuestionShown: Date.now(),
            t2TypingStarted: isObjectiveQuestion(nextQuestion.type) ? Date.now() : null,
            t3FirstKeypress: null,
        });
    }, [normalizedQuestions]);

    useEffect(() => {
        if (stage !== 'subjective') return;
        autoSubmittedRef.current = false;

        const interval = setInterval(() => {
            setElapsedMs((prev) => prev + 100);
        }, 100);

        return () => clearInterval(interval);
    }, [stage, index]);

    const goNext = useCallback((autoSubmitted: boolean) => {
        const t4Submitted = Date.now();
        const selectedOptionText = (currentQuestion?.options || []).find(
            (option) => option.id === activeQuestion.selectedOptionId,
        )?.text;
        const finalResponse = isObjectiveQuestion(activeQuestion.questionType)
            ? (selectedOptionText || '')
            : activeQuestion.response.trim();
        const wordCount = wordsIn(finalResponse);

        const response: SubjectiveResponse = {
            questionId: activeQuestion.questionId,
            prompt: activeQuestion.prompt,
            response: finalResponse,
            questionType: activeQuestion.questionType,
            selectedOptionId: activeQuestion.selectedOptionId,
            selectedOptionText: selectedOptionText || null,
            wordCount,
            autoSubmitted,
            timestamps: {
                t1QuestionShown: activeQuestion.t1QuestionShown,
                t2TypingStarted: activeQuestion.t2TypingStarted,
                t3FirstKeypress: activeQuestion.t3FirstKeypress,
                t4Submitted,
            },
            metrics: {
                thinkingTimeMs:
                    activeQuestion.t2TypingStarted === null
                        ? null
                        : activeQuestion.t2TypingStarted - activeQuestion.t1QuestionShown,
                firstKeypressLatencyMs:
                    activeQuestion.t2TypingStarted === null || activeQuestion.t3FirstKeypress === null
                        ? null
                        : activeQuestion.t3FirstKeypress - activeQuestion.t2TypingStarted,
                totalResponseTimeMs:
                    activeQuestion.t2TypingStarted === null
                        ? null
                        : t4Submitted - activeQuestion.t2TypingStarted,
                totalQuestionTimeMs: t4Submitted - activeQuestion.t1QuestionShown,
            },
        };

        setResponses((prev) => {
            const next = [...prev, response];
            if (index < normalizedQuestions.length - 1) {
                setIndex((prevIndex) => prevIndex + 1);
                resetForNextQuestion(index + 1);
            } else {
                setStage('feedback');
            }
            return next;
        });
    }, [activeQuestion, currentQuestion?.options, index, normalizedQuestions.length, resetForNextQuestion]);

    useEffect(() => {
        if (stage !== 'subjective') return;
        if (elapsedMs >= maxQuestionMs && !autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            const timeout = window.setTimeout(() => goNext(true), 0);
            return () => window.clearTimeout(timeout);
        }
    }, [elapsedMs, maxQuestionMs, goNext, stage]);

    const startTyping = useCallback(() => {
        if (isObjectiveQuestion(currentQuestion?.type)) return;
        if (!canStartTyping) {
            setHint(`You can start typing in ${Math.ceil(thinkingRemainingMs / 1000)}s.`);
            return;
        }

        setHint('Typing window open. Press Ctrl + Enter again to submit.');
        setMode('typing');
        setActiveQuestion((prev) => ({
            ...prev,
            t2TypingStarted: prev.t2TypingStarted ?? Date.now(),
        }));

        requestAnimationFrame(() => {
            textAreaRef.current?.focus();
            textAreaRef.current?.setSelectionRange(
                textAreaRef.current.value.length,
                textAreaRef.current.value.length,
            );
        });
    }, [canStartTyping, currentQuestion?.type, thinkingRemainingMs]);

    const submitTyping = useCallback(() => {
        if (!canSubmit) {
            setHint(`You can submit in ${Math.ceil(minRemainingMs / 1000)}s.`);
            return;
        }

        if (isObjectiveQuestion(currentQuestion?.type) && !activeQuestion.selectedOptionId) {
            setHint('Please select one option before submitting.');
            return;
        }

        goNext(false);
    }, [activeQuestion.selectedOptionId, canSubmit, currentQuestion?.type, goNext, minRemainingMs]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (stage !== 'subjective' || !hasQuestions || isObjectiveQuestion(currentQuestion?.type)) return;

            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (mode === 'thinking') {
                    startTyping();
                } else {
                    submitTyping();
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [currentQuestion?.type, hasQuestions, mode, stage, startTyping, submitTyping]);

    const handleTextareaChange = (value: string) => {
        setActiveQuestion((prev) => ({
            ...prev,
            response: clampWords(value, maxWords),
        }));
    };

    const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            return;
        }

        setActiveQuestion((prev) => {
            if (prev.t3FirstKeypress !== null) return prev;
            return {
                ...prev,
                t3FirstKeypress: Date.now(),
            };
        });
    };

    const handleMcqSelection = (optionId: string) => {
        setHint(null);
        setActiveQuestion((prev) => ({
            ...prev,
            selectedOptionId: optionId,
            t2TypingStarted: prev.t2TypingStarted ?? Date.now(),
            t3FirstKeypress: prev.t3FirstKeypress ?? Date.now(),
        }));
    };

    const handleRatingChange = (questionId: string, value: number) => {
        setRatings((prev) => ({
            ...prev,
            [questionId]: value,
        }));
    };

    const submitFeedback = () => {
        const allRated = feedbackQuestions.every((item) => typeof ratings[item.id] === 'number');
        if (!allRated) {
            setHint('Please provide all feedback ratings before continuing.');
            return;
        }

        onSubmit({
            textId,
            textTitle,
            subjectiveResponses: responses,
            feedbackRatings: ratings,
            submittedAt: Date.now(),
        });
    };

    if (stage === 'feedback') {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-3xl panel p-8 md:p-10">
                    <div className="mb-6">
                        <span className="chip">Post-assessment feedback</span>
                        <h2 className="text-2xl font-semibold text-surface-900 mt-3">How did this text feel?</h2>
                        <p className="text-surface-500 text-sm mt-1">Rate each item from {settings.feedbackScaleMin} (low) to {settings.feedbackScaleMax} (high).</p>
                    </div>

                    <div className="space-y-5">
                        {feedbackQuestions.map((item, itemIndex) => (
                            <div key={item.id} className="rounded-2xl border border-surface-200 bg-white/70 p-5">
                                <p className="text-sm font-medium text-surface-800 mb-3">
                                    <span className="text-primary-600 mr-2">{itemIndex + 1}.</span>
                                    {item.prompt}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {feedbackScale.map((scaleValue) => {
                                        const selected = ratings[item.id] === scaleValue;
                                        return (
                                            <button
                                                key={scaleValue}
                                                onClick={() => handleRatingChange(item.id, scaleValue)}
                                                className={`w-10 h-10 rounded-xl text-sm font-semibold transition-all cursor-pointer ${selected
                                                    ? 'bg-primary-600 text-white shadow-md shadow-primary-300/40'
                                                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                                                    }`}
                                                type="button"
                                            >
                                                {scaleValue}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* {hint && <p className="text-sm text-amber-600 mt-4">{hint}</p>} */}

                    <button
                        onClick={submitFeedback}
                        type="button"
                        className="w-full mt-7 py-3.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98] transition-all cursor-pointer"
                    >
                        Submit feedback & continue →
                    </button>
                </div>
            </div>
        );
    }

    const wordCount = wordsIn(activeQuestion.response);
    const isMcq = isObjectiveQuestion(currentQuestion?.type);
    const isThinking = mode === 'thinking' && !isMcq;
    const thinkingSecondsLeft = Math.ceil(thinkingRemainingMs / 1000);
    const totalSecondsLeft = Math.ceil(questionRemainingMs / 1000);
    const thinkingProgress = minThinkingMs > 0 ? Math.min((elapsedMs / minThinkingMs) * 100, 100) : 100;
    const heading = currentQuestion?.heading || `QUESTION - ${index + 1}`;

    return (
        <div className="flex-1 flex items-center justify-center p-4 md:p-6">
            <div className="w-full max-w-3xl panel p-6 md:p-8">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                        <span className="chip">Post-reading assessment</span>
                        <h2 className="text-2xl font-semibold text-surface-900 mt-2">{textTitle}</h2>
                    </div>
                    <div className="text-right text-xs text-surface-500">
                        <div>{heading}</div>
                        <div>Question {index + 1} / {normalizedQuestions.length}</div>
                        {!isMcq && <div className="mt-1">Max {maxWords} words</div>}
                    </div>
                </div>

                <div className="mb-4 rounded-2xl border border-surface-200 bg-white/80 p-4 md:p-5">
                    <p className="text-sm font-semibold text-surface-800 mb-2">{heading}</p>
                    <p className="text-surface-700 leading-relaxed">{currentQuestion?.question || activeQuestion.prompt}</p>
                </div>

                {isMcq ? (
                    <div className="space-y-2 mb-4">
                        {(currentQuestion?.options || []).map((option, optionIndex) => {
                            const label = option.label || option.id || String.fromCharCode(65 + optionIndex);
                            const selected = activeQuestion.selectedOptionId === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => handleMcqSelection(option.id)}
                                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all cursor-pointer ${selected
                                        ? 'border-primary-400 bg-primary-50 text-primary-900'
                                        : 'border-surface-200 bg-white hover:bg-surface-50'
                                        }`}
                                >
                                    <span className="font-semibold mr-2">{label})</span>
                                    <span>{option.text}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        <div className="grid md:grid-cols-[1.3fr_1fr] gap-3 mb-4">
                            <div className={`rounded-2xl border p-4 ${isThinking ? 'border-warning bg-yellow-50/70' : 'border-accent bg-emerald-50/70'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-surface-600">Current mode</p>
                                    <span className={`inline-flex w-2.5 h-2.5 rounded-full ${isThinking ? 'bg-warning animate-pulse' : 'bg-accent'}`} />
                                </div>
                                <p className="text-lg font-bold text-surface-900">{isThinking ? 'Thinking window' : 'Typing window'}</p>
                                <p className="text-sm text-surface-600 mt-1">
                                    {isThinking
                                        ? `Think for ${thinkingSecondsLeft}s more, then press Ctrl + Enter to start typing.`
                                        : 'Type your answer and press Ctrl + Enter to submit.'}
                                </p>

                                <div className="mt-3 h-1.5 bg-white/80 rounded-full overflow-hidden border border-surface-200">
                                    <div
                                        className={`h-full transition-all duration-100 ${isThinking ? 'bg-warning' : 'bg-accent'}`}
                                        style={{ width: `${isThinking ? thinkingProgress : 100}%` }}
                                    />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-surface-200 bg-white/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-surface-600 mb-2">Timing guide</p>
                                <div className="space-y-1 text-sm text-surface-700">
                                    <p>Thinking min: <strong>{settings.thinkingMinSeconds}s</strong></p>
                                    <p>Total min: <strong>{Math.floor(minQuestionMs / 1000)}s</strong></p>
                                    <p>Auto-next: <strong>{Math.floor(maxQuestionMs / 1000)}s</strong></p>
                                    <p>Max words: <strong>{maxWords}</strong></p>
                                    {(currentQuestion?.minWords && currentQuestion?.maxWords) && (
                                        <p>Target words: <strong>{currentQuestion.minWords}–{currentQuestion.maxWords}</strong></p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <textarea
                            ref={textAreaRef}
                            value={activeQuestion.response}
                            onChange={(e) => handleTextareaChange(e.target.value)}
                            onKeyDown={handleTextareaKeyDown}
                            disabled={mode !== 'typing'}
                            placeholder={mode === 'thinking' ? 'Thinking window active...' : 'Type your response here...'}
                            rows={8}
                            className={`w-full px-4 py-3 rounded-2xl border-2 outline-none text-surface-800 bg-white placeholder:text-surface-400 transition-all resize-none ${isThinking
                                ? 'border-warning/50 bg-surface-100/80 text-surface-500'
                                : 'border-accent/50 focus:border-primary-400 focus:ring-4 focus:ring-primary-100'
                                } disabled:bg-surface-100 disabled:text-surface-400`}
                        />

                        <div className="mt-3 flex items-center justify-between text-xs text-surface-500">
                            <span>{wordCount} / {maxWords} words</span>
                            <span>{totalSecondsLeft}s left</span>
                        </div>
                    </>
                )}

                <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700">
                    <p>Minimum - {Math.floor(minQuestionMs / 1000)} seconds; maximum – {Math.floor(maxQuestionMs / 1000)} seconds</p>
                    {currentQuestion?.notes?.map((note, noteIndex) => (
                        <p key={`${currentQuestion.id}-note-${noteIndex}`} className="mt-1">• {note}</p>
                    ))}
                </div>

                {hint && (
                    <p className="text-sm text-amber-700 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">{hint}</p>
                )}

                <div className="mt-4 flex justify-end">
                    {!isMcq && mode === 'thinking' ? (
                        <button
                            type="button"
                            onClick={startTyping}
                            className="px-5 py-2.5 rounded-xl bg-surface-100 text-surface-700 font-semibold hover:bg-surface-200 transition-all cursor-pointer"
                        >
                            Start typing (Ctrl + Enter)
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={submitTyping}
                            className="px-5 py-2.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98] transition-all cursor-pointer"
                        >
                            Submit answer →
                        </button>
                    )}
                </div>

                <div
                    className="mt-5 h-2 bg-surface-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label="Question timer"
                    aria-valuemin={0}
                    aria-valuemax={maxQuestionMs}
                    aria-valuenow={Math.min(elapsedMs, maxQuestionMs)}
                >
                    <div
                        className={`h-full transition-all duration-100 ${elapsedMs < minQuestionMs ? 'bg-warning' : 'bg-accent'}`}
                        style={{ width: `${Math.min((elapsedMs / maxQuestionMs) * 100, 100)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
