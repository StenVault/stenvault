/**
 * ═══════════════════════════════════════════════════════════════
 * AURORA CARD COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * A premium card component with glassmorphism, subtle gradients,
 * and micro-animations. Part of the Aurora design system.
 *
 * VARIANTS:
 * - default: Standard elevated card
 * - glass: Glassmorphism with blur
 * - gradient: Subtle gradient overlay
 * - interactive: Hover/click animations
 * - glow: Glowing border effect
 *
 * ═══════════════════════════════════════════════════════════════
 */

import * as React from 'react';
import { motion, MotionProps } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const auroraCardVariants = cva(
    // Base styles
    [
        'relative rounded-xl border transition-all duration-200',
        'overflow-hidden',
    ],
    {
        variants: {
            variant: {
                default: [
                    'bg-card',
                    'aurora-border-inner',
                    'shadow-sm',
                ],
                glass: [
                    'bg-card/60 backdrop-blur-xl',
                    'aurora-border-inner border-white/[0.08]',
                    'shadow-lg',
                ],
                gradient: [
                    'bg-gradient-to-br from-card via-card to-card',
                    'border-border',
                    'before:absolute before:inset-0 before:bg-gradient-to-br',
                    'before:from-primary/5 before:via-transparent before:to-accent/5',
                    'before:pointer-events-none',
                ],
                interactive: [
                    'bg-card',
                    'aurora-border-inner',
                    'aurora-ambient-glow',
                    'shadow-sm',
                    'hover:-translate-y-0.5',
                    'active:translate-y-0 active:shadow-sm',
                    'cursor-pointer',
                ],
                glow: [
                    'bg-card border-primary/20',
                    'aurora-border-inner',
                    'shadow-[0_0_20px_var(--theme-glow)]',
                    'hover:shadow-[0_0_40px_var(--theme-glow-strong)]',
                    'transition-shadow duration-500',
                ],
                outline: [
                    'bg-transparent border-border',
                    'hover:bg-card/50',
                ],
            },
            size: {
                sm: 'p-3',
                md: 'p-4',
                lg: 'p-6',
                xl: 'p-8',
            },
            animate: {
                true: '', // Will use motion.div
                false: '',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'md',
            animate: false,
        },
    }
);

interface AuroraCardProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof auroraCardVariants> {
    asChild?: boolean;
    motionProps?: MotionProps;
}

const AuroraCard = React.forwardRef<HTMLDivElement, AuroraCardProps>(
    ({ className, variant, size, animate, motionProps, children, ...props }, ref) => {
        const cardClasses = cn(auroraCardVariants({ variant, size, animate }), className);

        if (animate) {
            return (
                <motion.div
                    ref={ref}
                    className={cardClasses}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    {...motionProps}
                    {...(props as any)}
                >
                    {/* Gradient overlay for glass/gradient variants */}
                    {(variant === 'glass' || variant === 'gradient') && (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none" />
                    )}
                    {children}
                </motion.div>
            );
        }

        return (
            <div ref={ref} className={cardClasses} {...props}>
                {/* Gradient overlay for glass/gradient variants */}
                {(variant === 'glass' || variant === 'gradient') && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none" />
                )}
                {children}
            </div>
        );
    }
);

AuroraCard.displayName = 'AuroraCard';

/**
 * Card Header with title and optional actions
 */
interface AuroraCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

const AuroraCardHeader = React.forwardRef<HTMLDivElement, AuroraCardHeaderProps>(
    ({ className, title, description, icon, action, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn('flex items-start justify-between gap-4 mb-4', className)}
                {...props}
            >
                <div className="flex items-start gap-3 min-w-0">
                    {icon && (
                        <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10 text-primary">
                            {icon}
                        </div>
                    )}
                    {(title || description) && (
                        <div className="min-w-0">
                            {title && (
                                <h3 className="font-semibold text-foreground truncate">{title}</h3>
                            )}
                            {description && (
                                <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                            )}
                        </div>
                    )}
                    {children}
                </div>
                {action && <div className="flex-shrink-0">{action}</div>}
            </div>
        );
    }
);

AuroraCardHeader.displayName = 'AuroraCardHeader';

/**
 * Card Content wrapper
 */
const AuroraCardContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('relative', className)} {...props} />
));

AuroraCardContent.displayName = 'AuroraCardContent';

/**
 * Card Footer with optional divider
 */
interface AuroraCardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
    divider?: boolean;
}

const AuroraCardFooter = React.forwardRef<HTMLDivElement, AuroraCardFooterProps>(
    ({ className, divider = true, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'mt-4 pt-4',
                divider && 'border-t border-border',
                className
            )}
            {...props}
        />
    )
);

AuroraCardFooter.displayName = 'AuroraCardFooter';

export {
    AuroraCard,
    AuroraCardHeader,
    AuroraCardContent,
    AuroraCardFooter,
    auroraCardVariants,
};
