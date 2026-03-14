/**
 * SolutionSection — Live encryption demo + visual comparison
 *
 * Adds EncryptionDemo widget above the comparison cards.
 * Traditional card: red scanline overlay. CloudVault card: animated border glow.
 * On scroll: Traditional blurs/desaturates, CloudVault brightens.
 */
import { useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { SOLUTION } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { SpotlightCard } from '../components/SpotlightCard';
import { EncryptionDemo } from '../components/EncryptionDemo';
import { getReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

export function SolutionSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const demoRef = useRef<HTMLDivElement>(null);
    const comparisonRef = useRef<HTMLDivElement>(null);

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

            if (demoRef.current) {
                gsap.fromTo(
                    demoRef.current,
                    { y: 40, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.8,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: demoRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
            }

            const columns =
                comparisonRef.current?.querySelectorAll('.comparison-col');
            if (columns) {
                gsap.fromTo(
                    columns,
                    { y: 60, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.8,
                        stagger: 0.15,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: comparisonRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );

                // Scroll-driven: Traditional blurs, CloudVault brightens
                const tradCard = columns[0];
                const vaultCard = columns[1];

                if (tradCard && vaultCard) {
                    gsap.to(tradCard, {
                        filter: 'blur(1px) saturate(0.5)',
                        opacity: 0.7,
                        scrollTrigger: {
                            trigger: comparisonRef.current,
                            start: 'top 40%',
                            end: 'bottom 60%',
                            scrub: 1,
                        },
                    });
                    gsap.to(vaultCard, {
                        scale: 1.02,
                        scrollTrigger: {
                            trigger: comparisonRef.current,
                            start: 'top 40%',
                            end: 'bottom 60%',
                            scrub: 1,
                        },
                    });
                }
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
                        {SOLUTION.label}
                    </span>
                    <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white whitespace-pre-line">
                        {SOLUTION.headline}
                    </h2>
                    <p className="mt-6 max-w-xl mx-auto text-base md:text-lg text-slate-400 leading-relaxed">
                        {SOLUTION.subheadline}
                    </p>
                </div>

                {/* Encryption Demo */}
                <div ref={demoRef} className="mb-12 md:mb-16">
                    <EncryptionDemo />
                </div>

                {/* Comparison */}
                <div
                    ref={comparisonRef}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8"
                >
                    {/* Traditional Cloud */}
                    <div className="comparison-col relative">
                        <SpotlightCard
                            variant="glass"
                            spotlightColor="#EF4444"
                            glowIntensity={0.06}
                            tilt={false}
                            className="p-8 md:p-10 h-full"
                        >
                            {/* Red scanline overlay */}
                            <div
                                className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
                                style={{ zIndex: 1 }}
                            >
                                <div
                                    className="absolute w-full h-[2px] animate-scanline"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.15), transparent)',
                                    }}
                                />
                            </div>

                            <div className="flex items-center gap-3 mb-8">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{
                                        backgroundColor:
                                            'rgba(239, 68, 68, 0.5)',
                                        boxShadow:
                                            '0 0 12px rgba(239, 68, 68, 0.3)',
                                    }}
                                />
                                <h3 className="text-lg font-semibold text-white">
                                    {SOLUTION.traditional.title}
                                </h3>
                            </div>
                            <ul className="space-y-5">
                                {SOLUTION.traditional.points.map((point) => (
                                    <li
                                        key={point}
                                        className="flex items-start gap-3"
                                    >
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-red-500/10">
                                            <X className="w-3 h-3 text-red-400/80" />
                                        </div>
                                        <span className="text-sm text-slate-400 leading-relaxed">
                                            {point}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </SpotlightCard>
                    </div>

                    {/* CloudVault */}
                    <div className="comparison-col relative">
                        <SpotlightCard
                            variant="glass"
                            spotlightColor={LANDING_COLORS.accent}
                            glowIntensity={0.1}
                            tilt={false}
                            className="p-8 md:p-10 h-full"
                        >
                            <div className="flex items-center gap-3 mb-8">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{
                                        backgroundColor:
                                            'rgba(16, 185, 129, 0.5)',
                                        boxShadow:
                                            '0 0 12px rgba(16, 185, 129, 0.3)',
                                    }}
                                />
                                <h3 className="text-lg font-semibold text-white">
                                    {SOLUTION.cloudvault.title}
                                </h3>
                            </div>
                            <ul className="space-y-5">
                                {SOLUTION.cloudvault.points.map((point) => (
                                    <li
                                        key={point}
                                        className="flex items-start gap-3"
                                    >
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-emerald-500/10">
                                            <Check className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <span className="text-sm text-slate-300 leading-relaxed">
                                            {point}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            {/* Animated border glow */}
                            <div
                                className="absolute inset-0 rounded-2xl pointer-events-none animate-border-glow"
                                style={{
                                    boxShadow: `inset 0 0 0 1px ${LANDING_COLORS.accent}15, 0 0 40px ${LANDING_COLORS.accent}05`,
                                }}
                            />
                        </SpotlightCard>
                    </div>
                </div>
            </div>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes scanline {
                        0% { top: -2px; }
                        100% { top: 100%; }
                    }
                    .animate-scanline {
                        animation: scanline 4s linear infinite;
                    }
                    @keyframes border-glow {
                        0%, 100% { box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.1), 0 0 20px rgba(99, 102, 241, 0.03); }
                        50% { box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.25), 0 0 40px rgba(99, 102, 241, 0.08); }
                    }
                    .animate-border-glow {
                        animation: border-glow 3s ease-in-out infinite;
                    }
                }
            `}</style>
        </section>
    );
}
