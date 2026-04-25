/**
 * DriveFilterEmpty — empty state for non-default Drive filters.
 *
 * Per Phase 3 plan (P7 confident emptiness): Instrument Serif headline
 * + a single quiet body line. Variants are caller-provided so each filter
 * keeps its own voice (Favorites / Trash / Shared).
 */

import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

interface DriveFilterEmptyProps {
    icon: LucideIcon;
    title: string;
    body: string;
    className?: string;
}

export function DriveFilterEmpty({ icon: Icon, title, body, className }: DriveFilterEmptyProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
                'flex flex-col items-center justify-center text-center px-6 py-20 gap-4',
                className,
            )}
        >
            <div
                className="p-4 rounded-full bg-[var(--theme-primary)]/10"
                aria-hidden="true"
            >
                <Icon className="h-7 w-7 text-[var(--theme-primary)]" />
            </div>
            <h2 className="font-display font-normal tracking-tight text-foreground text-[28px] leading-[1.1]">
                {title}
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
        </motion.div>
    );
}
