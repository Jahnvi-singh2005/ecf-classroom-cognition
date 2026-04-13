import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReadingAdvanceMarker } from '../types';

interface ReadingSlideProps {
    textId: string;
    text: string;
    slideIndex: number;
    totalSlides: number;
    textTitle: string;
    textIndex: number;
    totalTexts: number;
    minTimeSeconds: number;
    maxTimeSeconds: number;
    onNext: (marker: ReadingAdvanceMarker) => void;
}

export default function ReadingSlide({
    textId,
    text,
    slideIndex,
    totalSlides,
    textTitle,
    textIndex,
    totalTexts,
    minTimeSeconds,
    maxTimeSeconds,
    onNext,
}: ReadingSlideProps) {
    const [elapsedMs, setElapsedMs] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasAutoAdvanced = useRef(false);
    const tickMs = 100;

    // Guard against invalid timer configuration so unlock always happens before auto-advance.
    const safeMaxSeconds = Math.max(maxTimeSeconds, 1);
    const safeMinSeconds = Math.min(Math.max(minTimeSeconds, 0), Math.max(safeMaxSeconds - 0.1, 0));
    const maxTimeMs = Math.round(safeMaxSeconds * 1000);
    const minTimeMs = Math.round(safeMinSeconds * 1000);

    const canProceed = elapsedMs >= minTimeMs;

    const buildAdvanceMarker = useCallback((advancedBy: ReadingAdvanceMarker['advancedBy']): ReadingAdvanceMarker => ({
        textId,
        textTitle,
        textIndex,
        slideIndex,
        totalSlides,
        advancedBy,
        markedAt: Date.now(),
        elapsedMs: Math.min(elapsedMs, maxTimeMs),
        minTimeMs,
        maxTimeMs,
    }), [elapsedMs, maxTimeMs, minTimeMs, slideIndex, textId, textIndex, textTitle, totalSlides]);

    // Start timer for this slide
    useEffect(() => {
        hasAutoAdvanced.current = false;
        const startedAt = performance.now();

        intervalRef.current = setInterval(() => {
            const nextElapsed = Math.min(Math.round(performance.now() - startedAt), maxTimeMs);
            setElapsedMs(nextElapsed);
        }, tickMs);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [slideIndex, textIndex, maxTimeMs]);

    // Auto-advance after max time
    const handleAutoAdvance = useCallback(() => {
        if (!hasAutoAdvanced.current) {
            hasAutoAdvanced.current = true;
            onNext(buildAdvanceMarker('auto-timeout'));
        }
    }, [buildAdvanceMarker, onNext]);

    const handleManualAdvance = useCallback(() => {
        if (!canProceed || hasAutoAdvanced.current) return;
        hasAutoAdvanced.current = true;
        onNext(buildAdvanceMarker('manual-spacebar-or-next'));
    }, [buildAdvanceMarker, canProceed, onNext]);

    useEffect(() => {
        if (elapsedMs >= maxTimeMs) {
            handleAutoAdvance();
        }
    }, [elapsedMs, maxTimeMs, handleAutoAdvance]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== ' ') return;

            const target = event.target as HTMLElement | null;
            if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
                return;
            }

            event.preventDefault();
            handleManualAdvance();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleManualAdvance]);

    const progressRatio = Math.min(Math.max(elapsedMs / maxTimeMs, 0), 1);
    const progressPercent = progressRatio * 100;
    const minProgressPercent = (minTimeMs / maxTimeMs) * 100;

    const renderedParagraphs = useMemo(() => {
        // Parse slide text only when the text itself changes.
        const paragraphs = text.split('\n').filter((p) => p.trim());
        return paragraphs.map((para, i) => {
            const isHeading = /^(\d+\.?\s|#+\s)/.test(para.trim());
            if (isHeading) {
                return (
                    <h3 key={i} className="text-base md:text-lg font-bold text-surface-900 mt-3 mb-2 first:mt-0">
                        {para.replace(/^#+\s/, '')}
                    </h3>
                );
            }

            if (/^[•*-]\s/.test(para.trim())) {
                return (
                    <p key={i} className="text-surface-700 leading-relaxed text-[14px] md:text-[15px] pl-4 py-0.5">
                        <span className="text-primary-400 mr-2">•</span>
                        {para.replace(/^[•*-]\s/, '')}
                    </p>
                );
            }

            return (
                <p key={i} className="text-surface-700 leading-[1.7] text-[14px] md:text-[15px] mb-2.5">
                    {para}
                </p>
            );
        });
    }, [text]);

    return (
        <div className="h-full min-h-0 flex flex-col p-3 md:p-4 max-w-5xl mx-auto w-full overflow-hidden">
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-primary-100 text-primary-700 text-xs font-semibold">
                        Text {textIndex + 1}/{totalTexts}
                    </span>
                    <span className="text-xs md:text-sm text-surface-500 font-medium truncate max-w-[42vw] md:max-w-none">
                        {textTitle}
                    </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-surface-400 font-medium">
                        Slide {slideIndex + 1} of {totalSlides}
                    </span>
                </div>
            </div>

            {/* Slide Dots */}
            <div className="flex items-center gap-1.5 mb-3 justify-center shrink-0">
                {Array.from({ length: totalSlides }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-300 ${i < slideIndex
                            ? 'w-6 bg-primary-400'
                            : i === slideIndex
                                ? 'w-8 bg-primary-500'
                                : 'w-4 bg-surface-200'
                            }`}
                    />
                ))}
            </div>

            {/* Main Reading Card */}
            <div className="flex-1 min-h-0 bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/20 border border-white/50 p-4 md:p-7 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <div className="prose prose-surface max-w-none">
                        {renderedParagraphs}
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="mt-3 shrink-0 bg-white/75 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 p-3 md:p-3.5">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-surface-500">
                        {canProceed
                            ? 'Press Spacebar or use Next when ready.'
                            : 'Keep reading. Continue will unlock shortly.'}
                    </p>

                    <button
                        onClick={handleManualAdvance}
                        disabled={!canProceed}
                        className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer ${canProceed
                            ? 'bg-linear-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.97]'
                            : 'bg-surface-100 text-surface-400 cursor-not-allowed'
                            }`}
                    >
                        {slideIndex === totalSlides - 1 ? 'Finish Reading' : 'Next Slide'} →
                    </button>
                </div>

                <div
                    className="relative mt-3 h-2 bg-surface-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label="Slide reading progress"
                    aria-valuemin={0}
                    aria-valuemax={maxTimeMs}
                    aria-valuenow={Math.min(elapsedMs, maxTimeMs)}
                >
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-surface-400 z-10"
                        style={{ left: `${minProgressPercent}%` }}
                    />
                    <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-100 ease-linear ${elapsedMs < minTimeMs
                            ? 'bg-linear-to-r from-warning to-yellow-400'
                            : 'bg-linear-to-r from-accent to-primary-400'
                            }`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
