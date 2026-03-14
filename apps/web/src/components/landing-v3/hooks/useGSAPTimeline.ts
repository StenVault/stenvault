/**
 * useGSAPTimeline — Cleanup-safe GSAP timeline hook
 */
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface UseGSAPTimelineOptions {
    scrollTrigger?: ScrollTrigger.Vars;
    defaults?: gsap.TweenVars;
    paused?: boolean;
}

export function useGSAPTimeline(
    options: UseGSAPTimelineOptions = {},
    deps: React.DependencyList = []
) {
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const contextRef = useRef<gsap.Context | null>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                scrollTrigger: options.scrollTrigger,
                defaults: options.defaults,
                paused: options.paused,
            });
            timelineRef.current = tl;
        });

        contextRef.current = ctx;

        return () => {
            ctx.revert();
            timelineRef.current = null;
            contextRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return timelineRef;
}

export default useGSAPTimeline;
