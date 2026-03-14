/**
 * P2P Transfer Progress Component
 * Displays file transfer progress with speed and ETA.
 */
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Check, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, formatSpeed } from "@cloudvault/shared";
import type { P2PTransferState } from "./types";

interface P2PTransferProgressProps {
    state: P2PTransferState;
    fileName?: string;
    onCancel?: () => void;
    onRetry?: () => void;
    className?: string;
}

function formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return "--:--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

export function P2PTransferProgress({
    state,
    fileName,
    onCancel,
    onRetry,
    className
}: P2PTransferProgressProps) {
    const isActive = state.status === "transferring" || state.status === "verifying";
    const isCompleted = state.status === "completed";
    const isFailed = state.status === "failed";
    const isVerifying = state.status === "verifying";
    const isChunked = state.mode === "chunked";
    const hasFailedChunks = state.failedChunks && state.failedChunks.length > 0;

    return (
        <div className={cn(
            "rounded-lg border p-4 space-y-3",
            isCompleted && "border-green-500/30 bg-green-500/5",
            isFailed && "border-red-500/30 bg-red-500/5",
            className
        )}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    {isCompleted ? (
                        <Check className="h-5 w-5 text-green-500 shrink-0" />
                    ) : isFailed ? (
                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                    ) : null}
                    <span className="text-sm font-medium truncate">
                        {fileName || "File transfer"}
                    </span>
                    {isChunked && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Chunked
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {hasFailedChunks && onRetry && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={onRetry}
                            title="Retry failed chunks"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    )}
                    {onCancel && isActive && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={onCancel}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
                <Progress
                    value={state.progress}
                    className={cn(
                        "h-2",
                        isCompleted && "[&>div]:bg-green-500",
                        isFailed && "[&>div]:bg-red-500",
                        isVerifying && "[&>div]:bg-amber-500"
                    )}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{Math.round(state.progress)}%</span>
                    <span>
                        {formatBytes(state.bytesTransferred)} / {formatBytes(state.totalBytes)}
                    </span>
                </div>
            </div>

            {/* Chunk info (only for chunked transfers) */}
            {isChunked && state.totalChunks && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                        Chunks: {state.completedChunks || 0}/{state.totalChunks}
                    </span>
                    {hasFailedChunks && (
                        <span className="text-amber-500">
                            {state.failedChunks?.length} failed
                        </span>
                    )}
                </div>
            )}

            {/* Stats */}
            {isActive && !isVerifying && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                        <span>Speed: {formatSpeed(state.speed)}</span>
                        <span>ETA: {formatTime(state.estimatedTimeRemaining)}</span>
                    </div>
                </div>
            )}

            {/* Status messages */}
            {isVerifying && (
                <p className="text-xs text-amber-600">
                    Verifying file integrity...
                </p>
            )}
            {isCompleted && (
                <p className="text-xs text-green-600">
                    Transfer completed successfully!
                </p>
            )}
            {isFailed && state.error && (
                <p className="text-xs text-red-600">
                    {state.error}
                </p>
            )}
        </div>
    );
}

