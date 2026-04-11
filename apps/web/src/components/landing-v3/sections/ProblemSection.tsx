/**
 * ProblemSection — "Why StenVault" architecture showcase
 *
 * Three cards showing the real technical foundations: zero-knowledge,
 * post-quantum crypto, and open verifiability. Substance, not sentiment.
 */
import { useRef, useEffect } from 'react';
import { Lock, ShieldCheck, Code } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { PROBLEM } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { SpotlightCard } from '../components/SpotlightCard';
import { getReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

const VALUE_ICONS = [Lock, ShieldCheck, Code];

export function ProblemSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<HTMLDivElement>(null);

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

            const items = cardsRef.current?.querySelectorAll('.value-card');
            if (items) {
                gsap.fromTo(
                    items,
                    { y: 40, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.7,
                        stagger: 0.12,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: cardsRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
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
                            'text-indigo-400 mb-5 block',
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

                {/* Value Cards */}
                <div
                    ref={cardsRef}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6"
                >
                    {PROBLEM.cards.map((card, i) => {
                        const Icon = VALUE_ICONS[i]!;
                        return (
                            <div key={card.id} className="value-card">
                                <SpotlightCard
                                    variant="glass"
                                    spotlightColor={LANDING_COLORS.accent}
                                    glowIntensity={0.06}
                                    tilt={false}
                                    className="p-8 h-full"
                                >
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                                        style={{
                                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                            border: '1px solid rgba(99, 102, 241, 0.15)',
                                        }}
                                    >
                                        <Icon className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-white mb-3 leading-snug">
                                        {card.title}
                                    </h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        {card.description}
                                    </p>
                                </SpotlightCard>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
