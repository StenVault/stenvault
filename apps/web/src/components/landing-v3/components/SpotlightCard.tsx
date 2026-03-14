/**
 * SpotlightCard - Premium Card with Cursor-Following Light Effect
 */
import { useRef, useState, useCallback, ReactNode, memo } from 'react';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';

interface SpotlightCardProps {
    children: ReactNode;
    className?: string;
    spotlightColor?: string;
    tilt?: boolean;
    tiltAngle?: number;
    spotlightSize?: number;
    glowIntensity?: number;
    variant?: 'default' | 'glass' | 'solid' | 'bordered';
    onClick?: () => void;
    as?: 'div' | 'article' | 'section' | 'button';
}

const VARIANTS = {
    default: {
        bg: `${LANDING_COLORS.surface}`,
        border: `${LANDING_COLORS.border}`,
        hoverBorder: `${LANDING_COLORS.borderHover}`,
    },
    glass: {
        bg: `${LANDING_COLORS.surface}80`,
        border: `${LANDING_COLORS.border}60`,
        hoverBorder: `${LANDING_COLORS.accent}40`,
        backdrop: true,
    },
    solid: {
        bg: LANDING_COLORS.surface,
        border: LANDING_COLORS.border,
        hoverBorder: LANDING_COLORS.accent,
    },
    bordered: {
        bg: 'transparent',
        border: LANDING_COLORS.border,
        hoverBorder: LANDING_COLORS.accent,
    },
};

function SpotlightCardComponent({
    children,
    className,
    spotlightColor = LANDING_COLORS.accent,
    tilt = true,
    tiltAngle = 10,
    spotlightSize = 400,
    glowIntensity = 0.15,
    variant = 'default',
    onClick,
    as: Component = 'div',
}: SpotlightCardProps) {
    const cardRef = useRef<HTMLElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [tiltValues, setTiltValues] = useState({ rotateX: 0, rotateY: 0 });

    const config = VARIANTS[variant];

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
        const card = cardRef.current;
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setMousePosition({ x, y });

        if (tilt) {
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -tiltAngle;
            const rotateY = ((x - centerX) / centerX) * tiltAngle;
            setTiltValues({ rotateX, rotateY });
        }
    }, [tilt, tiltAngle]);

    const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        setTiltValues({ rotateX: 0, rotateY: 0 });
    }, []);

    const prefersReducedMotion = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    const cardStyle: React.CSSProperties = {
        '--spotlight-x': `${mousePosition.x}px`,
        '--spotlight-y': `${mousePosition.y}px`,
        '--spotlight-size': `${spotlightSize}px`,
        '--spotlight-color': spotlightColor,
        '--glow-intensity': glowIntensity,
        backgroundColor: config.bg,
        borderColor: isHovered ? config.hoverBorder : config.border,
        transform: !prefersReducedMotion && tilt && isHovered
            ? `perspective(1000px) rotateX(${tiltValues.rotateX}deg) rotateY(${tiltValues.rotateY}deg) scale3d(1.02, 1.02, 1.02)`
            : 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    } as React.CSSProperties;

    return (
        <Component
            ref={cardRef as any}
            className={cn(
                'group relative rounded-2xl border overflow-hidden',
                'transition-all duration-300 ease-out',
                'backdrop' in config && config.backdrop && 'backdrop-blur-xl',
                onClick && 'cursor-pointer',
                className
            )}
            style={cardStyle}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
        >
            <div
                className={cn(
                    'pointer-events-none absolute inset-0 z-10 transition-opacity duration-300',
                    isHovered ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                    background: `radial-gradient(
                        var(--spotlight-size) circle at var(--spotlight-x) var(--spotlight-y),
                        ${spotlightColor}${Math.round(glowIntensity * 255).toString(16).padStart(2, '0')},
                        transparent 40%
                    )`,
                }}
            />

            <div
                className={cn(
                    'pointer-events-none absolute inset-0 z-20 rounded-2xl transition-opacity duration-300',
                    isHovered ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                    background: `radial-gradient(
                        calc(var(--spotlight-size) * 0.8) circle at var(--spotlight-x) var(--spotlight-y),
                        transparent 30%,
                        ${spotlightColor}10 70%,
                        transparent 100%
                    )`,
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'xor',
                    WebkitMaskComposite: 'xor',
                    padding: '1px',
                }}
            />

            <div className="relative z-30">
                {children}
            </div>

            <div
                className={cn(
                    'pointer-events-none absolute inset-0 z-0 transition-opacity duration-500',
                    isHovered ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                    background: `linear-gradient(
                        105deg,
                        transparent 40%,
                        ${spotlightColor}08 45%,
                        ${spotlightColor}15 50%,
                        ${spotlightColor}08 55%,
                        transparent 60%
                    )`,
                    transform: `translateX(${isHovered ? '100%' : '-100%'})`,
                    transition: 'transform 0.6s ease-out, opacity 0.3s ease',
                }}
            />
        </Component>
    );
}

export const SpotlightCard = memo(SpotlightCardComponent);
