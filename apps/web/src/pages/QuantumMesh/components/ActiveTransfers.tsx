/**
 * Active Transfers Component
 * Displays list of active P2P transfers in progress with cancel support.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
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
import { P2PTransferProgress } from "@/components/p2p";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { formatBytes } from "@stenvault/shared";
import {
    Send,
    WifiOff,
    RefreshCw,
    XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { Session } from "../types";
import { StatusBadge } from "./StatusBadge";
import { TransferDetailsModal } from "./TransferDetailsModal";

interface ActiveTransfersProps {
    sessions: Session[];
    isLoading: boolean;
    onRefresh: () => void;
}

export function ActiveTransfers({ sessions, isLoading, onRefresh }: ActiveTransfersProps) {
    const setLocation = useNavigate();
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const utils = trpc.useUtils();

    const cancelMutation = trpc.p2p.cancelP2PTransfer.useMutation({
        onSuccess: () => {
            toast.success("Transfer cancelled");
            utils.p2p.listSessions.invalidate();
            utils.p2p.getSentP2PTransfers.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const activeSessions = sessions.filter(
        s => ["waiting", "connecting", "transferring"].includes(s.status)
    );

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
        );
    }

    if (activeSessions.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                    <WifiOff className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No Active Transfers</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Start a P2P transfer by sharing a file from your Drive
                </p>
                <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setLocation("/drive")}
                >
                    Go to Drive
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                    {activeSessions.length} active transfer{activeSessions.length !== 1 ? "s" : ""}
                </span>
                <Button variant="ghost" size="sm" onClick={onRefresh}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                </Button>
            </div>
            <AnimatePresence>
                {activeSessions.map((session, index) => (
                    <motion.div
                        key={session.sessionId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: index * 0.05 }}
                    >
                        <Card
                            className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden cursor-pointer hover:bg-accent/30 transition-colors"
                            onClick={() => setSelectedSessionId(session.sessionId)}
                        >
                            <div className="p-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                                        <Send className="h-5 w-5 text-purple-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium truncate">
                                                {session.fileName || "Unknown file"}
                                            </p>
                                            <StatusBadge status={session.status} />
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {session.fileSize ? formatBytes(session.fileSize) : "..."} &middot;
                                            Created {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                                        </p>

                                        {session.status === "transferring" && session.progress !== undefined && (
                                            <div className="mt-3">
                                                <P2PTransferProgress
                                                    state={{
                                                        status: "transferring",
                                                        progress: session.progress,
                                                        bytesTransferred: (session.fileSize || 0) * (session.progress / 100),
                                                        totalBytes: session.fileSize || 0,
                                                        speed: 0,
                                                        estimatedTimeRemaining: 0,
                                                        isEncrypted: false,
                                                        mode: "stream",
                                                    }}
                                                    fileName={session.fileName}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Cancel button (only for sender) */}
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={cancelMutation.isPending}
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Cancel Transfer?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently cancel the transfer for &quot;{session.fileName || "Unknown file"}&quot;.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => cancelMutation.mutate({ sessionId: session.sessionId })}
                                                >
                                                    Cancel Transfer
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
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
