import { useState } from 'react';
import type { Question } from '../types';

interface QuestionnaireProps {
    questions: Question[];
    textTitle: string;
    onSubmit: (answers: Record<string, string>) => void;
}

export default function Questionnaire({ questions, textTitle, onSubmit }: QuestionnaireProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Set<string>>(new Set());

    const handleChange = (questionId: string, value: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
        setErrors((prev) => {
            const next = new Set(prev);
            next.delete(questionId);
            return next;
        });
    };

    const handleSubmit = () => {
        const newErrors = new Set<string>();
        questions.forEach((q) => {
            if (!answers[q.id]?.trim()) newErrors.add(q.id);
        });
        if (newErrors.size > 0) {
            setErrors(newErrors);
            return;
        }
        onSubmit(answers);
    };

    if (questions.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-2xl">
                    <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-8 md:p-10 text-center">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-primary-400 to-primary-600 text-white mb-4 shadow-lg shadow-primary-300/40">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-surface-900 mb-2">Reading Complete</h2>
                        <p className="text-surface-500 mb-6">
                            You have finished reading <strong>{textTitle}</strong>. No questions are configured for this text yet.
                        </p>
                        <button
                            onClick={() => onSubmit({})}
                            className="px-8 py-3 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                        >
                            Continue →
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-2xl py-4">
                <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-8 md:p-10">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-primary-400 to-primary-600 text-white mb-4 shadow-lg shadow-primary-300/40">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-surface-900">Comprehension Questions</h2>
                        <p className="text-surface-500 mt-1.5 text-sm">{textTitle}</p>
                    </div>

                    {/* Questions */}
                    <div className="space-y-6">
                        {questions.map((q, idx) => (
                            <div
                                key={q.id}
                                className={`p-5 rounded-2xl border-2 transition-colors duration-200 ${errors.has(q.id) ? 'border-red-200 bg-red-50/50' : 'border-surface-100 bg-surface-50/50'
                                    }`}
                            >
                                <p className="font-semibold text-surface-800 mb-3">
                                    <span className="text-primary-500 mr-2">Q{idx + 1}.</span>
                                    {q.question}
                                </p>

                                {q.type === 'mcq' && q.options ? (
                                    <div className="space-y-2">
                                        {q.options.map((opt) => (
                                            <label
                                                key={opt.id}
                                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 border ${answers[q.id] === opt.id
                                                    ? 'border-primary-300 bg-primary-50'
                                                    : 'border-transparent hover:bg-surface-100'
                                                    }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={q.id}
                                                    value={opt.id}
                                                    checked={answers[q.id] === opt.id}
                                                    onChange={() => handleChange(q.id, opt.id)}
                                                    className="w-4 h-4 text-primary-500 accent-primary-500"
                                                />
                                                <span className="text-sm text-surface-700">{opt.text}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <textarea
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleChange(q.id, e.target.value)}
                                        placeholder="Type your answer..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-surface-200 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 outline-none text-surface-800 bg-white/80 backdrop-blur-sm placeholder:text-surface-400 transition-all duration-200 resize-none text-sm"
                                    />
                                )}

                                {errors.has(q.id) && (
                                    <p className="text-sm text-red-500 mt-2">Please answer this question</p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        className="w-full mt-8 py-3.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold text-base shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                    >
                        Submit Answers & Continue →
                    </button>
                </div>
            </div>
        </div>
    );
}
