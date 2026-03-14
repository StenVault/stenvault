/**
 * Signaling Status Component
 * 
 * Displays the current signaling channel status (Backend/Trystero).
 * Shows latency and health for each channel.
 */
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Server, Zap, Wifi, WifiOff, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SignalingChannel, SignalingStats } from "@/hooks/p2p";

interface SignalingStatusProps {
    stats: SignalingStats;
    className?: string;
}

/**
 * Compact signaling status indicator
 */
export function SignalingStatus({ stats, className }: SignalingStatusProps) {
    const { activeChannel, backendResponsive, trysteroResponsive, backendLatency, trysteroLatency } = stats;

    const getChannelIcon = () => {
        switch (activeChannel) {
            case "backend":
                return <Server className="h-3 w-3" />;
            case "trystero":
                return <Zap className="h-3 w-3" />;
            case "both":
                return <Activity className="h-3 w-3" />;
            default:
                return <WifiOff className="h-3 w-3" />;
        }
    };

    const getChannelColor = () => {
        if (activeChannel === "none") return "bg-gray-500/10 text-gray-500 border-gray-500/20";
        if (backendResponsive && trysteroResponsive) return "bg-green-500/10 text-green-500 border-green-500/20";
        if (backendResponsive || trysteroResponsive) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    };

    const getChannelLabel = () => {
        switch (activeChannel) {
            case "backend":
                return "Backend";
            case "trystero":
                return "P2P Mesh";
            case "both":
                return "Hybrid";
            default:
                return "Disconnected";
        }
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge
                        variant="outline"
                        className={cn(
                            "gap-1 cursor-help transition-colors",
                            getChannelColor(),
                            className
                        )}
                    >
                        {getChannelIcon()}
                        <span className="text-xs">{getChannelLabel()}</span>
                    </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="w-64 p-3">
                    <div className="space-y-2">
                        <p className="font-medium text-sm">Signaling Status</p>

                        {/* Backend Status */}
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <Server className="h-3 w-3" />
                                <span>Backend</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {backendLatency !== null && (
                                    <span className="text-muted-foreground flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        {backendLatency}ms
                                    </span>
                                )}
                                <span className={backendResponsive ? "text-green-500" : "text-red-500"}>
                                    {backendResponsive ? "●" : "○"}
                                </span>
                            </div>
                        </div>

                        {/* Trystero Status */}
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <Zap className="h-3 w-3" />
                                <span>P2P Mesh (Trystero)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {trysteroLatency !== null && (
                                    <span className="text-muted-foreground flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        {trysteroLatency}ms
                                    </span>
                                )}
                                <span className={trysteroResponsive ? "text-green-500" : "text-red-500"}>
                                    {trysteroResponsive ? "●" : "○"}
                                </span>
                            </div>
                        </div>

                        {/* Signals Stats */}
                        <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                            <div className="flex justify-between">
                                <span>Signals Sent</span>
                                <span>{stats.signalsSentBackend + stats.signalsSentTrystero}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Signals Received</span>
                                <span>{stats.signalsReceived}</span>
                            </div>
                        </div>

                        {/* Explanation */}
                        <p className="text-xs text-muted-foreground pt-1">
                            {activeChannel === "backend" && "Using server-based signaling (faster in most cases)."}
                            {activeChannel === "trystero" && "Using P2P mesh signaling (works without server)."}
                            {activeChannel === "both" && "Using both channels for reliability."}
                            {activeChannel === "none" && "Signaling not connected."}
                        </p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

/**
 * Full signaling status card (for debugging/admin)
 */
export function SignalingStatusCard({ stats }: SignalingStatusProps) {
    return (
        <div className="p-4 rounded-lg bg-card/50 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-purple-500" />
                    Signaling Channels
                </h4>
                <SignalingStatus stats={stats} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Backend Channel */}
                <div className={cn(
                    "p-3 rounded-md border transition-colors",
                    stats.backendResponsive
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-gray-500/5 border-gray-500/20"
                )}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Server className="h-4 w-4" />
                        Backend
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                            <span>Status</span>
                            <span className={stats.backendResponsive ? "text-green-500" : "text-red-500"}>
                                {stats.backendResponsive ? "Connected" : "Disconnected"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Latency</span>
                            <span>{stats.backendLatency ?? "—"}ms</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Signals Sent</span>
                            <span>{stats.signalsSentBackend}</span>
                        </div>
                    </div>
                </div>

                {/* Trystero Channel */}
                <div className={cn(
                    "p-3 rounded-md border transition-colors",
                    stats.trysteroResponsive
                        ? "bg-purple-500/5 border-purple-500/20"
                        : "bg-gray-500/5 border-gray-500/20"
                )}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Zap className="h-4 w-4" />
                        P2P Mesh
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                            <span>Status</span>
                            <span className={stats.trysteroResponsive ? "text-purple-500" : "text-red-500"}>
                                {stats.trysteroResponsive ? "Connected" : "Disconnected"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Latency</span>
                            <span>{stats.trysteroLatency ?? "—"}ms</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Signals Sent</span>
                            <span>{stats.signalsSentTrystero}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
