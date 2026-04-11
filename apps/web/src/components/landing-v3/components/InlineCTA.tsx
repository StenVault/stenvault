/**
 * InlineCTA — Atmospheric interstitial conversion nudge
 *
 * A slim, non-intrusive banner placed between major sections.
 * Glass-morphism strip with centered text and a single CTA button.
 * GSAP scroll-triggered entrance.
 */
import { useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LANDING_COLORS } from '../constants';
import { getReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

interface InlineCTAProps {
    text: string;
    subtext: string;
    cta: string;
}

export function InlineCTA({ text, subtext, cta }: InlineCTAProps) {
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (getReducedMotion() || !ref.current) return;

        const ctx = gsap.context(() => {
            gsap.fromTo(
                ref.current,
                { opacity: 0, y: 20 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.7,
                    ease: 'expo.out',
                    scrollTrigger: {
                        trigger: ref.current,
                        start: 'top 90%',
                        once: true,
                    },
                },
            );
        }, ref);

        return () => ctx.revert();
    }, []);

    return (
        <div
            ref={ref}
            className="relative py-12 md:py-16 overflow-hidden"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            {/* Divider lines */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                    background: `linear-gradient(to right, transparent, ${LANDING_COLORS.border}, transparent)`,
                }}
            />
            <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{
                    background: `linear-gradient(to right, transparent, ${LANDING_COLORS.border}, transparent)`,
                }}
            />

            {/* Subtle center glow */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `radial-gradient(ellipse 50% 100% at 50% 50%, ${LANDING_COLORS.accent}06, transparent)`,
                }}
            />

            <div className="relative z-10 max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-center sm:text-left">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-base md:text-lg leading-snug">
                        {text}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                        {subtext}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/auth/register')}
                    className="group flex-shrink-0 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 cursor-pointer hover:shadow-lg"
                    style={{
                        backgroundColor: LANDING_COLORS.accent,
                        boxShadow: `0 0 20px ${LANDING_COLORS.accent}20`,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 30px ${LANDING_COLORS.accent}40`;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 20px ${LANDING_COLORS.accent}20`;
                    }}
                >
                    {cta}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
            </div>
        </div>
    );
}
