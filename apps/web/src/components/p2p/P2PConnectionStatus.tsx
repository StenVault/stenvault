/**
 * P2P Connection Status Component
 * Displays the current connection state with visual indicators.
 */
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2, Check, X, Clock, Zap, Key, Shield } from "lucide-react";
import type { P2PConnectionState } from "./types";

interface P2PConnectionStatusProps {
    status: P2PConnectionState;
    peerName?: string;
    peerFingerprint?: string;
    className?: string;
}

const statusConfig: Record<P2PConnectionState, {
    icon: typeof Wifi;
    label: string;
    color: string;
    bgColor: string;
    animate?: boolean;
}> = {
    idle: {
        icon: Wifi,
        label: "Ready",
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
    },
    creating: {
        icon: Loader2,
        label: "Creating session...",
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        animate: true,
    },
    waiting: {
        icon: Clock,
        label: "Waiting for recipient...",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        animate: true,
    },
    key_exchange: {
        icon: Key,
        label: "Exchanging encryption keys...",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        animate: true,
    },
    connecting: {
        icon: Loader2,
        label: "Connecting...",
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        animate: true,
    },
    connected: {
        icon: Zap,
        label: "Connected",
        color: "text-green-500",
        bgColor: "bg-green-500/10",
    },
    manifest: {
        icon: Loader2,
        label: "Receiving file info...",
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        animate: true,
    },
    transferring: {
        icon: Wifi,
        label: "Transferring...",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        animate: true,
    },
    verifying: {
        icon: Loader2,
        label: "Verifying file integrity...",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        animate: true,
    },
    completed: {
        icon: Check,
        label: "Completed",
        color: "text-green-500",
        bgColor: "bg-green-500/10",
    },
    failed: {
        icon: X,
        label: "Failed",
        color: "text-red-500",
        bgColor: "bg-red-500/10",
    },
    disconnected: {
        icon: WifiOff,
        label: "Disconnected",
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
    },
};

export function P2PConnectionStatus({ status, peerName, peerFingerprint, className }: P2PConnectionStatusProps) {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
            config.bgColor,
            className
        )}>
            <div className={cn("relative", config.color)}>
                <Icon className={cn(
                    "h-5 w-5",
                    config.animate && "animate-spin"
                )} />
                {status === "connected" && (
                    <span className="absolute -top-0.5 -right-0.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                    </span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", config.color)}>
                    {config.label}
                </p>
                {peerName && status === "connected" && (
                    <p className="text-xs text-muted-foreground truncate">
                        Connected to {peerName}
                    </p>
                )}
                {peerFingerprint && status === "connected" && (
                    <div className="flex items-center gap-1 mt-0.5">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground font-mono truncate">
                            Verify: {peerFingerprint}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
