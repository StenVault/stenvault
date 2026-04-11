/**
 * PricingPreviewSection — Compact pricing teaser before final CTA
 *
 * Three minimal plan cards with key price points. Not a full pricing table —
 * a conversion-oriented preview that links to /pricing for details.
 * SpotlightCards with GSAP scroll-triggered stagger animation.
 */
import { useRef, useEffect } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { PRICING_PREVIEW } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { SpotlightCard } from '../components/SpotlightCard';
import { getReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

export function PricingPreviewSection() {
    const navigate = useNavigate();
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<HTMLDivElement>(null);
    const linkRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (getReducedMotion()) return;

        const ctx = gsap.context(() => {
            if (headingRef.current) {
                gsap.fromTo(
                    headingRef.current,
                    { y: 40, opacity: 0 },
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

            const cards = cardsRef.current?.querySelectorAll('.pricing-card');
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
                            trigger: cardsRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
            }

            if (linkRef.current) {
                gsap.fromTo(
                    linkRef.current,
                    { y: 20, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.6,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: linkRef.current,
                            start: 'top 90%',
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
            {/* Top divider */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                    background: `linear-gradient(to right, transparent, ${LANDING_COLORS.border}, transparent)`,
                }}
            />

            <div className="max-w-5xl mx-auto px-6">
                {/* Heading */}
                <div ref={headingRef} className="text-center mb-14 md:mb-18">
                    <span
                        className={cn(
                            TYPOGRAPHY.sectionLabel,
                            'text-indigo-400 mb-5 block',
                        )}
                    >
                        {PRICING_PREVIEW.label}
                    </span>
                    <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.1] text-white whitespace-pre-line">
                        {PRICING_PREVIEW.headline}
                    </h2>
                </div>

                {/* Plan cards */}
                <div
                    ref={cardsRef}
                    className="grid grid-cols-1 md:grid-cols-3 gap-5"
                >
                    {PRICING_PREVIEW.plans.map((plan) => (
                        <div key={plan.id} className="pricing-card">
                            <SpotlightCard
                                variant="glass"
                                className={cn(
                                    'p-7 h-full relative',
                                    plan.highlight && 'ring-1 ring-indigo-500/30',
                                )}
                                onClick={() => navigate('/pricing')}
                                as="button"
                            >
                                {plan.highlight && (
                                    <div
                                        className="absolute -top-px left-0 right-0 h-px"
                                        style={{
                                            background: `linear-gradient(to right, transparent, ${LANDING_COLORS.accent}, transparent)`,
                                        }}
                                    />
                                )}

                                <div className="text-left">
                                    {/* Plan name */}
                                    <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate-500">
                                        {plan.name}
                                    </span>

                                    {/* Price */}
                                    <div className="mt-3 flex items-baseline gap-1.5">
                                        <span className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">
                                            {plan.price}
                                        </span>
                                        <span className="text-sm text-slate-500">
                                            {plan.period}
                                        </span>
                                    </div>

                                    {/* Features */}
                                    <ul className="mt-5 space-y-2.5">
                                        {plan.features.map((feature) => (
                                            <li
                                                key={feature}
                                                className="flex items-center gap-2.5"
                                            >
                                                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500/10">
                                                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                                                </div>
                                                <span className="text-sm text-slate-400">
                                                    {feature}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </SpotlightCard>
                        </div>
                    ))}
                </div>

                {/* "See full pricing" link */}
                <div ref={linkRef} className="mt-10 text-center">
                    <Link
                        to="/pricing"
                        className="group inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors duration-300"
                    >
                        {PRICING_PREVIEW.cta}
                        <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                </div>
            </div>
        </section>
    );
}
