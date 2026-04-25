import { useState, useMemo } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@stenvault/shared/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import {
    Alert,
    AlertDescription,
} from "@/components/ui/alert";
import {
    Loader2,
    Users,
    AlertTriangle,
    Clock,
    ShieldAlert,
    X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";

function formatTimeRemaining(targetDate: Date): string {
    const now = Date.now();
    const diff = new Date(targetDate).getTime() - now;
    if (diff <= 0) return "now";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.ceil((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export function TrustedContactsSection() {
    const { data: heldData, isLoading: heldLoading } =
        trpc.shamirRecovery.getHeldShares.useQuery();
    const { data: requestsData, isLoading: requestsLoading } =
        trpc.shamirRecovery.getPendingRecoveryRequests.useQuery(undefined, {
            refetchInterval: 60000,
        });

    const utils = trpc.useUtils();

    const [approveDialog, setApproveDialog] = useState<{
        shareId: number;
        attemptId: number;
        ownerName: string | null;
        ownerEmail: string;
    } | null>(null);

    const [revokeDialog, setRevokeDialog] = useState<{
        shareId: number;
        ownerName: string | null;
        ownerEmail: string;
    } | null>(null);

    const approveMutation = trpc.shamirRecovery.approveShareRelease.useMutation({
        onSuccess: (data) => {
            if (data.alreadySubmitted) {
                toast.info("Share was already submitted for this recovery attempt");
            } else {
                toast.success("Recovery share released successfully");
            }
            setApproveDialog(null);
            utils.shamirRecovery.getPendingRecoveryRequests.invalidate();
            utils.shamirRecovery.getHeldShares.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to release share");
        },
    });

    const revokeMutation = trpc.shamirRecovery.revokeHeldShare.useMutation({
        onSuccess: () => {
            toast.success("Share revoked successfully");
            setRevokeDialog(null);
            utils.shamirRecovery.getHeldShares.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to revoke share");
        },
    });

    const shares = useMemo(() => heldData?.shares || [], [heldData?.shares]);
    const requests = useMemo(() => requestsData?.requests || [], [requestsData?.requests]);

    if (heldLoading || requestsLoading) return null;

    const activeShares = shares.filter((s) => s.status === "active");
    const pendingCount = requests.length;

    // Don't render if user isn't a trusted contact for anyone
    if (activeShares.length === 0 && requests.length === 0) return null;

    return (
        <>
            <Card className="border-2 border-amber-100 dark:border-amber-900 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                                <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    Trusted by Others
                                    {pendingCount > 0 && (
                                        <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                                            {pendingCount} pending
                                        </Badge>
                                    )}
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Recovery shares you hold for other users
                                </p>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Pending Recovery Requests — shown first with urgency */}
                    {requests.map((req) => (
                        <div
                            key={req.attemptId}
                            className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                        {req.ownerName || req.ownerEmail} needs your help to recover their account
                                    </p>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                        {req.collectedCount} / {req.threshold} shares collected
                                    </p>
                                </div>
                                {req.canReleaseNow ? (
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            setApproveDialog({
                                                shareId: req.shareId,
                                                attemptId: req.attemptId,
                                                ownerName: req.ownerName,
                                                ownerEmail: req.ownerEmail,
                                            })
                                        }
                                    >
                                        Release Share
                                    </Button>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 shrink-0">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>Available in {formatTimeRemaining(req.canReleaseAt)}</span>
                                    </div>
                                )}
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-amber-200 dark:bg-amber-800 rounded-full h-1.5">
                                <div
                                    className="bg-amber-500 h-1.5 rounded-full transition-all"
                                    style={{
                                        width: `${Math.min(100, (req.collectedCount / req.threshold) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}

                    {/* Active Held Shares */}
                    {activeShares.length > 0 && (
                        <div className="space-y-2">
                            {requests.length > 0 && (
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide pt-2">
                                    Held Shares
                                </p>
                            )}
                            {activeShares.map((share) => (
                                <div
                                    key={share.shareId}
                                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {share.ownerName || share.ownerEmail}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Share #{share.shareIndex} &middot; Since{" "}
                                            {new Date(share.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950 shrink-0"
                                        onClick={() =>
                                            setRevokeDialog({
                                                shareId: share.shareId,
                                                ownerName: share.ownerName,
                                                ownerEmail: share.ownerEmail,
                                            })
                                        }
                                    >
                                        <X className="h-4 w-4 mr-1" />
                                        Revoke
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Approve Share Release Dialog */}
            <Dialog open={!!approveDialog} onOpenChange={(open) => !open && setApproveDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5" />
                            Release Recovery Share
                        </DialogTitle>
                        <DialogDescription>
                            {approveDialog?.ownerName || approveDialog?.ownerEmail} is recovering their account and needs your share.
                        </DialogDescription>
                    </DialogHeader>
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Only release this share if you have verified the request through a separate channel (phone call, in person, video call). An attacker may have initiated this recovery.
                        </AlertDescription>
                    </Alert>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setApproveDialog(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (approveDialog) {
                                    approveMutation.mutate({
                                        shareId: approveDialog.shareId,
                                        attemptId: approveDialog.attemptId,
                                    });
                                }
                            }}
                            disabled={approveMutation.isPending}
                        >
                            {approveMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Releasing...
                                </>
                            ) : (
                                "Release Share"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Revoke Share Dialog */}
            <Dialog open={!!revokeDialog} onOpenChange={(open) => !open && setRevokeDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="w-5 h-5" />
                            Revoke Recovery Share
                        </DialogTitle>
                        <DialogDescription>
                            Permanently remove the recovery share you hold for{" "}
                            {revokeDialog?.ownerName || revokeDialog?.ownerEmail}.
                        </DialogDescription>
                    </DialogHeader>
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            This cannot be undone. The share owner should update their recovery setup after this change.
                        </AlertDescription>
                    </Alert>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRevokeDialog(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (revokeDialog) {
                                    revokeMutation.mutate({ shareId: revokeDialog.shareId });
                                }
                            }}
                            disabled={revokeMutation.isPending}
                        >
                            {revokeMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Revoking...
                                </>
                            ) : (
                                "Revoke Share"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
