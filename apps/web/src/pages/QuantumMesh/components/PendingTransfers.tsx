/**
 * Pending Transfers Component
 * Displays list of offline transfers waiting to be claimed, with copy link and cancel.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { formatBytes } from "@cloudvault/shared";
import {
    CloudDownload,
    Download,
    Clock,
    Copy,
    XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { OfflineTransfer } from "../types";
import { TransferDetailsModal } from "./TransferDetailsModal";

interface PendingTransfersProps {
    transfers: OfflineTransfer[];
    isLoading: boolean;
}

export function PendingTransfers({ transfers, isLoading }: PendingTransfersProps) {
    const [, setLocation] = useLocation();
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

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
        );
    }

    if (transfers.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                    <CloudDownload className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No Pending Transfers</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    When someone sends you a file via Quantum Mesh, it will appear here
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <AnimatePresence>
                {transfers.map((transfer, index) => (
                    <motion.div
                        key={transfer.sessionId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: index * 0.05 }}
                    >
                        <Card
                            className="bg-card/50 backdrop-blur-sm border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => setSelectedSessionId(transfer.sessionId)}
                        >
                            <div className="p-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                                        <Download className="h-5 w-5 text-green-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium truncate">
                                                {transfer.fileName || "Unknown file"}
                                            </p>
                                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                                                <Clock className="h-3 w-3 mr-1" />
                                                Pending
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            From: {transfer.senderName || transfer.senderEmail}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                            <span>{transfer.fileSize ? formatBytes(transfer.fileSize) : "..."}</span>
                                            <span>&middot;</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                Expires {formatDistanceToNow(new Date(transfer.expiresAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
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
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Details Modal */}
            <TransferDetailsModal
                sessionId={selectedSessionId}
                open={!!selectedSessionId}
                onClose={() => setSelectedSessionId(null)}
            />
        </div>
    );
}
