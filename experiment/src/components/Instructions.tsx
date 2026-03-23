interface InstructionsProps {
    instructions: string;
    onBegin: () => void;
    onBack?: () => void;
}

export default function Instructions({ instructions, onBegin, onBack }: InstructionsProps) {
    const renderBoldSegments = (line: string) => {
        const segments = line.split(/(\*\*.*?\*\*)/g);
        return segments.map((segment, index) => {
            if (segment.startsWith('**') && segment.endsWith('**') && segment.length >= 4) {
                return (
                    <strong key={`bold-${index}`} className="font-semibold text-surface-900">
                        {segment.slice(2, -2)}
                    </strong>
                );
            }

            return <span key={`text-${index}`}>{segment}</span>;
        });
    };

    return (
        <div className="min-h-full flex items-center justify-center p-3 md:p-6">
            <div className="w-full max-w-3xl h-full max-h-[calc(100vh-6.5rem)] md:max-h-[calc(100vh-7.5rem)]">
                <div className="h-full min-h-0 flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-4 md:p-8">
                    {/* Header */}
                    <div className="text-center mb-3 md:mb-5 shrink-0">
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
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-accent to-accent-dim text-white mb-4 shadow-lg shadow-accent/30">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h1 className="text-xl md:text-2xl font-bold text-surface-900">Experiment Instructions</h1>
                    </div>

                    {/* Instructions content */}
                    <div className="flex-1 min-h-0 bg-surface-50/80 rounded-2xl p-4 md:p-6 mb-4 md:mb-6 text-surface-700 leading-relaxed text-sm space-y-2.5 border border-surface-100 overflow-y-auto">
                        {instructions.split('\n').map((line, i) => {
                            if (!line.trim()) return <div key={i} className="h-2" />;
                            return (
                                <p key={i}>{renderBoldSegments(line)}</p>
                            );
                        })}
                    </div>

                    <button
                        onClick={onBegin}
                        className="w-full shrink-0 py-3.5 rounded-xl bg-linear-to-r from-accent to-accent-dim text-white font-semibold text-base shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/35 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                    >
                        Begin Experiment
                    </button>
                </div>
            </div>
        </div>
    );
}
