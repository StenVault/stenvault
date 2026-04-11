import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatePresence, motion } from "@/components/ui/animated";
import { formatDistanceToNow } from "date-fns";
import { formatBytes } from "@stenvault/shared";
import { CloudDownload, Download, Clock, Copy, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { OfflineTransfer } from "../types";
import { TransferDetailsModal } from "./TransferDetailsModal";

interface PendingTransfersProps {
    transfers: OfflineTransfer[];
    isLoading: boolean;
}

export function PendingTransfers({ transfers, isLoading }: PendingTransfersProps) {
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const utils = trpc.useUtils();

    const cancelMutation = trpc.p2p.cancelP2PTransfer.useMutation({
        onSuccess: () => {
            toast.success("Transfer cancelled");
            utils.p2p.listSessions.invalidate();
            utils.p2p.getPendingTransfers.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const handleCopyLink = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        const url = `${window.location.origin}/p2p/offline/${sessionId}`;
        navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
    };

    if (transfers.length === 0) {
        return (
            <EmptyState
                icon={CloudDownload}
                title="No pending transfers"
                description="Files sent to you via Quantum Mesh will appear here."
                className="py-12"
            />
        );
    }

    return (
        <div>
            <div className="divide-y divide-border">
                <AnimatePresence>
                    {transfers.map((transfer) => (
                        <motion.div
                            key={transfer.sessionId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <div
                                className="flex items-start gap-4 px-3 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => setSelectedSessionId(transfer.sessionId)}
                            >
                                <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                                    <Download className="h-4 w-4 text-muted-foreground" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium truncate">
                                            {transfer.fileName || "Unknown file"}
                                        </p>
                                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                                            <Clock className="h-3 w-3 mr-1" />
                                            Pending
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        From: {transfer.senderName || transfer.senderEmail}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                        <span>{transfer.fileSize ? formatBytes(transfer.fileSize) : "..."}</span>
                                        <span>&middot;</span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Expires {formatDistanceToNow(new Date(transfer.expiresAt), { addSuffix: true })}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground"
                                        onClick={(e) => handleCopyLink(e, transfer.sessionId)}
                                        title="Copy claim link"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={cancelMutation.isPending}
                                                title="Cancel transfer"
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Cancel Transfer?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will cancel the pending transfer for &quot;{transfer.fileName || "Unknown file"}&quot;.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => cancelMutation.mutate({ sessionId: transfer.sessionId })}
                                                >
                                                    Cancel Transfer
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <TransferDetailsModal
                sessionId={selectedSessionId}
                open={!!selectedSessionId}
                onClose={() => setSelectedSessionId(null)}
            />
        </div>
    );
}
