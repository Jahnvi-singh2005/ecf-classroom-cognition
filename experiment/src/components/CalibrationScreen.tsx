import { useState, useEffect } from 'react';

interface CalibrationScreenProps {
    /** Duration of the flicker in seconds */
    durationSeconds: number;
    /** Called when calibration finishes */
    onComplete: () => void;
    /** Label shown on screen, e.g. "PRE-CALIBRATION" */
    label: string;
    /** Optional control to skip calibration */
    onSkip?: () => void;
}

/**
 * Full-screen calibration screen that rapidly alternates between
 * black and white backgrounds. Provides a visual timing marker
 * for synchronising screen and camera recordings.
 */
export default function CalibrationScreen({
    durationSeconds,
    onComplete,
    label,
    // onSkip,
}: CalibrationScreenProps) {
    const formatClock = (seconds: number): string => {
        const safeSeconds = Math.max(0, Math.ceil(seconds));
        const minutes = Math.floor(safeSeconds / 60);
        const secs = safeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const [isWhite, setIsWhite] = useState(false);
    const [countdown, setCountdown] = useState(durationSeconds);

    // Flicker effect — toggle every 100ms (10 Hz)
    useEffect(() => {
        const flickerInterval = setInterval(() => {
            setIsWhite((prev) => !prev);
        }, 100);

        return () => clearInterval(flickerInterval);
    }, []);

    // Countdown timer — update every second
    useEffect(() => {
        const countdownInterval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) return 0;
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, []);

    // End calibration after the configured duration
    useEffect(() => {
        const timeout = setTimeout(() => {
            onComplete();
        }, durationSeconds * 1000);

        return () => clearTimeout(timeout);
    }, [durationSeconds, onComplete]);

    return (
        <div
            className="calibration-overlay"
            style={{ backgroundColor: isWhite ? '#FFFFFF' : '#000000' }}
        >
            {/* {onSkip && (
                <button
                    type="button"
                    onClick={onSkip}
                    className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/85 text-surface-800 hover:bg-white transition-all"
                >
                    Skip calibration
                </button>
            )} */}
            <div className="calibration-label" style={{ color: isWhite ? '#000' : '#FFF' }}>
                <div className="calibration-title">{label}</div>
                <div className="calibration-countdown">{formatClock(countdown)} remaining</div>
            </div>
        </div>
    );
}
