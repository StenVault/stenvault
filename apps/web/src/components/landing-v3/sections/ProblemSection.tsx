/**
 * ProblemSection — Staggered timeline with visual threat metaphors
 *
 * Alternating left/right layout with unique animations per problem.
 * Items slide from their respective side via GSAP ScrollTrigger.
 */
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { PROBLEM } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { getReducedMotion } from '@/hooks/useReducedMotion';
import { ThreatEye } from '../components/threats/ThreatEye';
import { ThreatBreach } from '../components/threats/ThreatBreach';
import { ThreatAccess } from '../components/threats/ThreatAccess';

gsap.registerPlugin(ScrollTrigger);

const THREAT_VISUALS = [ThreatEye, ThreatBreach, ThreatAccess];

export function ProblemSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (getReducedMotion()) return;

        const ctx = gsap.context(() => {
            if (headingRef.current) {
                gsap.fromTo(
                    headingRef.current,
                    { y: 50, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.8,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: headingRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
            }

            const items = timelineRef.current?.querySelectorAll('.timeline-item');
            if (items) {
                items.forEach((item, i) => {
                    const fromLeft = i % 2 === 0;
                    gsap.fromTo(
                        item,
                        {
                            x: fromLeft ? -60 : 60,
                            opacity: 0,
                        },
                        {
                            x: 0,
                            opacity: 1,
                            duration: 0.8,
                            ease: 'expo.out',
                            scrollTrigger: {
                                trigger: item,
                                start: 'top 85%',
                                once: true,
                            },
                        },
                    );
                });
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative py-24 md:py-32 lg:py-40"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            {/* Subtle top divider */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                    background: `linear-gradient(to right, transparent, ${LANDING_COLORS.border}, transparent)`,
                }}
            />

            <div className="max-w-6xl mx-auto px-6">
                {/* Heading */}
                <div
                    ref={headingRef}
                    className="text-center mb-16 md:mb-20"
                >
                    <span
                        className={cn(
                            TYPOGRAPHY.sectionLabel,
                            'text-red-400/80 mb-5 block',
                        )}
                    >
                        {PROBLEM.label}
                    </span>
                    <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white whitespace-pre-line">
                        {PROBLEM.headline}
                    </h2>
                    <p className="mt-6 max-w-xl mx-auto text-base md:text-lg text-slate-400 leading-relaxed">
                        {PROBLEM.subheadline}
                    </p>
                </div>

                {/* Timeline */}
                <div ref={timelineRef} className="relative max-w-4xl mx-auto">
                    {/* Center line (desktop only) */}
                    <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
                        style={{
                            background: `linear-gradient(to bottom, transparent, ${LANDING_COLORS.border}, ${LANDING_COLORS.border}, transparent)`,
                        }}
                    />

                    <div className="space-y-12 md:space-y-16">
                        {PROBLEM.cards.map((card, i) => {
                            const ThreatVisual = THREAT_VISUALS[i]!;
                            const isEven = i % 2 === 0;

                            return (
                                <div
                                    key={card.id}
                                    className={cn(
                                        'timeline-item flex flex-col md:flex-row items-center gap-6 md:gap-10',
                                        !isEven && 'md:flex-row-reverse',
                                    )}
                                >
                                    {/* Visual */}
                                    <div className="w-full md:w-1/2">
                                        <div
                                            className="rounded-2xl p-4 overflow-hidden"
                                            style={{
                                                backgroundColor: 'rgba(239, 68, 68, 0.03)',
                                                border: '1px solid rgba(239, 68, 68, 0.08)',
                                            }}
                                        >
                                            <ThreatVisual />
                                        </div>
                                    </div>

                                    {/* Timeline dot (desktop) */}
                                    <div className="hidden md:flex items-center justify-center flex-shrink-0">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{
                                                backgroundColor: 'rgba(239, 68, 68, 0.4)',
                                                boxShadow: '0 0 12px rgba(239, 68, 68, 0.2)',
                                            }}
                                        />
                                    </div>

                                    {/* Text */}
                                    <div className="w-full md:w-1/2">
                                        <h3 className="text-xl font-semibold text-white mb-3 leading-snug">
                                            {card.title}
                                        </h3>
                                        <p className="text-sm text-slate-400 leading-relaxed">
                                            {card.description}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
