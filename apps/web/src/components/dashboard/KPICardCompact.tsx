/**
 * ═══════════════════════════════════════════════════════════════
 * KPI CARD COMPACT COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Compact key performance indicator cards for Dashboard.
 * Shows value, label, and optional trend indicator.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface KPICardCompactProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: LucideIcon;
    iconColor?: string;
    iconBgColor?: string;
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
    iconColor = 'text-primary',
    iconBgColor = 'bg-primary/10',
    trend,
    className,
    isLoading = false,
}: KPICardCompactProps) {
    if (isLoading) {
        return (
            <Card className={cn('animate-pulse', className)}>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                            <div className="h-4 w-20 bg-secondary rounded" />
                            <div className="h-7 w-16 bg-secondary rounded" />
                            <div className="h-3 w-24 bg-secondary rounded" />
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-secondary" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full"
        >
            <Card className={cn('hover:border-border-strong transition-colors h-full', className)}>
                <CardContent className="p-4">
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
                                        trend.value > 0 ? 'text-emerald-400' :
                                            trend.value < 0 ? 'text-rose-400' : 'text-foreground-muted'
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

                        <div className={cn('p-2.5 rounded-lg', iconBgColor)}>
                            <Icon className={cn('h-5 w-5', iconColor)} />
                        </div>
                    </div>
                </CardContent>
            </Card>
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
