/**
 * TrustSection — Typewriter quote + scramble stats + SVG check draws
 *
 * Enhanced animations: quote typewriter, stats scramble-resolve,
 * guarantee checkmarks draw on scroll. Sparse particle background.
 */
import { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { TRUST } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { GradientMesh } from '../components/GradientMesh';
import { TextScramble } from '../components/TextScramble';
import { getReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

function TypewriterQuote({ text }: { text: string }) {
    const [displayed, setDisplayed] = useState('');
    const [showCursor, setShowCursor] = useState(true);
    const ref = useRef<HTMLQuoteElement>(null);
    const [triggered, setTriggered] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setTriggered(true);
                    io.disconnect();
                }
            },
            { threshold: 0.3 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        if (!triggered) return;
        if (getReducedMotion()) {
            setDisplayed(text);
            setShowCursor(false);
            return;
        }

        let i = 0;
        const interval = setInterval(() => {
            if (i < text.length) {
                setDisplayed(text.slice(0, i + 1));
                i++;
            } else {
                clearInterval(interval);
                setTimeout(() => setShowCursor(false), 2000);
            }
        }, 30);

        return () => clearInterval(interval);
    }, [triggered, text]);

    return (
        <blockquote ref={ref} className="mb-20 md:mb-28 text-center">
            <p className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-[1.2] tracking-tight text-white/90 max-w-4xl mx-auto">
                &ldquo;{displayed}
                {showCursor && triggered && (
                    <span className="inline-block w-[3px] h-[0.8em] bg-indigo-400/70 ml-1 align-middle animate-cursor-blink" />
                )}
                {displayed.length === text.length && '\u201D'}
            </p>
            <div className="mt-6 w-16 h-px bg-indigo-500/40 mx-auto" />
        </blockquote>
    );
}

function AnimatedCheck({ delay }: { delay: number }) {
    const ref = useRef<SVGSVGElement>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setInView(true);
                    io.disconnect();
                }
            },
            { threshold: 0.5 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <svg
            ref={ref}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="flex-shrink-0"
        >
            <path
                d="M2.5 6 L5 8.5 L9.5 3.5"
                stroke="#10B981"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all"
                style={{
                    strokeDasharray: 12,
                    strokeDashoffset: inView ? 0 : 12,
                    transition: `stroke-dashoffset 0.5s ease-out ${delay}s`,
                }}
            />
        </svg>
    );
}

export function TrustSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const pillarsRef = useRef<HTMLDivElement>(null);
    const guaranteesRef = useRef<HTMLDivElement>(null);
    const [pillarsVisible, setPillarsVisible] = useState(false);

    useEffect(() => {
        if (getReducedMotion()) return;

        const ctx = gsap.context(() => {
            if (pillarsRef.current) {
                ScrollTrigger.create({
                    trigger: pillarsRef.current,
                    start: 'top 80%',
                    once: true,
                    onEnter: () => setPillarsVisible(true),
                });
            }

            const items =
                guaranteesRef.current?.querySelectorAll('.guarantee-item');
            if (items) {
                gsap.fromTo(
                    items,
                    { x: -20, opacity: 0 },
                    {
                        x: 0,
                        opacity: 1,
                        duration: 0.6,
                        stagger: 0.1,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: guaranteesRef.current,
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
            id="security"
            className="relative py-24 md:py-32 lg:py-44 overflow-hidden"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            <GradientMesh
                variant="cta"
                primaryColor={LANDING_COLORS.accentDeep}
                secondaryColor={LANDING_COLORS.accent}
                intensity={1.2}
                interactive={false}
            />

            <div className="relative z-10 max-w-6xl mx-auto px-6">
                {/* Section label */}
                <div className="text-center mb-12 md:mb-16">
                    <span
                        className={cn(
                            TYPOGRAPHY.sectionLabel,
                            'text-indigo-400',
                        )}
                    >
                        {TRUST.label}
                    </span>
                </div>

                {/* Typewriter quote */}
                <TypewriterQuote text={TRUST.quote} />

                {/* Trust pillars with scramble stats */}
                <div
                    ref={pillarsRef}
                    className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 mb-20 md:mb-28"
                >
                    {TRUST.pillars.map((pillar, i) => (
                        <div
                            key={pillar.label}
                            className="trust-pillar text-center"
                        >
                            <div className="flex items-baseline justify-center gap-2 mb-3">
                                <TextScramble
                                    text={pillar.stat}
                                    trigger={pillarsVisible}
                                    duration={800}
                                    delay={i * 200}
                                    className="font-display text-4xl md:text-5xl lg:text-6xl text-white/90 tracking-tighter font-bold"
                                    as="span"
                                    autoTrigger={false}
                                />
                                <TextScramble
                                    text={pillar.unit}
                                    trigger={pillarsVisible}
                                    duration={600}
                                    delay={i * 200 + 300}
                                    className={cn(
                                        TYPOGRAPHY.sectionLabel,
                                        'text-indigo-400',
                                    )}
                                    as="span"
                                    autoTrigger={false}
                                />
                            </div>
                            <h3 className="font-mono text-xs tracking-[0.2em] uppercase text-slate-400 mb-3">
                                {pillar.label}
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
                                {pillar.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Guarantees with animated checkmarks */}
                <div
                    ref={guaranteesRef}
                    className="max-w-2xl mx-auto"
                >
                    <div className="space-y-4">
                        {TRUST.guarantees.map((guarantee, i) => (
                            <div
                                key={guarantee}
                                className="guarantee-item flex items-start gap-3"
                            >
                                <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{
                                        backgroundColor:
                                            'rgba(16, 185, 129, 0.1)',
                                    }}
                                >
                                    <AnimatedCheck delay={i * 0.15} />
                                </div>
                                <span className="text-sm md:text-base text-slate-300 leading-relaxed">
                                    {guarantee}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes cursor-blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                    .animate-cursor-blink {
                        animation: cursor-blink 0.8s step-end infinite;
                    }
                }
            `}</style>
        </section>
    );
}
