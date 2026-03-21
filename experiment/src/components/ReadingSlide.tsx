import { useState, useEffect, useCallback, useRef } from 'react';

interface ReadingSlideProps {
    text: string;
    slideIndex: number;
    totalSlides: number;
    textTitle: string;
    textIndex: number;
    totalTexts: number;
    minTimeSeconds: number;
    maxTimeSeconds: number;
    onNext: () => void;
}

export default function ReadingSlide({
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
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasAutoAdvanced = useRef(false);
    const canProceed = elapsed >= minTimeSeconds;

    // Start timer for this slide
    useEffect(() => {
        hasAutoAdvanced.current = false;

        intervalRef.current = setInterval(() => {
            setElapsed((prev) => prev + 1);
        }, 1000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [slideIndex, textIndex]);

    // Auto-advance after max time
    const handleAutoAdvance = useCallback(() => {
        if (!hasAutoAdvanced.current) {
            hasAutoAdvanced.current = true;
            onNext();
        }
    }, [onNext]);

    const handleManualAdvance = useCallback(() => {
        if (!canProceed || hasAutoAdvanced.current) return;
        hasAutoAdvanced.current = true;
        onNext();
    }, [canProceed, onNext]);

    useEffect(() => {
        if (elapsed >= maxTimeSeconds) {
            handleAutoAdvance();
        }
    }, [elapsed, maxTimeSeconds, handleAutoAdvance]);

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

    const progressPercent = Math.min((elapsed / maxTimeSeconds) * 100, 100);
    const minProgressPercent = (minTimeSeconds / maxTimeSeconds) * 100;
    const remainingToMin = Math.max(minTimeSeconds - elapsed, 0);
    const remainingToMax = Math.max(maxTimeSeconds - elapsed, 0);

    // Render text paragraphs (split on newlines)
    const paragraphs = text.split('\n').filter((p) => p.trim());

    return (
        <div className="flex-1 flex flex-col p-4 md:p-6 max-w-4xl mx-auto w-full">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-primary-100 text-primary-700 text-xs font-semibold">
                        Text {textIndex + 1}/{totalTexts}
                    </span>
                    <span className="text-sm text-surface-500 font-medium">
                        {textTitle}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-400 font-medium">
                        Slide {slideIndex + 1} of {totalSlides}
                    </span>
                </div>
            </div>

            {/* Slide Dots */}
            <div className="flex items-center gap-1.5 mb-4 justify-center">
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
            <div className="flex-1 bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/20 border border-white/50 p-6 md:p-10 flex flex-col">
                <div className="flex-1 overflow-y-auto">
                    <div className="prose prose-surface max-w-none">
                        {paragraphs.map((para, i) => {
                            // Check if it's a heading-like line (starts with a number or all caps)
                            const isHeading = /^(\d+\.?\s|#+\s)/.test(para.trim());
                            if (isHeading) {
                                return (
                                    <h3 key={i} className="text-lg font-bold text-surface-900 mt-4 mb-2 first:mt-0">
                                        {para.replace(/^#+\s/, '')}
                                    </h3>
                                );
                            }
                            // Check if it's a bullet point
                            if (/^[•*-]\s/.test(para.trim())) {
                                return (
                                    <p key={i} className="text-surface-700 leading-relaxed text-[15px] pl-4 py-0.5">
                                        <span className="text-primary-400 mr-2">•</span>
                                        {para.replace(/^[•*-]\s/, '')}
                                    </p>
                                );
                            }
                            return (
                                <p key={i} className="text-surface-700 leading-[1.8] text-[15px] mb-3">
                                    {para}
                                </p>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Timer & Controls Bar */}
            <div className="mt-4 bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 p-4">
                {/* Progress Bar */}
                <div className="relative h-2 bg-surface-100 rounded-full mb-3 overflow-hidden">
                    {/* Min-time marker */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-surface-400 z-10"
                        style={{ left: `${minProgressPercent}%` }}
                    />
                    {/* Progress fill */}
                    <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-linear ${elapsed < minTimeSeconds
                            ? 'bg-linear-to-r from-warning to-yellow-400'
                            : 'bg-linear-to-r from-accent to-primary-400'
                            }`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-surface-500">
                        {!canProceed ? (
                            <span className="flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
                                Next available in <strong className="text-surface-700">{remainingToMin}s</strong>
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                                Auto-advance in <strong className="text-surface-700">{remainingToMax}s</strong>
                            </span>
                        )}
                    </div>

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
                {canProceed && (
                    <p className="mt-2 text-right text-[11px] text-surface-400">Tip: Press Spacebar to continue</p>
                )}
            </div>
        </div>
    );
}
