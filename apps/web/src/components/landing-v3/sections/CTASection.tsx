/**
 * CTASection — Particle shield coalescence + final conversion
 *
 * Canvas 2D background where particles coalesce into a shield shape on scroll.
 * Keep: centered headline, subheadline, CTA button.
 */
import { useRef, useEffect, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LANDING_COLORS } from '../constants';
import { CTA } from '../constants/copy';
import { CANVAS_SETTINGS } from '../constants/tokens';
import { MagneticButton } from '../components/MagneticButton';
import { ParticleCanvas } from '../components/ParticleCanvas';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { getReducedMotion } from '@/hooks/useReducedMotion';
import {
    createShieldParticles,
    updateShieldParticles,
    drawShield,
    type ShieldParticle,
} from '../canvas/shieldFormation';

gsap.registerPlugin(ScrollTrigger);

export function CTASection() {
    const [, setLocation] = useLocation();
    const sectionRef = useRef<HTMLElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<ShieldParticle[]>([]);

    const [scrollRef, progress] = useScrollProgress({
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 1,
    });

    useEffect(() => {
        if (getReducedMotion()) return;

        const ctx = gsap.context(() => {
            if (contentRef.current) {
                gsap.fromTo(
                    contentRef.current,
                    { y: 40, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.8,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: contentRef.current,
                            start: 'top 85%',
                            once: true,
                        },
                    },
                );
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    const handleResize = useCallback((w: number, h: number) => {
        particlesRef.current = createShieldParticles(
            w,
            h,
            CANVAS_SETTINGS.cta.particleCount,
        );
    }, []);

    const handleDraw = useCallback(
        (ctx: CanvasRenderingContext2D, w: number, h: number) => {
            if (particlesRef.current.length === 0) {
                particlesRef.current = createShieldParticles(
                    w,
                    h,
                    CANVAS_SETTINGS.cta.particleCount,
                );
            }
            updateShieldParticles(particlesRef.current, progress);
            drawShield(ctx, particlesRef.current, w, h, progress);
        },
        [progress],
    );

    return (
        <section
            ref={sectionRef}
            className="relative py-24 md:py-32 lg:py-40 overflow-hidden"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            {/* Scroll progress trigger */}
            <div ref={scrollRef} className="absolute inset-0 pointer-events-none" />

            {/* Shield particle canvas */}
            <ParticleCanvas
                onDraw={handleDraw}
                onResize={handleResize}
                className="!pointer-events-none"
                style={{ zIndex: 0 }}
            />

            {/* Gradient overlay */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    zIndex: 1,
                    background: `
                        radial-gradient(ellipse 80% 60% at 50% 50%, ${LANDING_COLORS.accent}0c, transparent),
                        radial-gradient(ellipse 60% 40% at 30% 60%, ${LANDING_COLORS.accentDeep}08, transparent),
                        radial-gradient(ellipse 60% 40% at 70% 40%, ${LANDING_COLORS.accentVivid}06, transparent)
                    `,
                }}
            />

            {/* Top divider */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                    zIndex: 2,
                    background: `linear-gradient(to right, transparent, ${LANDING_COLORS.border}, transparent)`,
                }}
            />

            <div
                ref={contentRef}
                className="relative z-10 max-w-3xl mx-auto px-6 text-center"
            >
                <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white whitespace-pre-line">
                    {CTA.headline}
                </h2>
                <p className="mt-6 text-base md:text-lg text-slate-400 leading-relaxed">
                    {CTA.subheadline}
                </p>
                <div className="mt-10 md:mt-12">
                    <MagneticButton
                        variant="primary"
                        size="lg"
                        onClick={() => setLocation('/auth/register')}
                        className="group"
                    >
                        {CTA.cta}
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </MagneticButton>
                </div>
                <p className="mt-6 text-xs text-slate-600">
                    Free to start. No credit card required.
                </p>
            </div>
        </section>
    );
}
