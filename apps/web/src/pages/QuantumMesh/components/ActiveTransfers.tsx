import { useState } from "react";
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
import { P2PTransferProgress } from "@/components/p2p";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatePresence, motion } from "@/components/ui/animated";
import { formatDistanceToNow } from "date-fns";
import { formatBytes } from "@stenvault/shared";
import { Send, WifiOff, XCircle } from "lucide-react";
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
    const navigate = useNavigate();
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

    if (activeSessions.length === 0) {
        return (
            <EmptyState
                icon={WifiOff}
                title="No active transfers"
                description="Start a P2P transfer by sharing a file from your Drive."
                action={{
                    label: "Go to Drive",
                    onClick: () => navigate("/drive"),
                    variant: "outline",
                }}
                className="py-12"
            />
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                    {activeSessions.length} active transfer{activeSessions.length !== 1 ? "s" : ""}
                </span>
            </div>

            <div className="divide-y divide-border">
                <AnimatePresence>
                    {activeSessions.map((session) => (
                        <motion.div
                            key={session.sessionId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <div
                                className="flex items-start gap-4 px-3 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => setSelectedSessionId(session.sessionId)}
                            >
                                <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                                    <Send className="h-4 w-4 text-muted-foreground" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium truncate">
                                            {session.fileName || "Unknown file"}
                                        </p>
                                        <StatusBadge status={session.status} size="sm" />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {session.fileSize ? formatBytes(session.fileSize) : "..."} &middot;{" "}
                                        {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                                    </p>

                                    {session.status === "transferring" && session.progress !== undefined && (
                                        <div className="mt-2">
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
