/**
 * Lock/unlock icon for the header — gives users a quick read on whether
 * the vault is currently encrypted.
 */

import { Lock, Unlock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMasterKey } from '@/hooks/useMasterKey';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VaultStatusIndicatorProps {
    /** Whether to show the label */
    showLabel?: boolean;
    /** Additional CSS classes */
    className?: string;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Callback when clicked - can be used to open unlock modal */
    onClick?: () => void;
}

export function VaultStatusIndicator({
    showLabel = false,
    className,
    size = 'md',
    onClick,
}: VaultStatusIndicatorProps) {
    const { isUnlocked, isLoading, isConfigured } = useMasterKey();

    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-5 w-5',
        lg: 'h-6 w-6',
    };

    const badgeClasses = {
        sm: 'text-xs px-1.5 py-0.5',
        md: 'text-xs px-2 py-1',
        lg: 'text-sm px-2.5 py-1',
    };

    // If loading, show spinner
    if (isLoading) {
        return (
            <div className={cn('flex items-center gap-1.5', className)}>
                <Loader2 className={cn(sizeClasses[size], 'animate-spin text-muted-foreground')} />
                {showLabel && <span className="text-xs text-muted-foreground">Loading...</span>}
            </div>
        );
    }

    // If not configured, don't show anything (or show setup prompt)
    if (!isConfigured) {
        return null;
    }

    const IconComponent = isUnlocked ? Unlock : Lock;
    const statusText = isUnlocked ? 'Vault Unlocked' : 'Vault Locked';
    const statusColor = isUnlocked ? 'text-green-500' : 'text-amber-500';
    const bgColor = isUnlocked ? 'bg-green-500/10' : 'bg-amber-500/10';

    const content = (
        <button
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                'flex items-center gap-1.5 rounded-full transition-all',
                bgColor,
                badgeClasses[size],
                onClick && 'hover:opacity-80 cursor-pointer',
                !onClick && 'cursor-default',
                className
            )}
        >
            <IconComponent className={cn(sizeClasses[size], statusColor)} />
            {showLabel && (
                <span className={cn('font-medium', statusColor)}>
                    {isUnlocked ? 'Unlocked' : 'Locked'}
                </span>
            )}
        </button>
    );

    // Wrap with tooltip if no label
    if (!showLabel) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        {content}
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{statusText}</p>
                        {onClick && (
                            <p className="text-xs text-muted-foreground">
                                {isUnlocked ? 'Click to lock' : 'Click to unlock'}
                            </p>
                        )}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return content;
}
