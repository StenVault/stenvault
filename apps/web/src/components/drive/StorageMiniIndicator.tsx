/**
 * ═══════════════════════════════════════════════════════════════
 * STORAGE MINI INDICATOR COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Minimal storage indicator for Drive page header.
 * Shows only percentage with color-coded status.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@stenvault/shared/ui/tooltip';
import { formatBytes as formatFileSize } from '@/utils/formatters';

interface StorageMiniIndicatorProps {
    storageUsed: number;
    storageQuota: number;
    className?: string;
}

export function StorageMiniIndicator({
    storageUsed,
    storageQuota,
    className,
}: StorageMiniIndicatorProps) {
    const usedPercentage = storageQuota > 0
        ? Math.round((storageUsed / storageQuota) * 100)
        : 0;

    const isCritical = usedPercentage >= 90;
    const isWarning = usedPercentage >= 75;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-full',
                            'border cursor-default transition-colors',
                            isCritical && 'bg-rose-500/10 border-rose-500/30 text-rose-400',
                            isWarning && !isCritical && 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                            !isWarning && 'bg-secondary/50 border-border text-foreground-muted',
                            className
                        )}
                    >
                        <HardDrive className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">
                            {usedPercentage}%
                        </span>

                        {/* Mini progress bar */}
                        <div className="w-12 h-1 bg-secondary rounded-full overflow-hidden">
                            <motion.div
                                className={cn(
                                    'h-full rounded-full',
                                    isCritical ? 'bg-rose-500' :
                                        isWarning ? 'bg-amber-500' : 'bg-primary'
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${usedPercentage}%` }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            />
                        </div>
                    </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    <p className="text-xs">
                        {formatFileSize(storageUsed)} of {formatFileSize(storageQuota)}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
