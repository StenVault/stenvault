/**
 * HeroSection — Full-viewport particle network with encryption morphing
 *
 * Canvas 2D particle network behind text. Mouse-interactive on desktop.
 * Text nodes cycle between filenames and encrypted hashes.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { ArrowRight, Shield, Lock, Eye } from 'lucide-react';
import { useLocation } from 'wouter';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { HERO } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { CANVAS_SETTINGS } from '../constants/tokens';
import { GradientMesh } from '../components/GradientMesh';
import { MagneticButton } from '../components/MagneticButton';
import { ParticleCanvas } from '../components/ParticleCanvas';
import { getReducedMotion } from '@/hooks/useReducedMotion';
import {
    createParticles,
    createTextNodes,
    updateParticles,
    updateTextNodes,
    drawParticles,
    type Particle,
    type TextNode,
} from '../canvas/heroParticles';

const BADGE_ICONS = [Shield, Lock, Eye];

export function HeroSection() {
    const [, setLocation] = useLocation();
    const sectionRef = useRef<HTMLElement>(null);
    const headlineRef = useRef<HTMLDivElement>(null);
    const subRef = useRef<HTMLParagraphElement>(null);
    const ctaRef = useRef<HTMLDivElement>(null);
    const badgesRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Particle state refs (stable across renders)
    const particlesRef = useRef<Particle[]>([]);
    const textNodesRef = useRef<TextNode[]>([]);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Mouse glow
    const glowRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isMobile) return;
        const section = sectionRef.current;
        const glow = glowRef.current;
        if (!section || !glow) return;

        function onMove(e: MouseEvent) {
            const rect = section!.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            glow!.style.background = `radial-gradient(300px circle at ${x}px ${y}px, rgba(99, 102, 241, 0.06), transparent)`;
        }
        section.addEventListener('mousemove', onMove);
        return () => section.removeEventListener('mousemove', onMove);
    }, [isMobile]);

    // GSAP entrance animations
    useEffect(() => {
        if (getReducedMotion()) return;

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ delay: 0.3 });

            const lines = headlineRef.current?.querySelectorAll('.hero-line');
            if (lines) {
                tl.fromTo(
                    lines,
                    { y: 80, opacity: 0, skewY: 2 },
                    {
                        y: 0,
                        opacity: 1,
                        skewY: 0,
                        duration: 1,
                        stagger: 0.15,
                        ease: 'expo.out',
                    },
                );
            }

            if (subRef.current) {
                tl.fromTo(
                    subRef.current,
                    { y: 30, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out' },
                    '-=0.5',
                );
            }

            if (ctaRef.current) {
                tl.fromTo(
                    ctaRef.current,
                    { y: 20, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' },
                    '-=0.3',
                );
            }

            if (badgesRef.current) {
                const badges =
                    badgesRef.current.querySelectorAll('.trust-badge');
                tl.fromTo(
                    badges,
                    { y: 15, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.5,
                        stagger: 0.1,
                        ease: 'expo.out',
                    },
                    '-=0.2',
                );
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    const handleResize = useCallback(
        (w: number, h: number) => {
            const config = CANVAS_SETTINGS.hero;
            const count = isMobile
                ? config.particleCountMobile
                : config.particleCount;
            particlesRef.current = createParticles(w, h, { ...config, particleCount: count });
            textNodesRef.current = isMobile ? [] : createTextNodes(w, h);
        },
        [isMobile],
    );

    const handleDraw = useCallback(
        (
            ctx: CanvasRenderingContext2D,
            w: number,
            h: number,
            mx: number,
            my: number,
            time: number,
        ) => {
            const config = CANVAS_SETTINGS.hero;
            const mouseActive = !isMobile && mx > 0 && my > 0;
            updateParticles(
                particlesRef.current,
                w,
                h,
                mx,
                my,
                mouseActive,
                { ...config, particleCount: particlesRef.current.length },
            );
            if (!isMobile) {
                updateTextNodes(textNodesRef.current, time);
            }
            drawParticles(
                ctx,
                particlesRef.current,
                textNodesRef.current,
                w,
                h,
                { ...config, particleCount: particlesRef.current.length },
                LANDING_COLORS.accent,
                time,
            );
        },
        [isMobile],
    );

    return (
        <section
            ref={sectionRef}
            className="relative min-h-screen flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            {/* Subtle GradientMesh at 30% opacity for ambient color */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
                <GradientMesh variant="hero" interactive={false} />
            </div>

            {/* Particle canvas */}
            <ParticleCanvas
                onDraw={handleDraw}
                onResize={handleResize}
                trackMouse={!isMobile}
                style={{ zIndex: 1 }}
            />

            {/* Cursor glow (desktop only) */}
            {!isMobile && (
                <div
                    ref={glowRef}
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 2 }}
                />
            )}

            {/* Ambient glow */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    zIndex: 2,
                    background: `radial-gradient(ellipse 70% 50% at 50% 40%, ${LANDING_COLORS.accent}0a, transparent)`,
                }}
            />

            {/* Content */}
            <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-20 md:pt-36 md:pb-28 pointer-events-none">
                <div className="flex flex-col items-center text-center">
                    {/* Headline */}
                    <div ref={headlineRef} className="mb-8 md:mb-10">
                        <h1
                            className={cn(
                                TYPOGRAPHY.heroHeadline,
                                'text-white',
                            )}
                        >
                            <span className="hero-line block">
                                {HERO.headline.line1}
                            </span>
                            <span className="hero-line block bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                                {HERO.headline.line2}
                            </span>
                        </h1>
                    </div>

                    {/* Subheadline */}
                    <p
                        ref={subRef}
                        className="max-w-2xl text-base md:text-lg text-slate-400 leading-relaxed mb-10 md:mb-14"
                    >
                        {HERO.subheadline}
                    </p>

                    {/* CTAs */}
                    <div
                        ref={ctaRef}
                        className="flex flex-col sm:flex-row items-center gap-4 pointer-events-auto"
                    >
                        <MagneticButton
                            variant="primary"
                            size="lg"
                            onClick={() => setLocation('/auth/register')}
                            className="group"
                        >
                            {HERO.cta}
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </MagneticButton>

                        <MagneticButton
                            variant="ghost"
                            size="lg"
                            as="a"
                            href="#how-it-works"
                            className="text-slate-400"
                        >
                            {HERO.ctaSecondary}
                        </MagneticButton>
                    </div>

                    {/* Trust badges */}
                    <div
                        ref={badgesRef}
                        className="mt-16 md:mt-20 flex flex-wrap justify-center gap-6 md:gap-8 pointer-events-auto"
                    >
                        {HERO.trustBadges.map((badge, i) => {
                            const Icon = BADGE_ICONS[i] ?? Shield;
                            return (
                                <div
                                    key={badge}
                                    className="trust-badge flex items-center gap-2 text-slate-400"
                                >
                                    <Icon className="w-4 h-4 text-indigo-400" />
                                    <span className="text-xs md:text-sm tracking-wide">
                                        {badge}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom fade */}
            <div
                className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
                style={{
                    zIndex: 10,
                    background: `linear-gradient(to top, ${LANDING_COLORS.bg}, transparent)`,
                }}
            />

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 z-10">
                <div className="w-px h-8 bg-gradient-to-b from-transparent to-indigo-400/50" />
                <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-600">
                    Scroll
                </span>
            </div>
        </section>
    );
}
