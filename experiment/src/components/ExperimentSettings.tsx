import { useMemo, useRef, useState } from 'react';
import type { ExperimentConfig, PostAssessmentSettings, SubjectiveQuestion, TextConfig, TextVariant } from '../types';

interface ExperimentSettingsProps {
    initialConfig: ExperimentConfig;
    onContinue: (nextConfig: ExperimentConfig) => void;
    onBack: () => void;
}

const DEFAULT_POST_SETTINGS: PostAssessmentSettings = {
    thinkingMinSeconds: 8,
    questionMinSeconds: 20,
    questionMaxSeconds: 180,
    wordLimit: 120,
    feedbackScaleMin: 1,
    feedbackScaleMax: 7,
};

const num = (value: string, fallback: number, min = 0): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
};

const cloneTexts = (texts: TextConfig[]): TextConfig[] => texts.map((text) => ({
    ...text,
    variants: text.variants.map((variant) => ({
        ...variant,
        slides: [...variant.slides],
    })),
    questions: [...text.questions],
    subjectiveQuestions: text.subjectiveQuestions ? [...text.subjectiveQuestions] : [],
}));

const createText = (index: number): TextConfig => ({
    id: `text-${index + 1}`,
    title: `New Text ${index + 1}`,
    variants: [
        { type: 'passive', slides: ['New passive slide'] },
        { type: 'active', slides: ['New active slide'] },
        { type: 'control', slides: ['New control slide'] },
    ],
    questions: [],
    subjectiveQuestions: [
        { id: `sq-${Date.now()}`, prompt: 'Add your subjective question prompt here.' },
    ],
});

const createSubjectiveQuestion = (): SubjectiveQuestion => ({
    id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt: 'New subjective question',
});

type VariantType = TextVariant['type'];
type SettingsTab = 'general' | 'content';

const normalizeTextsFromJson = (raw: unknown): TextConfig[] => {
    const source = (() => {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object' && Array.isArray((raw as { texts?: unknown[] }).texts)) {
            return (raw as { texts: unknown[] }).texts;
        }
        throw new Error('JSON must be an array of texts or an object with a texts array.');
    })();

    const normalized = source.map((item, index): TextConfig => {
        const text = (item && typeof item === 'object') ? item as Record<string, unknown> : {};

        const variantsRaw = Array.isArray(text.variants) ? text.variants : [];
        const variants: TextVariant[] = variantsRaw
            .map((variant): TextVariant | null => {
                const obj = (variant && typeof variant === 'object') ? variant as Record<string, unknown> : null;
                if (!obj) return null;

                const type = obj.type;
                if (type !== 'passive' && type !== 'active' && type !== 'control') return null;

                const slides = Array.isArray(obj.slides) ? obj.slides.filter((s): s is string => typeof s === 'string') : [];
                return { type, slides };
            })
            .filter((v): v is TextVariant => v !== null);

        const variantTypes = new Set(variants.map((v) => v.type));
        (['passive', 'active', 'control'] as const).forEach((type) => {
            if (!variantTypes.has(type)) variants.push({ type, slides: [] });
        });

        const subjectiveQuestions = Array.isArray(text.subjectiveQuestions)
            ? text.subjectiveQuestions
                .map((q): SubjectiveQuestion | null => {
                    const obj = (q && typeof q === 'object') ? q as Record<string, unknown> : null;
                    if (!obj) return null;
                    const prompt = typeof obj.prompt === 'string' ? obj.prompt : '';
                    if (!prompt.trim()) return null;
                    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id : `sq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    return { id, prompt };
                })
                .filter((q): q is SubjectiveQuestion => q !== null)
            : [];

        return {
            id: typeof text.id === 'string' && text.id.trim() ? text.id : `text-${index + 1}`,
            title: typeof text.title === 'string' && text.title.trim() ? text.title : `Imported Text ${index + 1}`,
            variants,
            questions: [],
            subjectiveQuestions,
        };
    });

    if (normalized.length === 0) {
        throw new Error('No valid texts found in JSON.');
    }

    return normalized;
};

export default function ExperimentSettings({ initialConfig, onContinue, onBack }: ExperimentSettingsProps) {
    const defaultPost = initialConfig.postAssessmentSettings || DEFAULT_POST_SETTINGS;
    const [tab, setTab] = useState<SettingsTab>('general');
    const [workingTexts, setWorkingTexts] = useState<TextConfig[]>(() => cloneTexts(initialConfig.texts));
    const [selectedTextIndex, setSelectedTextIndex] = useState(0);
    const [selectedVariantType, setSelectedVariantType] = useState<VariantType>('active');
    const [contentJsonStatus, setContentJsonStatus] = useState<string | null>(null);
    const [contentJsonError, setContentJsonError] = useState<string | null>(null);
    const importFileRef = useRef<HTMLInputElement | null>(null);

    const [experimentTitle, setExperimentTitle] = useState(initialConfig.experimentTitle);
    const [condition, setCondition] = useState(initialConfig.condition);
    const [slideMin, setSlideMin] = useState(String(initialConfig.slideSettings.minTimeSeconds));
    const [slideMax, setSlideMax] = useState(String(initialConfig.slideSettings.maxTimeSeconds));
    const [calibrationEnabled, setCalibrationEnabled] = useState(initialConfig.calibrationSettings.enabled);
    const [calibrationDuration, setCalibrationDuration] = useState(String(initialConfig.calibrationSettings.durationSeconds));
    const [thinkingMin, setThinkingMin] = useState(String(defaultPost.thinkingMinSeconds));
    const [questionMin, setQuestionMin] = useState(String(defaultPost.questionMinSeconds));
    const [questionMax, setQuestionMax] = useState(String(defaultPost.questionMaxSeconds));
    const [wordLimit, setWordLimit] = useState(String(defaultPost.wordLimit));
    const [feedbackMin, setFeedbackMin] = useState(String(defaultPost.feedbackScaleMin));
    const [feedbackMax, setFeedbackMax] = useState(String(defaultPost.feedbackScaleMax));

    const selectedText = workingTexts[selectedTextIndex];

    const selectedVariant = useMemo(() => {
        if (!selectedText) return null;
        return selectedText.variants.find((variant) => variant.type === selectedVariantType) || null;
    }, [selectedText, selectedVariantType]);

    const selectedSubjectiveQuestions = selectedText?.subjectiveQuestions || [];

    const updateTextAt = (textIndex: number, updater: (text: TextConfig) => TextConfig) => {
        setWorkingTexts((prev) => prev.map((text, idx) => (idx === textIndex ? updater(text) : text)));
    };

    const ensureVariant = (text: TextConfig, type: VariantType): TextConfig => {
        const exists = text.variants.some((variant) => variant.type === type);
        if (exists) return text;
        return {
            ...text,
            variants: [...text.variants, { type, slides: [] }],
        };
    };

    const updateSlide = (slideIndex: number, value: string) => {
        updateTextAt(selectedTextIndex, (text) => {
            const normalized = ensureVariant(text, selectedVariantType);
            return {
                ...normalized,
                variants: normalized.variants.map((variant) => {
                    if (variant.type !== selectedVariantType) return variant;
                    return {
                        ...variant,
                        slides: variant.slides.map((slide, idx) => (idx === slideIndex ? value : slide)),
                    };
                }),
            };
        });
    };

    const addSlide = () => {
        updateTextAt(selectedTextIndex, (text) => {
            const normalized = ensureVariant(text, selectedVariantType);
            return {
                ...normalized,
                variants: normalized.variants.map((variant) => {
                    if (variant.type !== selectedVariantType) return variant;
                    return {
                        ...variant,
                        slides: [...variant.slides, `New ${selectedVariantType} slide`],
                    };
                }),
            };
        });
    };

    const removeSlide = (slideIndex: number) => {
        updateTextAt(selectedTextIndex, (text) => {
            const normalized = ensureVariant(text, selectedVariantType);
            return {
                ...normalized,
                variants: normalized.variants.map((variant) => {
                    if (variant.type !== selectedVariantType) return variant;
                    return {
                        ...variant,
                        slides: variant.slides.filter((_, idx) => idx !== slideIndex),
                    };
                }),
            };
        });
    };

    const moveSlide = (slideIndex: number, direction: 'up' | 'down') => {
        updateTextAt(selectedTextIndex, (text) => {
            const normalized = ensureVariant(text, selectedVariantType);
            return {
                ...normalized,
                variants: normalized.variants.map((variant) => {
                    if (variant.type !== selectedVariantType) return variant;
                    const targetIndex = direction === 'up' ? slideIndex - 1 : slideIndex + 1;
                    if (targetIndex < 0 || targetIndex >= variant.slides.length) return variant;

                    const slides = [...variant.slides];
                    const [item] = slides.splice(slideIndex, 1);
                    slides.splice(targetIndex, 0, item);

                    return {
                        ...variant,
                        slides,
                    };
                }),
            };
        });
    };

    const updateSubjectiveQuestion = (questionIndex: number, prompt: string) => {
        updateTextAt(selectedTextIndex, (text) => {
            const list = text.subjectiveQuestions || [];
            return {
                ...text,
                subjectiveQuestions: list.map((item, idx) => (idx === questionIndex ? { ...item, prompt } : item)),
            };
        });
    };

    const addSubjectiveQuestion = () => {
        updateTextAt(selectedTextIndex, (text) => ({
            ...text,
            subjectiveQuestions: [...(text.subjectiveQuestions || []), createSubjectiveQuestion()],
        }));
    };

    const removeSubjectiveQuestion = (questionIndex: number) => {
        updateTextAt(selectedTextIndex, (text) => ({
            ...text,
            subjectiveQuestions: (text.subjectiveQuestions || []).filter((_, idx) => idx !== questionIndex),
        }));
    };

    const moveSubjectiveQuestion = (questionIndex: number, direction: 'up' | 'down') => {
        updateTextAt(selectedTextIndex, (text) => {
            const list = [...(text.subjectiveQuestions || [])];
            const targetIndex = direction === 'up' ? questionIndex - 1 : questionIndex + 1;
            if (targetIndex < 0 || targetIndex >= list.length) return text;
            const [item] = list.splice(questionIndex, 1);
            list.splice(targetIndex, 0, item);
            return {
                ...text,
                subjectiveQuestions: list,
            };
        });
    };

    const addText = () => {
        setWorkingTexts((prev) => {
            const next = [...prev, createText(prev.length)];
            setSelectedTextIndex(next.length - 1);
            return next;
        });
    };

    const exportContentJson = () => {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            texts: cloneTexts(workingTexts),
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'experiment-content.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setContentJsonError(null);
        setContentJsonStatus('Content JSON exported.');
    };

    const importContentJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as unknown;
            const nextTexts = normalizeTextsFromJson(parsed);
            setWorkingTexts(nextTexts);
            setSelectedTextIndex(0);
            setSelectedVariantType('active');
            setContentJsonError(null);
            setContentJsonStatus(`Imported ${nextTexts.length} text(s) from JSON.`);
        } catch (err) {
            setContentJsonStatus(null);
            setContentJsonError(err instanceof Error ? err.message : 'Invalid content JSON file.');
        } finally {
            if (importFileRef.current) importFileRef.current.value = '';
        }
    };

    const removeText = (textIndex: number) => {
        setWorkingTexts((prev) => {
            if (prev.length <= 1) return prev;
            const next = prev.filter((_, idx) => idx !== textIndex);
            setSelectedTextIndex(Math.max(0, Math.min(selectedTextIndex, next.length - 1)));
            return next;
        });
    };

    const moveText = (textIndex: number, direction: 'up' | 'down') => {
        setWorkingTexts((prev) => {
            const targetIndex = direction === 'up' ? textIndex - 1 : textIndex + 1;
            if (targetIndex < 0 || targetIndex >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(textIndex, 1);
            next.splice(targetIndex, 0, item);
            setSelectedTextIndex(targetIndex);
            return next;
        });
    };

    const settingsPreview = useMemo(() => {
        const sMin = num(slideMin, initialConfig.slideSettings.minTimeSeconds, 1);
        const sMax = Math.max(num(slideMax, initialConfig.slideSettings.maxTimeSeconds, 1), sMin);
        const qMin = num(questionMin, defaultPost.questionMinSeconds, 1);
        const qMax = Math.max(num(questionMax, defaultPost.questionMaxSeconds, 1), qMin);
        return { sMin, sMax, qMin, qMax };
    }, [slideMin, slideMax, questionMin, questionMax, defaultPost, initialConfig.slideSettings]);

    const handleContinue = () => {
        const slideMinSeconds = num(slideMin, initialConfig.slideSettings.minTimeSeconds, 1);
        const slideMaxSeconds = Math.max(num(slideMax, initialConfig.slideSettings.maxTimeSeconds, 1), slideMinSeconds);

        const questionMinSeconds = num(questionMin, defaultPost.questionMinSeconds, 1);
        const questionMaxSeconds = Math.max(num(questionMax, defaultPost.questionMaxSeconds, 1), questionMinSeconds);

        const feedbackScaleMin = num(feedbackMin, defaultPost.feedbackScaleMin, 1);
        const feedbackScaleMax = Math.max(num(feedbackMax, defaultPost.feedbackScaleMax, 1), feedbackScaleMin);

        const nextConfig: ExperimentConfig = {
            ...initialConfig,
            experimentTitle: experimentTitle.trim() || initialConfig.experimentTitle,
            condition,
            texts: cloneTexts(workingTexts),
            slideSettings: {
                minTimeSeconds: slideMinSeconds,
                maxTimeSeconds: slideMaxSeconds,
            },
            calibrationSettings: {
                enabled: calibrationEnabled,
                durationSeconds: num(calibrationDuration, initialConfig.calibrationSettings.durationSeconds, 1),
            },
            postAssessmentSettings: {
                thinkingMinSeconds: num(thinkingMin, defaultPost.thinkingMinSeconds, 1),
                questionMinSeconds,
                questionMaxSeconds,
                wordLimit: num(wordLimit, defaultPost.wordLimit, 10),
                feedbackScaleMin,
                feedbackScaleMax,
            },
        };

        onContinue(nextConfig);
    };

    const inputCls = 'w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 outline-none focus:ring-3 focus:ring-primary-100 focus:border-primary-400';
    const variantButtonCls = (isActive: boolean) => `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isActive
        ? 'bg-primary-600 text-white'
        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
        }`;
    const tabButtonCls = (isActive: boolean) => `px-3 py-2 rounded-lg text-sm font-semibold transition-all ${isActive
        ? 'bg-primary-600 text-white'
        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
        }`;

    return (
        <div className="h-full min-h-0 flex items-center justify-center p-4 md:p-6 overflow-hidden">
            <div className="w-full max-w-6xl h-full panel p-6 md:p-8 flex flex-col min-h-0">
                <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <span className="chip">Experiment setup</span>
                        <h2 className="text-2xl font-semibold text-surface-900 mt-3">Customize Experiment Settings</h2>
                        <p className="text-sm text-surface-500 mt-1">Tune runtime behavior and manage experiment content before participants begin.</p>
                    </div>
                    <div className="text-xs text-surface-500 bg-surface-50 border border-surface-200 rounded-xl px-3 py-2">
                        Slides: {settingsPreview.sMin}s–{settingsPreview.sMax}s · Questions: {settingsPreview.qMin}s–{settingsPreview.qMax}s
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-5">
                    <button type="button" onClick={() => setTab('general')} className={tabButtonCls(tab === 'general')}>General settings</button>
                    <button type="button" onClick={() => setTab('content')} className={tabButtonCls(tab === 'content')}>Content editor</button>
                </div>

                {tab === 'general' && (
                    <div className="grid md:grid-cols-2 gap-6 flex-1 min-h-0 overflow-auto pr-1">
                        <div className="space-y-4 rounded-2xl border border-surface-200 bg-white/70 p-5">
                            <h3 className="text-sm font-semibold text-surface-800">General</h3>

                            <div>
                                <label className="block text-xs text-surface-500 mb-1">Experiment title</label>
                                <input value={experimentTitle} onChange={(e) => setExperimentTitle(e.target.value)} className={inputCls} />
                            </div>

                            <div>
                                <label className="block text-xs text-surface-500 mb-1">Condition assignment</label>
                                <select value={condition} onChange={(e) => setCondition(e.target.value as ExperimentConfig['condition'])} className={inputCls}>
                                    <option value="random">Random</option>
                                    <option value="passive">Passive</option>
                                    <option value="active">Active</option>
                                    <option value="control">Control</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-surface-200 bg-white/70 p-5">
                            <h3 className="text-sm font-semibold text-surface-800">Reading slide timing</h3>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Min time (s)</label>
                                    <input type="number" min={1} value={slideMin} onChange={(e) => setSlideMin(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Max time (s)</label>
                                    <input type="number" min={1} value={slideMax} onChange={(e) => setSlideMax(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-surface-200 bg-white/70 p-5">
                            <h3 className="text-sm font-semibold text-surface-800">Calibration & recording</h3>

                            <label className="flex items-center gap-2 text-sm text-surface-700">
                                <input
                                    type="checkbox"
                                    checked={calibrationEnabled}
                                    onChange={(e) => setCalibrationEnabled(e.target.checked)}
                                    className="accent-primary-500"
                                />
                                Enable calibration screens
                            </label>

                            <div>
                                <label className="block text-xs text-surface-500 mb-1">Calibration duration (s)</label>
                                <input type="number" min={1} value={calibrationDuration} onChange={(e) => setCalibrationDuration(e.target.value)} className={inputCls} />
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-surface-200 bg-white/70 p-5">
                            <h3 className="text-sm font-semibold text-surface-800">Post-reading response</h3>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Thinking min (s)</label>
                                    <input type="number" min={1} value={thinkingMin} onChange={(e) => setThinkingMin(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Word limit</label>
                                    <input type="number" min={10} value={wordLimit} onChange={(e) => setWordLimit(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Question min (s)</label>
                                    <input type="number" min={1} value={questionMin} onChange={(e) => setQuestionMin(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Question max (s)</label>
                                    <input type="number" min={1} value={questionMax} onChange={(e) => setQuestionMax(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Feedback min scale</label>
                                    <input type="number" min={1} value={feedbackMin} onChange={(e) => setFeedbackMin(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Feedback max scale</label>
                                    <input type="number" min={1} value={feedbackMax} onChange={(e) => setFeedbackMax(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'content' && selectedText && (
                    <div className="flex-1 min-h-0 grid lg:grid-cols-[280px_minmax(0,1fr)] gap-4 overflow-hidden">
                        <div className="rounded-2xl border border-surface-200 bg-white/70 p-4 overflow-auto">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-surface-800">Texts</h3>
                                <button type="button" onClick={addText} className="px-2.5 py-1 rounded-lg bg-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-200">+ Add</button>
                            </div>

                            <div className="space-y-2">
                                {workingTexts.map((text, idx) => (
                                    <div
                                        key={`${text.id}-${idx}`}
                                        className={`rounded-xl border px-3 py-2 cursor-pointer transition-all ${idx === selectedTextIndex
                                            ? 'border-primary-300 bg-primary-50'
                                            : 'border-surface-200 bg-white hover:bg-surface-50'
                                            }`}
                                        onClick={() => setSelectedTextIndex(idx)}
                                    >
                                        <div className="text-xs font-semibold text-surface-700 truncate">{text.title}</div>
                                        <div className="mt-2 flex gap-1">
                                            <button type="button" onClick={(e) => { e.stopPropagation(); moveText(idx, 'up'); }} className="px-2 py-0.5 text-[11px] rounded bg-surface-100">↑</button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); moveText(idx, 'down'); }} className="px-2 py-0.5 text-[11px] rounded bg-surface-100">↓</button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); removeText(idx); }} className="px-2 py-0.5 text-[11px] rounded bg-red-50 text-red-600">Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-surface-200 bg-white/70 p-4 overflow-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                <button
                                    type="button"
                                    onClick={exportContentJson}
                                    className="px-3 py-1.5 rounded-lg bg-surface-100 text-surface-700 text-xs font-semibold hover:bg-surface-200"
                                >
                                    Export content JSON
                                </button>
                                <button
                                    type="button"
                                    onClick={() => importFileRef.current?.click()}
                                    className="px-3 py-1.5 rounded-lg bg-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-200"
                                >
                                    Import content JSON
                                </button>
                                <input
                                    ref={importFileRef}
                                    type="file"
                                    accept="application/json,.json"
                                    className="hidden"
                                    onChange={importContentJson}
                                />
                            </div>

                            {contentJsonStatus && (
                                <p className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{contentJsonStatus}</p>
                            )}
                            {contentJsonError && (
                                <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{contentJsonError}</p>
                            )}

                            <div className="grid md:grid-cols-2 gap-3 mb-4">
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Text ID</label>
                                    <input
                                        className={inputCls}
                                        value={selectedText.id}
                                        onChange={(e) => updateTextAt(selectedTextIndex, (text) => ({ ...text, id: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-surface-500 mb-1">Text title</label>
                                    <input
                                        className={inputCls}
                                        value={selectedText.title}
                                        onChange={(e) => updateTextAt(selectedTextIndex, (text) => ({ ...text, title: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="rounded-xl border border-surface-200 p-4 mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-surface-800">Subjective questions (CRUD)</h4>
                                    <button type="button" onClick={addSubjectiveQuestion} className="px-2.5 py-1 rounded-lg bg-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-200">+ Add question</button>
                                </div>
                                <div className="space-y-2">
                                    {selectedSubjectiveQuestions.length === 0 && (
                                        <p className="text-xs text-surface-500">No subjective questions. Add at least one.</p>
                                    )}
                                    {selectedSubjectiveQuestions.map((question, idx) => (
                                        <div key={question.id} className="rounded-lg border border-surface-200 p-3 bg-white">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold text-surface-600">Q{idx + 1}</span>
                                                <div className="flex gap-1">
                                                    <button type="button" onClick={() => moveSubjectiveQuestion(idx, 'up')} className="px-2 py-0.5 text-[11px] rounded bg-surface-100">↑</button>
                                                    <button type="button" onClick={() => moveSubjectiveQuestion(idx, 'down')} className="px-2 py-0.5 text-[11px] rounded bg-surface-100">↓</button>
                                                    <button type="button" onClick={() => removeSubjectiveQuestion(idx)} className="px-2 py-0.5 text-[11px] rounded bg-red-50 text-red-600">Delete</button>
                                                </div>
                                            </div>
                                            <textarea
                                                rows={2}
                                                value={question.prompt}
                                                onChange={(e) => updateSubjectiveQuestion(idx, e.target.value)}
                                                className={`${inputCls} resize-none`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-surface-200 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-surface-800">Slides editor (rearrange + CRUD)</h4>
                                    <button type="button" onClick={addSlide} className="px-2.5 py-1 rounded-lg bg-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-200">+ Add slide</button>
                                </div>

                                <div className="flex gap-2 mb-3">
                                    {(['passive', 'active', 'control'] as const).map((variant) => (
                                        <button
                                            key={variant}
                                            type="button"
                                            onClick={() => setSelectedVariantType(variant)}
                                            className={variantButtonCls(selectedVariantType === variant)}
                                        >
                                            {variant}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    {(!selectedVariant || selectedVariant.slides.length === 0) && (
                                        <p className="text-xs text-surface-500">No slides in this variant yet.</p>
                                    )}
                                    {selectedVariant?.slides.map((slide, slideIdx) => (
                                        <div key={`${selectedVariantType}-${slideIdx}`} className="rounded-lg border border-surface-200 p-3 bg-white">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold text-surface-600">Slide {slideIdx + 1}</span>
                                                <div className="flex gap-1">
                                                    <button type="button" onClick={() => moveSlide(slideIdx, 'up')} className="px-2 py-0.5 text-[11px] rounded bg-surface-100">↑</button>
                                                    <button type="button" onClick={() => moveSlide(slideIdx, 'down')} className="px-2 py-0.5 text-[11px] rounded bg-surface-100">↓</button>
                                                    <button type="button" onClick={() => removeSlide(slideIdx)} className="px-2 py-0.5 text-[11px] rounded bg-red-50 text-red-600">Delete</button>
                                                </div>
                                            </div>
                                            <textarea
                                                rows={4}
                                                value={slide}
                                                onChange={(e) => updateSlide(slideIdx, e.target.value)}
                                                className={`${inputCls} resize-y`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-7 flex justify-end">
                    <button
                        type="button"
                        onClick={onBack}
                        className="px-5 py-3 rounded-xl bg-surface-100 text-surface-700 font-semibold text-sm hover:bg-surface-200 transition-all cursor-pointer mr-3"
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        onClick={handleContinue}
                        className="px-7 py-3 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold text-sm shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98] transition-all cursor-pointer"
                    >
                        Save settings & continue
                    </button>
                </div>
            </div>
        </div>
    );
}
