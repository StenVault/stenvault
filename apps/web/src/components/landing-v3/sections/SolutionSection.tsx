/**
 * SolutionSection — Live encryption demo + architecture pillars
 *
 * EncryptionDemo widget above three pillar cards showing
 * the core architectural guarantees of StenVault.
 */
import { useRef, useEffect } from 'react';
import { Lock, KeyRound, ShieldCheck } from 'lucide-react';
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

const PILLAR_ICONS = [Lock, KeyRound, ShieldCheck];

export function SolutionSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const demoRef = useRef<HTMLDivElement>(null);
    const pillarsRef = useRef<HTMLDivElement>(null);

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

            const cards =
                pillarsRef.current?.querySelectorAll('.pillar-card');
            if (cards) {
                gsap.fromTo(
                    cards,
                    { y: 40, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.7,
                        stagger: 0.12,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: pillarsRef.current,
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

                {/* Architecture Pillars */}
                <div
                    ref={pillarsRef}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6"
                >
                    {SOLUTION.pillars.map((pillar, i) => {
                        const Icon = PILLAR_ICONS[i]!;
                        return (
                            <div key={pillar.id} className="pillar-card">
                                <SpotlightCard
                                    variant="glass"
                                    spotlightColor={LANDING_COLORS.accent}
                                    glowIntensity={0.08}
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
                                    <h3 className="text-lg font-semibold text-white mb-3">
                                        {pillar.title}
                                    </h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        {pillar.description}
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
