/**
 * Compact KPI card for the Home dashboard.
 *
 * Default tone is gold — the brand neutral. Pass `tone` to override for
 * state-based readouts (Storage uses sage/amber/burgundy depending on
 * fill). Avoid passing tone when the value is just informational; the
 * homepage stays calmer when only one card is colour-coded.
 */

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { AuroraCard, AuroraCardContent } from '@stenvault/shared/ui/aurora-card';

export type KPITone = 'primary' | 'success' | 'warning' | 'error';

const TONE_TOKENS: Record<KPITone, { fg: string; bg: string }> = {
    primary: {
        fg: 'text-[var(--theme-primary)]',
        bg: 'bg-[var(--theme-primary)]/10',
    },
    success: {
        fg: 'text-[var(--theme-success)]',
        bg: 'bg-[var(--theme-success)]/10',
    },
    warning: {
        fg: 'text-[var(--theme-warning)]',
        bg: 'bg-[var(--theme-warning)]/10',
    },
    error: {
        fg: 'text-[var(--theme-error)]',
        bg: 'bg-[var(--theme-error)]/10',
    },
};

interface KPICardCompactProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: LucideIcon;
    tone?: KPITone;
    trend?: {
        value: number;
        label?: string;
    };
    className?: string;
    isLoading?: boolean;
}

export function KPICardCompact({
    title,
    value,
    subtitle,
    icon: Icon,
    tone = 'primary',
    trend,
    className,
    isLoading = false,
}: KPICardCompactProps) {
    const toneTokens = TONE_TOKENS[tone];

    if (isLoading) {
        return (
            <AuroraCard variant="default" size="sm" className={cn('animate-pulse', className)}>
                <AuroraCardContent>
                    <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                            <div className="h-4 w-20 bg-secondary rounded" />
                            <div className="h-7 w-16 bg-secondary rounded" />
                            <div className="h-3 w-24 bg-secondary rounded" />
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-secondary" />
                    </div>
                </AuroraCardContent>
            </AuroraCard>
        );
    }

    const trendColor =
        !trend || trend.value === 0
            ? 'text-[var(--theme-fg-muted)]'
            : trend.value > 0
                ? 'text-[var(--theme-success)]'
                : 'text-[var(--theme-error)]';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full"
        >
            <AuroraCard
                variant="default"
                size="sm"
                className={cn('hover:border-border-strong transition-colors h-full', className)}
            >
                <AuroraCardContent>
                    <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1 min-w-0">
                            <p className="text-xs text-foreground-muted">{title}</p>
                            <p className="text-2xl font-bold text-foreground truncate">
                                {value}
                            </p>

                            <div className="flex items-center gap-2">
                                {trend && (
                                    <span className={cn(
                                        'flex items-center gap-0.5 text-xs font-medium',
                                        trendColor,
                                    )}>
                                        {trend.value > 0 ? (
                                            <TrendingUp className="h-3 w-3" />
                                        ) : trend.value < 0 ? (
                                            <TrendingDown className="h-3 w-3" />
                                        ) : (
                                            <Minus className="h-3 w-3" />
                                        )}
                                        {Math.abs(trend.value).toFixed(0)}%
                                        {trend.label && (
                                            <span className="text-foreground-muted font-normal ml-1">
                                                {trend.label}
                                            </span>
                                        )}
                                    </span>
                                )}
                                {subtitle && !trend && (
                                    <span className="text-xs text-foreground-muted">
                                        {subtitle}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className={cn('p-2.5 rounded-lg', toneTokens.bg)}>
                            <Icon className={cn('h-5 w-5', toneTokens.fg)} />
                        </div>
                    </div>
                </AuroraCardContent>
            </AuroraCard>
        </motion.div>
    );
}

/**
 * Grid container for KPI cards
 */
interface KPIGridProps {
    children: React.ReactNode;
    className?: string;
}

export function KPIGrid({ children, className }: KPIGridProps) {
    return (
        <div className={cn(
            'grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4',
            className
        )}>
            {children}
        </div>
    );
}
