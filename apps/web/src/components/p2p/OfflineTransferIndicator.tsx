/**
 * Offline Transfer Indicator
 * 
 * Shows pending offline transfers for the current user.
 * Displayed in the navigation or as a notification.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Cloud,
    CloudDownload,
    Clock,
    FileDown,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { formatBytes } from "@stenvault/shared";

interface OfflineTransferIndicatorProps {
    className?: string;
}

export function OfflineTransferIndicator({ className }: OfflineTransferIndicatorProps) {
    const [open, setOpen] = useState(false);

    const { data, isLoading, error } = trpc.p2p.getPendingTransfers.useQuery(
        undefined,
        {
            refetchInterval: 30000, // Refresh every 30 seconds
            enabled: true,
        }
    );

    const pendingCount = data?.count ?? 0;

    // Don't show if no pending transfers
    if (!isLoading && pendingCount === 0) {
        return null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("relative", className)}
                >
                    <CloudDownload className="h-5 w-5" />
                    {pendingCount > 0 && (
                        <Badge
                            className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-purple-500"
                        >
                            {pendingCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                        <Cloud className="h-5 w-5 text-purple-500" />
                        <div>
                            <h4 className="text-sm font-semibold">Pending Transfers</h4>
                            <p className="text-xs text-muted-foreground">
                                Files waiting for you to download
                            </p>
                        </div>
                    </div>

                    {/* Loading state */}
                    {isLoading && (
                        <div className="text-sm text-muted-foreground text-center py-4">
                            Loading...
                        </div>
                    )}

                    {/* Error state */}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-500">
                            <AlertCircle className="h-4 w-4" />
                            Failed to load transfers
                        </div>
                    )}

                    {/* Transfer list */}
                    {data?.transfers && data.transfers.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {data.transfers.map((transfer) => (
                                <a
                                    key={transfer.sessionId}
                                    href={`/p2p/offline/${transfer.sessionId}`}
                                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                    onClick={() => setOpen(false)}
                                >
                                    <div className="p-2 rounded-lg bg-purple-500/10">
                                        <FileDown className="h-4 w-4 text-purple-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {transfer.fileName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            From {transfer.senderName || transfer.senderEmail}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                            <span>{formatBytes(transfer.fileSize || 0)}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                Expires {formatDistanceToNow(new Date(transfer.expiresAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && pendingCount === 0 && (
                        <div className="text-center py-4">
                            <Cloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                                No pending transfers
                            </p>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
