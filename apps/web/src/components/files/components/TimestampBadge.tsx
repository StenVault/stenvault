/**
 * TimestampBadge Component
 *
 * Displays OpenTimestamps blockchain proof status for a file.
 * Shows different states: pending, confirmed, failed.
 */

import { Clock, Check, AlertCircle, Loader2 } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@stenvault/shared/ui/tooltip";
import type { TimestampStatus } from "@stenvault/shared";
import { getTimestampStatusLabel } from "@stenvault/shared";
import { cn } from "@stenvault/shared/utils";

interface TimestampBadgeProps {
    status: TimestampStatus | null;
    /** Show as compact icon only */
    compact?: boolean;
    /** Additional class names */
    className?: string;
    /** Click handler for showing details */
    onClick?: () => void;
}

const statusConfig: Record<
    TimestampStatus,
    { icon: typeof Check; color: string; bgColor: string; description: string }
> = {
    pending: {
        icon: Clock,
        color: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-100 dark:bg-amber-900/30",
        description: "Awaiting Bitcoin blockchain confirmation (1-3 hours)",
    },
    confirming: {
        icon: Loader2,
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        description: "Being confirmed on Bitcoin blockchain",
    },
    confirmed: {
        icon: Check,
        color: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-100 dark:bg-green-900/30",
        description: "Verified on Bitcoin blockchain",
    },
    failed: {
        icon: AlertCircle,
        color: "text-red-600 dark:text-red-400",
        bgColor: "bg-red-100 dark:bg-red-900/30",
        description: "Timestamp submission failed",
    },
    skipped: {
        icon: Clock,
        color: "text-gray-500 dark:text-gray-400",
        bgColor: "bg-gray-100 dark:bg-gray-800",
        description: "Timestamp was skipped",
    },
};

export function TimestampBadge({
    status,
    compact = false,
    className,
    onClick,
}: TimestampBadgeProps) {
    if (!status) return null;

    const config = statusConfig[status];
    const Icon = config.icon;
    const isAnimated = status === "confirming";

    const badge = (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1 rounded-full transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                onClick && "cursor-pointer hover:opacity-80",
                !onClick && "cursor-default",
                compact ? "p-1" : "px-2 py-0.5",
                config.bgColor,
                className
            )}
            type="button"
            aria-label={`Timestamp status: ${getTimestampStatusLabel(status)}`}
        >
            <Icon
                className={cn(
                    "h-3 w-3",
                    config.color,
                    isAnimated && "animate-spin"
                )}
            />
            {!compact && (
                <span className={cn("text-xs font-medium", config.color)}>
                    {getTimestampStatusLabel(status)}
                </span>
            )}
        </button>
    );

    return (
        <TooltipProvider>
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    <div className="flex items-start gap-2">
                        <Icon className={cn("h-4 w-4 mt-0.5", config.color)} />
                        <div>
                            <p className="font-medium">
                                {getTimestampStatusLabel(status)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {config.description}
                            </p>
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

/**
 * Compact Bitcoin icon badge for file cards
 */
export function TimestampIcon({
    status,
    className,
    onClick,
}: {
    status: TimestampStatus | null;
    className?: string;
    onClick?: () => void;
}) {
    if (!status) return null;

    const config = statusConfig[status];
    const Icon = config.icon;
    const isAnimated = status === "confirming";

    return (
        <TooltipProvider>
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                    <button
                        onClick={onClick}
                        className={cn(
                            "flex items-center justify-center w-5 h-5 rounded-full",
                            "transition-colors focus:outline-none",
                            onClick && "cursor-pointer hover:opacity-80",
                            config.bgColor,
                            className
                        )}
                        type="button"
                        aria-label={`Timestamp: ${getTimestampStatusLabel(status)}`}
                    >
                        <Icon
                            className={cn(
                                "h-3 w-3",
                                config.color,
                                isAnimated && "animate-spin"
                            )}
                        />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                    <p className="text-xs">{config.description}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export default TimestampBadge;
