/**
 * VisualSecuritySection — Scroll-driven encryption pipeline
 *
 * Full-width Canvas 2D pipeline animated by scroll position.
 * 5 nodes with colored particles flowing between them.
 * Mobile fallback: CSS sequential reveal.
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { FileText, Lock, Cloud, Unlock, CheckCircle } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { VISUAL_SECURITY } from '../constants/copy';
import { TYPOGRAPHY } from '../constants/tokens';
import { ParticleCanvas } from '../components/ParticleCanvas';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { getReducedMotion } from '@/hooks/useReducedMotion';
import {
    initPipeline,
    updatePipeline,
    drawPipeline,
} from '../canvas/encryptionPipeline';

gsap.registerPlugin(ScrollTrigger);

const STEP_ICONS = [FileText, Lock, Cloud, Unlock, CheckCircle];
const STEP_COLORS = ['#818CF8', '#6366F1', '#4338CA', '#10B981', '#10B981'];

function useIsMobile() {
    const [mobile, setMobile] = useState(false);
    useEffect(() => {
        const check = () => setMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return mobile;
}

export function VisualSecuritySection() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const captionRef = useRef<HTMLParagraphElement>(null);
    const isMobile = useIsMobile();

    const [scrollRef, progress] = useScrollProgress({
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 1,
    });

    // Pipeline state ref
    const pipelineRef = useRef<ReturnType<typeof initPipeline> | null>(null);

    // GSAP heading/caption animations
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
            if (captionRef.current) {
                gsap.fromTo(
                    captionRef.current,
                    { y: 20, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.6,
                        ease: 'expo.out',
                        scrollTrigger: {
                            trigger: captionRef.current,
                            start: 'top 90%',
                            once: true,
                        },
                    },
                );
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    const handleResize = useCallback((w: number, h: number) => {
        pipelineRef.current = initPipeline(w, h);
    }, []);

    const handleDraw = useCallback(
        (ctx: CanvasRenderingContext2D, w: number, h: number) => {
            if (!pipelineRef.current) {
                pipelineRef.current = initPipeline(w, h);
            }
            updatePipeline(pipelineRef.current, progress);
            drawPipeline(ctx, pipelineRef.current, w, h);
        },
        [progress],
    );

    return (
        <section
            ref={sectionRef}
            id="how-it-works"
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
                        {VISUAL_SECURITY.label}
                    </span>
                    <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white whitespace-pre-line">
                        {VISUAL_SECURITY.headline}
                    </h2>
                    <p className="mt-6 max-w-xl mx-auto text-base md:text-lg text-slate-400 leading-relaxed">
                        {VISUAL_SECURITY.subheadline}
                    </p>
                </div>

                {/* Pipeline visualization */}
                <div ref={scrollRef} className="relative" style={{ minHeight: isMobile ? 'auto' : '200px' }}>
                    {isMobile ? (
                        /* Mobile fallback: CSS sequential reveal */
                        <MobilePipeline progress={progress} />
                    ) : (
                        /* Desktop: Canvas pipeline */
                        <div className="relative w-full" style={{ height: '200px' }}>
                            <ParticleCanvas
                                onDraw={handleDraw}
                                onResize={handleResize}
                                className="!pointer-events-none"
                            />
                        </div>
                    )}
                </div>

                {/* Caption */}
                <p
                    ref={captionRef}
                    className="mt-16 md:mt-20 max-w-2xl mx-auto text-center text-sm md:text-base text-slate-500 leading-relaxed"
                >
                    {VISUAL_SECURITY.caption}
                </p>
            </div>
        </section>
    );
}

/** Mobile fallback with CSS animations */
function MobilePipeline({ progress }: { progress: number }) {
    return (
        <div className="flex flex-col items-center gap-0">
            {VISUAL_SECURITY.steps.map((step, i) => {
                const Icon = STEP_ICONS[i]!;
                const isActive = progress >= i * 0.2 + 0.05;
                const isLast = i === VISUAL_SECURITY.steps.length - 1;
                const color = STEP_COLORS[i]!;

                return (
                    <div key={step.id} className="flex flex-col items-center">
                        <div
                            className="flex flex-col items-center transition-all duration-500"
                            style={{
                                opacity: isActive ? 1 : 0.3,
                                transform: isActive ? 'scale(1)' : 'scale(0.9)',
                            }}
                        >
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500"
                                style={{
                                    backgroundColor: LANDING_COLORS.surface,
                                    border: `1px solid ${isActive ? color + '40' : LANDING_COLORS.border}`,
                                    boxShadow: isActive
                                        ? `0 0 20px ${color}20`
                                        : 'none',
                                }}
                            >
                                <Icon
                                    className="w-6 h-6 transition-colors duration-500"
                                    style={{ color: isActive ? color : '#475569' }}
                                />
                            </div>
                            <span className="mt-2 text-sm font-medium text-white">
                                {step.label}
                            </span>
                            <span className="text-xs text-slate-500 text-center max-w-[140px]">
                                {step.description}
                            </span>
                        </div>
                        {/* Connector */}
                        {!isLast && (
                            <div className="my-2 flex flex-col items-center">
                                <div
                                    className="w-px h-6 transition-all duration-500"
                                    style={{
                                        background: isActive
                                            ? `linear-gradient(to bottom, ${color}60, ${STEP_COLORS[i + 1]}40)`
                                            : `${LANDING_COLORS.border}`,
                                    }}
                                />
                                {/* Particle-like dots */}
                                {isActive && (
                                    <div className="flex flex-col gap-1 my-1">
                                        {[0, 1, 2].map((d) => (
                                            <div
                                                key={d}
                                                className="w-1 h-1 rounded-full animate-pulse"
                                                style={{
                                                    backgroundColor: color,
                                                    animationDelay: `${d * 0.2}s`,
                                                    opacity: 0.6,
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
