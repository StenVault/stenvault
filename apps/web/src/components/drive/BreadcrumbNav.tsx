/**
 * ═══════════════════════════════════════════════════════════════
 * BREADCRUMB NAVIGATION COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * Shows current folder path with navigation.
 * Allows quick navigation to parent folders.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';
import { ChevronRight, Home, Folder } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { Button } from '@stenvault/shared/ui/button';

interface BreadcrumbItem {
    id: number | null;
    name: string;
}

interface BreadcrumbNavProps {
    items: BreadcrumbItem[];
    onNavigate: (folderId: number | null) => void;
    className?: string;
}

export function BreadcrumbNav({
    items,
    onNavigate,
    className,
}: BreadcrumbNavProps) {
    const fullPath: BreadcrumbItem[] = [
        { id: null, name: 'My Drive' },
        ...items,
    ];

    return (
        <nav
            className={cn('flex items-center gap-1 overflow-x-auto scrollbar-hide', className)}
            aria-label="Breadcrumb"
        >
            {fullPath.map((item, index) => {
                const isLast = index === fullPath.length - 1;
                const isRoot = item.id === null;

                return (
                    <motion.div
                        key={item.id ?? 'root'}
                        className="flex items-center gap-1"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.2 }}
                    >
                        {index > 0 && (
                            <ChevronRight className="h-4 w-4 text-foreground-muted flex-shrink-0" />
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'h-8 px-2 flex items-center gap-1.5 flex-shrink-0',
                                isLast && 'text-foreground font-medium pointer-events-none',
                                !isLast && 'text-foreground-muted hover:text-foreground'
                            )}
                            onClick={() => !isLast && onNavigate(item.id)}
                            disabled={isLast}
                            aria-current={isLast ? "page" : undefined}
                        >
                            {isRoot ? (
                                <Home className="h-4 w-4" />
                            ) : (
                                <Folder className="h-4 w-4" />
                            )}
                            <span className="truncate max-w-[100px] md:max-w-[150px]">
                                {item.name}
                            </span>
                        </Button>
                    </motion.div>
                );
            })}
        </nav>
    );
}

// Simplified version for mobile
export function BreadcrumbNavMobile({
    items,
    onNavigate,
    className,
}: BreadcrumbNavProps) {
    const fullPath: BreadcrumbItem[] = [
        { id: null, name: 'My Drive' },
        ...items,
    ];

    // On mobile, show only parent and current
    const displayItems = fullPath.length > 2
        ? [fullPath[0]!, { id: -1, name: '...' }, fullPath[fullPath.length - 1]!]
        : fullPath;

    return (
        <nav
            className={cn('flex items-center gap-1', className)}
            aria-label="Breadcrumb"
        >
            {displayItems.map((item, index) => {
                const isLast = index === displayItems.length - 1;
                const isEllipsis = item.name === '...';
                const isRoot = item.id === null;

                return (
                    <div key={item.id ?? 'root'} className="flex items-center gap-1">
                        {index > 0 && (
                            <ChevronRight className="h-3 w-3 text-foreground-muted" />
                        )}

                        {isEllipsis ? (
                            <span className="text-foreground-muted text-sm px-1">...</span>
                        ) : (
                            <button
                                className={cn(
                                    'text-sm px-1.5 py-0.5 rounded flex items-center gap-1',
                                    isLast && 'text-foreground font-medium',
                                    !isLast && 'text-foreground-muted'
                                )}
                                onClick={() => !isLast && onNavigate(item.id)}
                                disabled={isLast}
                                aria-current={isLast ? "page" : undefined}
                            >
                                {isRoot && <Home className="h-3 w-3" />}
                                <span className="truncate max-w-[80px]">{item.name}</span>
                            </button>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
