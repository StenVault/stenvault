/**
 * Resumable Transfers Component
 * 
 * Displays list of interrupted P2P transfers that can be resumed from IndexedDB.
 * Shows progress, file info, and resume/delete actions.
 */
import { Badge } from "@stenvault/shared/ui/badge";
import { Button } from "@stenvault/shared/ui/button";
import { Progress } from "@stenvault/shared/ui/progress";
import { Skeleton } from "@stenvault/shared/ui/skeleton";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@stenvault/shared/ui/alert-dialog";
import { AnimatePresence, motion } from "@stenvault/shared/ui/animated";
import {
    RefreshCw,
    Play,
    Trash2,
    FileIcon,
    Clock,
    Shield,
    Zap,
    AlertCircle,
} from "lucide-react";
import { useResumableTransfers, formatBytes, formatRelativeTime } from "@/hooks/p2p";
import type { ResumableTransferInfo } from "@/components/p2p/types";

interface ResumableTransfersProps {
    /** Optional callback when a transfer is resumed */
    onResume?: (sessionId: string) => void;
}

/**
 * Component to display and manage resumable P2P transfers
 */
export function ResumableTransfers({ onResume }: ResumableTransfersProps) {
    const {
        transfers,
        isLoading,
        error,
        refresh,
        deleteTransfer,
        resumeTransfer,
    } = useResumableTransfers();

    const handleResume = (sessionId: string) => {
        if (onResume) {
            onResume(sessionId);
        } else {
            resumeTransfer(sessionId);
        }
    };

    const handleDelete = async (sessionId: string) => {
        try {
            await deleteTransfer(sessionId);
        } catch (err) {
            console.error("Failed to delete transfer:", err);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2].map(i => (
                    <Skeleton key={i} className="h-24 w-full" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <div>
                        <p className="font-medium text-destructive">Error loading transfers</p>
                        <p className="text-sm text-muted-foreground">{error.message}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={refresh} className="ml-auto">
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    if (transfers.length === 0) {
        return null; // Don't show empty section
    }

    return (
        <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Interrupted</span>
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                        {transfers.length}
                    </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={refresh}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            <div className="divide-y divide-border">
                <AnimatePresence>
                    {transfers.map((transfer) => (
                        <motion.div
                            key={transfer.sessionId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <ResumableTransferCard
                                transfer={transfer}
                                onResume={handleResume}
                                onDelete={handleDelete}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

interface ResumableTransferCardProps {
    transfer: ResumableTransferInfo;
    onResume: (sessionId: string) => void;
    onDelete: (sessionId: string) => void;
}

function ResumableTransferCard({ transfer, onResume, onDelete }: ResumableTransferCardProps) {
    const progress = transfer.progress;
    const isExpired = transfer.expiresAt ? Date.now() > transfer.expiresAt : false;

    return (
        <div className="px-3 py-3 hover:bg-muted/50 transition-colors">
            <div>
                <div className="flex items-start gap-4">
                    {/* File Icon */}
                    <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{"[Encrypted]"}</p>
                            {transfer.isE2E && (
                                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                                    <Shield className="h-3 w-3 mr-1" />
                                    E2E
                                </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                                {transfer.protocol === "chunked" ? "Large File" : "Standard"}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.totalBytes)}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(transfer.updatedAt)}
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground">
                                    {transfer.completedChunks} / {transfer.totalChunks} chunks
                                </span>
                                <span className="font-medium">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            onClick={() => onResume(transfer.sessionId)}
                            disabled={isExpired}
                        >
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Transfer?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete the saved progress for "{"[Encrypted]"}".
                                        You will not be able to resume this transfer.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={() => onDelete(transfer.sessionId)}
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>

                {/* Expired Warning */}
                {isExpired && (
                    <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Session expired. The sender may need to restart the transfer.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
