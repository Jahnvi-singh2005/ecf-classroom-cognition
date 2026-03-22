interface CompletionProps {
    participantName: string;
    syncStatus?: 'idle' | 'saving' | 'saved' | 'error';
    syncMessage?: string | null;
}

export default function Completion({ participantName, syncStatus = 'idle', syncMessage = null }: CompletionProps) {
    return (
        <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
                <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-8 md:p-10 text-center">
                    {/* Success Icon */}
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-linear-to-br from-accent to-accent-dim text-white mb-6 shadow-xl shadow-accent/30">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>

                    <h1 className="text-3xl font-bold text-surface-900 mb-3">Experiment Complete!</h1>
                    <p className="text-surface-600 text-lg mb-6">
                        Thank you, <strong className="text-primary-600">{participantName}</strong>, for your participation.
                    </p>

                    <div className="bg-surface-50/80 rounded-2xl p-6 border border-surface-100">
                        <p className="text-surface-500 text-sm leading-relaxed">
                            Your responses have been recorded. You may now close this window.
                            If you have any questions, please contact the experiment administrator.
                        </p>

                        {syncStatus !== 'idle' && (
                            <p className={`mt-3 text-xs ${syncStatus === 'error' ? 'text-red-600' : 'text-surface-600'}`}>
                                {syncStatus === 'saving' && 'Syncing this session to Firebase...'}
                                {syncStatus === 'saved' && (syncMessage || 'Session synced to Firebase successfully.')}
                                {syncStatus === 'error' && (syncMessage || 'Session could not be synced to Firebase.')}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
