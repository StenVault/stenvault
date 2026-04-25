/**
 * ═══════════════════════════════════════════════════════════════
 * STORAGE MINI WIDGET COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Compact storage indicator for Home page.
 * Shows storage usage in a minimal, non-intrusive way.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import { HardDrive, AlertTriangle } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { formatBytes as formatFileSize } from '@/utils/formatters';

interface StorageMiniWidgetProps {
    storageUsed: number;
    storageQuota: number;
    className?: string;
    isLoading?: boolean;
}

export function StorageMiniWidget({
    storageUsed,
    storageQuota,
    className,
    isLoading = false,
}: StorageMiniWidgetProps) {
    const { theme } = useTheme();
    const usedPercentage = storageQuota > 0
        ? Math.round((storageUsed / storageQuota) * 100)
        : 0;

    const remainingSpace = storageQuota - storageUsed;
    const isWarning = usedPercentage >= 75;
    const isCritical = usedPercentage >= 90;

    // Get colors based on status
    const getStatusColor = () => {
        if (isCritical) return theme.semantic.error;
        if (isWarning) return theme.semantic.warning;
        return theme.brand.primary;
    };

    if (isLoading) {
        return (
            <div className={cn('animate-pulse', className)}>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
                    <div className="w-8 h-8 rounded-lg bg-secondary-foreground/10" />
                    <div className="flex-1 space-y-2">
                        <div className="h-2 bg-secondary-foreground/10 rounded-full" />
                        <div className="h-3 w-20 bg-secondary-foreground/10 rounded" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
                'flex items-center gap-3 p-3 rounded-xl',
                'bg-secondary/50 border border-border/50',
                isCritical && 'border-rose-500/30 bg-rose-500/5',
                isWarning && !isCritical && 'border-amber-500/30 bg-amber-500/5',
                className
            )}
        >
            {/* Icon */}
            <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${getStatusColor()}15` }}
            >
                {isCritical ? (
                    <AlertTriangle className="h-4 w-4" style={{ color: getStatusColor() }} />
                ) : (
                    <HardDrive className="h-4 w-4" style={{ color: getStatusColor() }} />
                )}
            </div>

            {/* Progress and info */}
            <div className="flex-1 min-w-0">
                {/* Mini progress bar */}
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                    <motion.div
                        className="h-full rounded-full relative"
                        style={{
                            backgroundColor: getStatusColor(),
                            boxShadow: `0 0 10px ${getStatusColor()}80`
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${usedPercentage}%` }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    />
                </div>

                {/* Text info */}
                <div className="flex items-center justify-between text-xs">
                    <span
                        className="font-medium"
                        style={{
                            color: (isCritical || isWarning) ? getStatusColor() : undefined,
                            textShadow: (isCritical || isWarning) ? `0 0 10px ${getStatusColor()}60` : undefined
                        }}
                    >
                        {usedPercentage}% used
                    </span>
                    <span className="text-foreground-muted">
                        {formatFileSize(remainingSpace)} free
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

/**
 * Even more minimal version - just a thin bar
 */
export function StorageBarMini({
    storageUsed,
    storageQuota,
    className,
}: StorageMiniWidgetProps) {
    const usedPercentage = storageQuota > 0
        ? Math.round((storageUsed / storageQuota) * 100)
        : 0;

    const isCritical = usedPercentage >= 90;
    const isWarning = usedPercentage >= 75;

    return (
        <div className={cn('group cursor-help', className)}>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <motion.div
                    className={cn(
                        'h-full rounded-full',
                        isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-primary'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${usedPercentage}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
            </div>

            {/* Tooltip on hover */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover border border-border rounded-md text-xs whitespace-nowrap pointer-events-none z-50">
                {formatFileSize(storageUsed)} / {formatFileSize(storageQuota)}
            </div>
        </div>
    );
}
