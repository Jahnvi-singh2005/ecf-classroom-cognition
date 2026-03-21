import { useState, useEffect, useRef } from 'react';

interface CalibrationScreenProps {
    /** Duration of the flicker in seconds */
    durationSeconds: number;
    /** Called when calibration finishes */
    onComplete: () => void;
    /** Label shown on screen, e.g. "PRE-CALIBRATION" */
    label: string;
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
}: CalibrationScreenProps) {
    const [isWhite, setIsWhite] = useState(false);
    const [countdown, setCountdown] = useState(durationSeconds);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

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
            onCompleteRef.current();
        }, durationSeconds * 1000);

        return () => clearTimeout(timeout);
    }, [durationSeconds]);

    return (
        <div
            className="calibration-overlay"
            style={{ backgroundColor: isWhite ? '#FFFFFF' : '#000000' }}
        >
            <div className="calibration-label" style={{ color: isWhite ? '#000' : '#FFF' }}>
                <div className="calibration-title">{label}</div>
                <div className="calibration-countdown">{countdown}s remaining</div>
            </div>
        </div>
    );
}
