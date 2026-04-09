import { useMemo, useState } from 'react';
import type { LearnerSelfReport } from '../types';

interface LearnerSelfReportProps {
    initialValue?: LearnerSelfReport | null;
    onSubmit: (value: Omit<LearnerSelfReport, 'submittedAt'>) => void;
    onBack?: () => void;
}

type LikertKey =
    | 'generalLearningInclination'
    | 'outOfDomainLearningInclination'
    | 'inDomainLearningInclination';

const LIKERT_QUESTIONS: Array<{ key: LikertKey; prompt: string }> = [
    {
        key: 'generalLearningInclination',
        prompt: 'Rate your inclination towards learning in general',
    },
    {
        key: 'outOfDomainLearningInclination',
        prompt: 'Rate your inclination towards learning topics outside your domain/degree',
    },
    {
        key: 'inDomainLearningInclination',
        prompt: 'Rate your inclination towards learning topics from your domain/degree',
    },
];

export default function LearnerSelfReport({
    initialValue = null,
    onSubmit,
    onBack,
}: LearnerSelfReportProps) {
    const [ratings, setRatings] = useState<Record<LikertKey, number | null>>({
        generalLearningInclination: initialValue?.generalLearningInclination ?? null,
        outOfDomainLearningInclination: initialValue?.outOfDomainLearningInclination ?? null,
        inDomainLearningInclination: initialValue?.inDomainLearningInclination ?? null,
    });
    const [reflection, setReflection] = useState(initialValue?.academicIntelligenceReflection || '');
    const [error, setError] = useState<string | null>(null);

    const scale = useMemo(() => Array.from({ length: 7 }, (_, idx) => idx + 1), []);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        const allRated = LIKERT_QUESTIONS.every((item) => typeof ratings[item.key] === 'number');
        if (!allRated) {
            setError('Please provide ratings for all three Likert-scale questions.');
            return;
        }

        const trimmedReflection = reflection.trim();
        if (!trimmedReflection) {
            setError('Please answer the open-ended question before continuing.');
            return;
        }

        setError(null);
        onSubmit({
            generalLearningInclination: ratings.generalLearningInclination as number,
            outOfDomainLearningInclination: ratings.outOfDomainLearningInclination as number,
            inDomainLearningInclination: ratings.inDomainLearningInclination as number,
            academicIntelligenceReflection: trimmedReflection,
        });
    };

    return (
        <div className="min-h-full overflow-y-auto flex items-center justify-center p-3 md:p-6">
            <div className="w-full max-w-4xl">
                <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-5 md:p-8">
                    <div className="text-center mb-6">
                        {onBack && (
                            <div className="flex justify-start mb-3">
                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-100 text-surface-700 text-xs font-semibold hover:bg-surface-200 transition-all"
                                >
                                    {'<'} Back
                                </button>
                            </div>
                        )}
                        <span className="chip">Participant self-report</span>
                        <h1 className="text-xl md:text-2xl font-bold text-surface-900 mt-3">Learner Self report</h1>
                        <p className="text-surface-500 mt-1.5 text-sm">
                            Please answer all items. Likert scale: 1 to 7.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
                        {LIKERT_QUESTIONS.map((item, index) => (
                            <div key={item.key} className="rounded-2xl border border-surface-200 bg-white/80 p-4">
                                <p className="text-sm font-medium text-surface-800 mb-2.5">
                                    <span className="text-primary-600 mr-2">{index + 1}.</span>
                                    {item.prompt}
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    {scale.map((value) => {
                                        const selected = ratings[item.key] === value;
                                        return (
                                            <button
                                                key={`${item.key}-${value}`}
                                                type="button"
                                                onClick={() => {
                                                    setRatings((prev) => ({
                                                        ...prev,
                                                        [item.key]: value,
                                                    }));
                                                    if (error) setError(null);
                                                }}
                                                className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all cursor-pointer ${selected
                                                    ? 'bg-primary-600 text-white shadow-md shadow-primary-300/40'
                                                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                                                    }`}
                                            >
                                                {value}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="rounded-2xl border border-surface-200 bg-white/80 p-4">
                            <label htmlFor="academic-intelligence-reflection" className="text-sm font-medium text-surface-800 block mb-2.5">
                                <span className="text-primary-600 mr-2">4.</span>
                                How do you feel about your academic intelligence?
                            </label>
                            <textarea
                                id="academic-intelligence-reflection"
                                value={reflection}
                                onChange={(event) => {
                                    setReflection(event.target.value);
                                    if (error) setError(null);
                                }}
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl border-2 border-surface-200 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 outline-none text-surface-800 bg-white/90 placeholder:text-surface-400 transition-all duration-200 resize-y text-sm"
                                placeholder="Write your response here..."
                            />
                        </div>

                        {error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold text-base shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                        >
                            Continue to Instructions
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
