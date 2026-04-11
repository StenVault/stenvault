/**
 * MagneticButton Component
 * Professional button with subtle hover effects (glow, scale).
 */
import { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '@/lib/constants/themeColors';

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

    const sizeClasses = {
        sm: 'px-4 py-2 text-sm gap-1.5',
        md: 'px-6 py-3 text-base gap-2',
        lg: 'px-8 py-4 text-lg gap-2.5',
    };

    const variantClasses = {
        primary: 'text-white font-semibold shadow-lg hover:shadow-violet-500/25 hover:brightness-110',
        secondary: 'font-medium hover:brightness-110',
        ghost: 'font-medium border border-slate-600/40 hover:border-slate-500/60 hover:text-white hover:bg-white/5',
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
            style={variantStyles[variant]}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
                'relative inline-flex items-center justify-center rounded-xl',
                'transition-all duration-200',
                'focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
                sizeClasses[size],
                variantClasses[variant],
                className
            )}
            {...(props as any)}
        >
            <span className="relative z-10 flex items-center gap-2">
                {children}
            </span>
        </MotionComponent>
    );
}
