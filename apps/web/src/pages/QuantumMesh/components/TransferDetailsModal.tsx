/**
 * Transfer Details Modal
 * Shows detailed info about a specific P2P transfer session.
 */
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@stenvault/shared";
import { format, formatDistanceToNow } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import {
    FileDown,
    Copy,
    XCircle,
    Clock,
    Shield,
    ArrowRightLeft,
    User,
    AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "./StatusBadge";
import type { SessionStatus } from "../types";

interface TransferDetailsModalProps {
    sessionId: string | null;
    open: boolean;
    onClose: () => void;
}

export function TransferDetailsModal({ sessionId, open, onClose }: TransferDetailsModalProps) {
    const utils = trpc.useUtils();

    const { data: details, isLoading, error } = trpc.p2p.getP2PSessionDetails.useQuery(
        { sessionId: sessionId! },
        { enabled: !!sessionId && open }
    );

    const cancelMutation = trpc.p2p.cancelP2PTransfer.useMutation({
        onSuccess: () => {
            toast.success("Transfer cancelled");
            utils.p2p.listSessions.invalidate();
            utils.p2p.getSentP2PTransfers.invalidate();
            onClose();
        },
        onError: (err) => toast.error(err.message),
    });

    const handleCopyLink = () => {
        if (!sessionId) return;
        const url = `${window.location.origin}/p2p/offline/${sessionId}`;
        navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
    };

    const canCancel = details?.isSender && details.status !== "completed" && details.status !== "cancelled" && details.status !== "expired";
    const progressPercent = details ? Math.round((details.progress ?? 0) * 100) : 0;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileDown className="h-5 w-5 text-muted-foreground" />
                        Transfer Details
                    </DialogTitle>
                </DialogHeader>

                {isLoading && (
                    <div className="space-y-4 py-4">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center py-8 text-center">
                        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                            {error.message.includes("not found")
                                ? "This transfer session has expired or was deleted."
                                : error.message}
                        </p>
                    </div>
                )}

                {details && (
                    <div className="space-y-5 py-2">
                        {/* File info */}
                        <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{details.fileName || "Unknown file"}</p>
                                <p className="text-sm text-muted-foreground">
                                    {details.fileSize ? formatBytes(details.fileSize) : "Unknown size"}
                                </p>
                            </div>
                            <StatusBadge status={details.status as SessionStatus} />
                        </div>

                        {/* Progress bar */}
                        {details.totalChunks > 0 && details.status !== "completed" && (
                            <div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                    <span>Progress</span>
                                    <span>{details.uploadedChunks}/{details.totalChunks} chunks ({progressPercent}%)</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-300 rounded-full"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Info grid */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <InfoRow icon={User} label="Sender" value={details.senderEmail} />
                            <InfoRow icon={User} label="Recipient" value={details.recipientEmail} />
                            <InfoRow
                                icon={Shield}
                                label="Encryption"
                                value={details.isE2EEncrypted ? "E2E Encrypted" : "Standard"}
                            />
                            <InfoRow
                                icon={ArrowRightLeft}
                                label="Role"
                                value={details.isSender ? "Sender" : "Recipient"}
                            />
                        </div>

                        {/* Timeline */}
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Timeline</p>
                            <div className="space-y-1.5 text-sm">
                                <TimelineItem
                                    label="Created"
                                    date={details.createdAt}
                                />
                                {details.completedAt && (
                                    <TimelineItem
                                        label={details.status === "completed" ? "Completed" : "Ended"}
                                        date={details.completedAt}
                                    />
                                )}
                                <TimelineItem
                                    label="Expires"
                                    date={details.expiresAt}
                                    suffix={details.hoursRemaining > 0
                                        ? `(${details.hoursRemaining}h remaining)`
                                        : "(expired)"}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t">
                            <Button variant="outline" size="sm" onClick={handleCopyLink}>
                                <Copy className="h-4 w-4 mr-1.5" />
                                Copy Link
                            </Button>
                            {canCancel && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" disabled={cancelMutation.isPending}>
                                            <XCircle className="h-4 w-4 mr-1.5" />
                                            Cancel Transfer
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Cancel Transfer?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently cancel the transfer. The recipient will no longer be able to download the file.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Keep Transfer</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => cancelMutation.mutate({ sessionId: sessionId! })}
                                            >
                                                Cancel Transfer
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
            <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium truncate">{value}</p>
            </div>
        </div>
    );
}

function TimelineItem({ label, date, suffix }: { label: string; date: string | Date; suffix?: string }) {
    const d = new Date(date);
    return (
        <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground">{label}:</span>
            <span>{format(d, "MMM d, yyyy 'at' HH:mm")}</span>
            {suffix && <span className="text-xs">{suffix}</span>}
        </div>
    );
}
