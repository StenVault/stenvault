/**
 * GradientMesh - Animated Background with GSAP
 */
import { useEffect, useRef, useState, memo } from 'react';
import { gsap } from 'gsap';
import { LANDING_COLORS } from '@/lib/constants/themeColors';
import { getReducedMotion } from '@stenvault/shared/hooks/useReducedMotion';

interface GradientMeshProps {
    intensity?: number;
    primaryColor?: string;
    secondaryColor?: string;
    interactive?: boolean;
    className?: string;
    variant?: 'default' | 'hero' | 'cta' | 'subtle';
}

const VARIANTS = {
    default: { orbs: 3, orbsMobile: 2, blur: 150, opacity: 0.15, scale: 1 },
    hero: { orbs: 5, orbsMobile: 3, blur: 200, opacity: 0.2, scale: 1.2 },
    cta: { orbs: 4, orbsMobile: 2, blur: 180, opacity: 0.25, scale: 1.1 },
    subtle: { orbs: 2, orbsMobile: 1, blur: 200, opacity: 0.08, scale: 0.8 },
};

function isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
}

function throttle<T extends (...args: Parameters<T>) => void>(
    fn: T,
    wait: number
): (...args: Parameters<T>) => void {
    let lastTime = 0;
    return (...args: Parameters<T>) => {
        const now = Date.now();
        if (now - lastTime >= wait) {
            lastTime = now;
            fn(...args);
        }
    };
}

function GradientMeshComponent({
    intensity = 1,
    primaryColor = LANDING_COLORS.accent,
    secondaryColor = '#7C3AED',
    interactive = true,
    className = '',
    variant = 'default',
}: GradientMeshProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const orbsRef = useRef<HTMLDivElement[]>([]);
    const mouseRef = useRef({ x: 0.5, y: 0.5 });
    const rafRef = useRef<number | null>(null);
    const tweensRef = useRef<gsap.core.Tween[]>([]);
    const [isVisible, setIsVisible] = useState(true);
    const [isMobileDevice] = useState(() => isMobile());

    const config = VARIANTS[variant];
    const orbCount = isMobileDevice ? config.orbsMobile : config.orbs;

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry) setIsVisible(entry.isIntersecting);
            },
            { threshold: 0.1 }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const prefersReducedMotion = getReducedMotion();
        if (prefersReducedMotion) return;

        const orbs = orbsRef.current.filter(Boolean);
        if (orbs.length === 0) return;

        if (!isVisible) {
            tweensRef.current.forEach(t => t.pause());
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }

        if (tweensRef.current.length > 0) {
            tweensRef.current.forEach(t => t.resume());
        } else {
            orbs.forEach((orb, i) => {
                const duration = 15 + i * 5;
                const delay = i * 2;

                const tween = gsap.to(orb, {
                    x: `random(-100, 100)`,
                    y: `random(-50, 50)`,
                    scale: `random(0.8, 1.2)`,
                    duration,
                    delay,
                    repeat: -1,
                    yoyo: true,
                    ease: 'sine.inOut',
                });
                tweensRef.current.push(tween);

                const rotateTween = gsap.to(orb, {
                    rotation: 360,
                    duration: duration * 2,
                    repeat: -1,
                    ease: 'none',
                });
                tweensRef.current.push(rotateTween);
            });
        }

        if (interactive && !isMobileDevice && isVisible) {
            const handleMouseMove = throttle((e: MouseEvent) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;

                mouseRef.current = {
                    x: (e.clientX - rect.left) / rect.width,
                    y: (e.clientY - rect.top) / rect.height,
                };
            }, 16);

            let isAnimating = true;
            const animate = () => {
                if (!isAnimating) return;

                orbs.forEach((orb, i) => {
                    if (!orb) return;
                    const factor = (i + 1) * 20;
                    const offsetX = (mouseRef.current.x - 0.5) * factor;
                    const offsetY = (mouseRef.current.y - 0.5) * factor;

                    gsap.to(orb, {
                        x: `+=${offsetX * 0.1}`,
                        y: `+=${offsetY * 0.1}`,
                        duration: 0.5,
                        ease: 'power2.out',
                        overwrite: 'auto',
                    });
                });
                rafRef.current = requestAnimationFrame(animate);
            };

            window.addEventListener('mousemove', handleMouseMove);
            rafRef.current = requestAnimationFrame(animate);

            return () => {
                isAnimating = false;
                window.removeEventListener('mousemove', handleMouseMove);
                if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            };
        }

        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [interactive, variant, isVisible, isMobileDevice]);

    useEffect(() => {
        return () => {
            tweensRef.current.forEach(t => t.kill());
            tweensRef.current = [];
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const orbConfigs = Array.from({ length: orbCount }, (_, i) => ({
        id: i,
        size: 300 + i * 100,
        x: 20 + (i * 25) % 80,
        y: 10 + (i * 30) % 80,
        color: i % 2 === 0 ? primaryColor : secondaryColor,
        opacity: (config.opacity * intensity) / (1 + i * 0.2),
    }));

    return (
        <div
            ref={containerRef}
            className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
            aria-hidden="true"
        >
            <div
                className="absolute inset-0"
                style={{
                    background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${primaryColor}15, transparent)`,
                }}
            />

            {orbConfigs.map((orb) => (
                <div
                    key={orb.id}
                    ref={(el) => { if (el) orbsRef.current[orb.id] = el; }}
                    className="absolute rounded-full will-change-transform"
                    style={{
                        width: orb.size * config.scale,
                        height: orb.size * config.scale,
                        left: `${orb.x}%`,
                        top: `${orb.y}%`,
                        background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
                        filter: `blur(${config.blur}px)`,
                        opacity: orb.opacity,
                        transform: 'translate(-50%, -50%)',
                    }}
                />
            ))}

            <div
                className="absolute inset-0 opacity-[0.015] mix-blend-overlay"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            <div
                className="absolute inset-0"
                style={{
                    background: `radial-gradient(ellipse at center, transparent 0%, ${LANDING_COLORS.bg} 80%)`,
                }}
            />
        </div>
    );
}

export const GradientMesh = memo(GradientMeshComponent);
