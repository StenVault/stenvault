/**
 * Status Badge Component
 * Displays session status with appropriate styling and icon
 */
import { Badge } from "@/components/ui/badge";
import {
    Clock,
    CheckCircle2,
    XCircle,
    ArrowRightLeft,
    Wifi,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "../types";

interface StatusBadgeProps {
    status: SessionStatus;
    size?: "sm" | "default";
}

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
    const config: Record<SessionStatus, { label: string; className: string; icon: React.ReactNode }> = {
        waiting: {
            label: "Waiting",
            className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
            icon: <Loader2 className="h-3 w-3 animate-spin" />,
        },
        connecting: {
            label: "Connecting",
            className: "bg-purple-500/10 text-purple-600 border-purple-500/20",
            icon: <Wifi className="h-3 w-3" />,
        },
        transferring: {
            label: "Transferring",
            className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
            icon: <ArrowRightLeft className="h-3 w-3" />,
        },
        completed: {
            label: "Completed",
            className: "bg-green-500/10 text-green-600 border-green-500/20",
            icon: <CheckCircle2 className="h-3 w-3" />,
        },
        failed: {
            label: "Failed",
            className: "bg-red-500/10 text-red-600 border-red-500/20",
            icon: <XCircle className="h-3 w-3" />,
        },
        expired: {
            label: "Expired",
            className: "bg-gray-500/10 text-gray-600 border-gray-500/20",
            icon: <Clock className="h-3 w-3" />,
        },
        cancelled: {
            label: "Cancelled",
            className: "bg-gray-500/10 text-gray-600 border-gray-500/20",
            icon: <XCircle className="h-3 w-3" />,
        },
    };

    const { label, className, icon } = config[status];

    return (
        <Badge
            variant="secondary"
            className={cn(
                className,
                size === "sm" && "text-xs px-2 py-0.5"
            )}
        >
            {icon}
            <span className="ml-1">{label}</span>
        </Badge>
    );
}
