/**
 * useScrollProgress — GSAP ScrollTrigger wrapper returning 0–1 progress
 */
import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

interface ScrollProgressOptions {
    /** Where the trigger starts relative to viewport (default: 'top bottom') */
    start?: string;
    /** Where the trigger ends relative to viewport (default: 'bottom top') */
    end?: string;
    /** Scrub smoothing (default: 1) */
    scrub?: number | boolean;
}

export function useScrollProgress(
    options: ScrollProgressOptions = {},
): [React.RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (getReducedMotion() || !ref.current) return;

        const trigger = ScrollTrigger.create({
            trigger: ref.current,
            start: options.start ?? 'top bottom',
            end: options.end ?? 'bottom top',
            scrub: options.scrub ?? 1,
            onUpdate: (self) => {
                setProgress(self.progress);
            },
        });

        return () => {
            trigger.kill();
        };
    }, [options.start, options.end, options.scrub]);

    return [ref, progress];
}
