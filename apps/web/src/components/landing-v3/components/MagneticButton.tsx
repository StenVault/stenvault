/**
 * MagneticButton Component
 * Premium button with cursor attraction effect using framer-motion
 */
import { useRef, useState, ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';

type AsProp<C extends ElementType> = {
    as?: C;
};

type PropsToOmit<C extends ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProps<
    C extends ElementType,
    Props = {}
> = React.PropsWithChildren<Props & AsProp<C>> &
    Omit<ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface MagneticButtonBaseProps {
    children: ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    glowEffect?: boolean;
    className?: string;
    disabled?: boolean;
}

export type MagneticButtonProps<C extends ElementType = 'button'> =
    PolymorphicComponentProps<C, MagneticButtonBaseProps>;

export function MagneticButton<C extends ElementType = 'button'>({
    as,
    children,
    variant = 'primary',
    size = 'md',
    glowEffect = false,
    className,
    disabled = false,
    ...props
}: MagneticButtonProps<C>) {
    const Component = as || 'button';
    const elementRef = useRef<HTMLElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springConfig = { damping: 15, stiffness: 150 };
    const springX = useSpring(x, springConfig);
    const springY = useSpring(y, springConfig);

    const handleMouseMove = (e: React.MouseEvent) => {
        const element = elementRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distanceX = e.clientX - centerX;
        const distanceY = e.clientY - centerY;

        x.set(distanceX * 0.35);
        y.set(distanceY * 0.35);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        x.set(0);
        y.set(0);
    };

    const sizeClasses = {
        sm: 'px-4 py-2 text-sm gap-1.5',
        md: 'px-6 py-3 text-base gap-2',
        lg: 'px-8 py-4 text-lg gap-2.5',
    };

    const variantClasses = {
        primary: cn(
            'text-white font-semibold shadow-lg',
            isHovered && `shadow-[0_0_30px_${LANDING_COLORS.accentGlow}]`
        ),
        secondary: cn(
            'font-medium',
            isHovered && `shadow-[0_0_20px_${LANDING_COLORS.accentSubtle}]`
        ),
        ghost: cn(
            'font-medium'
        ),
    };

    const variantStyles = {
        primary: {
            backgroundColor: LANDING_COLORS.accent,
            color: '#FFFFFF',
        },
        secondary: {
            backgroundColor: LANDING_COLORS.surface,
            color: LANDING_COLORS.textPrimary,
            borderColor: LANDING_COLORS.border,
            borderWidth: '1px',
        },
        ghost: {
            backgroundColor: 'transparent',
            color: LANDING_COLORS.textPrimary,
        },
    };

    const MotionComponent = motion.create(Component as any);

    return (
        <MotionComponent
            ref={elementRef as any}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
            style={{
                x: springX,
                y: springY,
                ...variantStyles[variant],
            }}
            whileTap={{ scale: 0.96 }}
            className={cn(
                'relative inline-flex items-center justify-center rounded-xl',
                'transition-all duration-200 overflow-hidden',
                'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
                sizeClasses[size],
                variantClasses[variant],
                className
            )}
            {...(props as any)}
        >
            {isHovered && (
                <motion.div
                    layoutId="glow"
                    className="absolute inset-0 bg-white/10 blur-xl pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
            )}

            <span className="relative z-10 flex items-center gap-2">
                {children}
            </span>
        </MotionComponent>
    );
}
