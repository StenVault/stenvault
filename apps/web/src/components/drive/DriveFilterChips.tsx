/**
 * DriveFilterChips
 *
 * Horizontal chip row that replaces the Favorites / Shared / Trash sidebar
 * routes. Chips are NOT visually co-equal — weight differentiation
 * (primary / secondary) prevents muscle-memory mistakes like emptying Trash
 * while meaning to navigate to Favorites.
 *
 *   All        primary   (filled gold on active, border-strong inactive)
 *   Favorites  primary   (same)
 *   Shared     secondary (outlined, gold text on active, muted text inactive)
 *   Trash      secondary (same)
 *
 * Controlled. Caller owns URL sync (`/drive?filter=...`) and breadcrumb
 * updates.
 */

import { Star, Share2, Trash2, Files, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

export type DriveFilter = 'all' | 'favorites' | 'shared' | 'trash';

type ChipWeight = 'primary' | 'secondary';

interface ChipDef {
    id: DriveFilter;
    label: string;
    icon: LucideIcon;
    weight: ChipWeight;
}

const CHIPS: ReadonlyArray<ChipDef> = [
    { id: 'all', label: 'All', icon: Files, weight: 'primary' },
    { id: 'favorites', label: 'Favorites', icon: Star, weight: 'primary' },
    { id: 'shared', label: 'Shared', icon: Share2, weight: 'secondary' },
    { id: 'trash', label: 'Trash', icon: Trash2, weight: 'secondary' },
];

interface DriveFilterChipsProps {
    value: DriveFilter;
    onChange: (filter: DriveFilter) => void;
    className?: string;
}

export function DriveFilterChips({ value, onChange, className }: DriveFilterChipsProps) {
    return (
        <div
            role="tablist"
            aria-label="File filter"
            className={cn('flex flex-wrap items-center gap-2', className)}
        >
            {CHIPS.map((chip) => (
                <FilterChip
                    key={chip.id}
                    chip={chip}
                    active={value === chip.id}
                    onSelect={() => onChange(chip.id)}
                />
            ))}
        </div>
    );
}

interface FilterChipProps {
    chip: ChipDef;
    active: boolean;
    onSelect: () => void;
}

function FilterChip({ chip, active, onSelect }: FilterChipProps) {
    const Icon = chip.icon;
    const isPrimary = chip.weight === 'primary';

    return (
        <button
            role="tab"
            type="button"
            aria-selected={active}
            onClick={onSelect}
            className={cn(
                'relative inline-flex items-center gap-1.5',
                'h-9 px-3.5 rounded-full',
                'text-sm font-medium',
                'transition-colors duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary-a50)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                // Weight differentiation:
                isPrimary
                    ? active
                        // primary + active → filled gold
                        ? 'bg-[var(--theme-primary)] text-[var(--theme-fg-on-primary)] border border-[var(--theme-primary)]'
                        : 'bg-transparent text-foreground-secondary border border-[var(--theme-border-strong)] hover:text-foreground hover:border-[var(--theme-primary-a30)]'
                    : active
                        // secondary + active → outlined, gold text
                        ? 'bg-transparent text-[var(--theme-primary)] border border-[var(--theme-primary-a30)]'
                        : 'bg-transparent text-foreground-muted border border-[var(--theme-border-strong)] hover:text-foreground-secondary',
            )}
        >
            {active && isPrimary && (
                <motion.span
                    layoutId="drive-filter-primary-pill"
                    className="absolute inset-0 rounded-full pointer-events-none"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    aria-hidden="true"
                />
            )}
            <Icon className="relative h-3.5 w-3.5" />
            <span className="relative">{chip.label}</span>
        </button>
    );
}
