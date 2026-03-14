/**
 * useTextScramble — Character-by-character scramble/unscramble animation
 *
 * Cycles through random characters before resolving to final text.
 */
import { useState, useEffect, useRef } from 'react';
import { getReducedMotion } from '@/hooks/useReducedMotion';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

interface UseTextScrambleOptions {
    /** Text to reveal */
    text: string;
    /** Whether to start the animation */
    trigger?: boolean;
    /** Duration of the scramble in ms (default: 800) */
    duration?: number;
    /** Delay before starting in ms (default: 0) */
    delay?: number;
}

export function useTextScramble({
    text,
    trigger = true,
    duration = 800,
    delay = 0,
}: UseTextScrambleOptions): string {
    const [display, setDisplay] = useState('');
    const frameRef = useRef<number>(0);

    useEffect(() => {
        if (!trigger) {
            setDisplay('');
            return;
        }

        if (getReducedMotion()) {
            const timeout = setTimeout(() => setDisplay(text), delay);
            return () => clearTimeout(timeout);
        }

        let startTime: number | null = null;
        let started = false;

        function update(time: number) {
            if (!started) {
                if (!startTime) startTime = time;
                if (time - startTime < delay) {
                    frameRef.current = requestAnimationFrame(update);
                    return;
                }
                started = true;
                startTime = time;
            }

            const elapsed = time - (startTime || time);
            const progress = Math.min(elapsed / duration, 1);

            // Number of characters resolved (left to right)
            const resolved = Math.floor(progress * text.length);

            let result = '';
            for (let i = 0; i < text.length; i++) {
                if (i < resolved) {
                    result += text[i];
                } else if (text[i] === ' ') {
                    result += ' ';
                } else {
                    result += CHARS[Math.floor(Math.random() * CHARS.length)];
                }
            }

            setDisplay(result);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(update);
            } else {
                setDisplay(text);
            }
        }

        frameRef.current = requestAnimationFrame(update);

        return () => cancelAnimationFrame(frameRef.current);
    }, [text, trigger, duration, delay]);

    return display;
}
