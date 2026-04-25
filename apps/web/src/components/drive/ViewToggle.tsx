/**
 * ═══════════════════════════════════════════════════════════════
 * VIEW TOGGLE COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Toggle between grid and list view for files.
 * Persists preference to localStorage.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';

export type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
    value: ViewMode;
    onChange: (mode: ViewMode) => void;
    className?: string;
}

export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
    return (
        <div
            className={cn(
                'flex items-center p-1 rounded-lg bg-secondary',
                className
            )}
        >
            <ViewToggleButton
                icon={LayoutGrid}
                isActive={value === 'grid'}
                onClick={() => onChange('grid')}
                label="Grid"
            />
            <ViewToggleButton
                icon={List}
                isActive={value === 'list'}
                onClick={() => onChange('list')}
                label="Lista"
            />
        </div>
    );
}

interface ViewToggleButtonProps {
    icon: typeof LayoutGrid;
    isActive: boolean;
    onClick: () => void;
    label: string;
}

function ViewToggleButton({
    icon: Icon,
    isActive,
    onClick,
    label,
}: ViewToggleButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'relative flex items-center justify-center p-2 rounded-md transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isActive ? 'text-foreground' : 'text-foreground-muted hover:text-foreground'
            )}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
        >
            {isActive && (
                <motion.div
                    layoutId="viewToggleIndicator"
                    className="absolute inset-0 bg-card rounded-md shadow-sm border border-border"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
            )}
            <Icon className="relative h-4 w-4" />
        </button>
    );
}

// Hook for persisting view mode
const VIEW_MODE_KEY = 'drive-view-mode';

export function getStoredViewMode(): ViewMode {
    if (typeof window === 'undefined') return 'list';
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'list';
}

export function setStoredViewMode(mode: ViewMode): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(VIEW_MODE_KEY, mode);
}
