import { useState } from 'react';

interface ConsentScreenProps {
    onBack: () => void;
    onContinue: () => void;
}

export default function ConsentScreen({ onBack, onContinue }: ConsentScreenProps) {
    const [consentGiven, setConsentGiven] = useState(false);

    return (
        <div className="min-h-full flex items-center justify-center p-3 md:p-6">
            <div className="w-full max-w-3xl h-full max-h-[calc(100vh-6.5rem)] md:max-h-[calc(100vh-7.5rem)]">
                <div className="h-full min-h-0 flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-4 md:p-8">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-100 text-surface-700 text-xs font-semibold hover:bg-surface-200 transition-all"
                        >
                            {'<'} Back
                        </button>
                        <span className="chip">Informed consent</span>
                    </div>

                    <div className="flex-1 min-h-0 rounded-2xl border border-surface-200 bg-surface-50/80 p-4 md:p-6 overflow-y-auto">
                        <h2 className="text-xl md:text-2xl font-bold text-surface-900">Consent Form</h2>
                        <p className="mt-1 text-sm text-surface-500">Please read and confirm before starting the experiment.</p>

                        <div className="mt-5 space-y-4 text-sm md:text-base text-surface-700 leading-relaxed">
                            <p>I voluntarily agree to participate in this study.</p>
                            <p>
                                I have had the purpose and nature of the study explained to me in writing and I have had
                                the opportunity to ask questions about the study.
                            </p>
                            <p>
                                I understand that I am free to contact any of the people involved in the research to seek
                                further clarification and information.
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-surface-200 bg-white/85 p-4">
                        <label className="inline-flex items-start gap-3 text-sm text-surface-800">
                            <input
                                type="checkbox"
                                checked={consentGiven}
                                onChange={(event) => setConsentGiven(event.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-200"
                            />
                            <span className="font-medium">I give my consent</span>
                        </label>
                    </div>

                    <button
                        type="button"
                        disabled={!consentGiven}
                        onClick={onContinue}
                        className={`w-full mt-4 shrink-0 py-3.5 rounded-xl font-semibold text-base transition-all duration-200 ${consentGiven
                            ? 'bg-linear-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 active:scale-[0.98]'
                            : 'bg-surface-200 text-surface-500 cursor-not-allowed'
                            }`}
                    >
                        Start Experiment
                    </button>
                </div>
            </div>
        </div>
    );
}
