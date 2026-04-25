/**
 * Shamir External Shares Dialog Component
 *
 * Displays existing external recovery shares with QR codes for backup/recovery.
 *
 * @module components/settings/ShamirExternalSharesDialog
 */

import { useEffect } from "react";
import { Button } from "@stenvault/shared/ui/button";
import { Badge } from "@stenvault/shared/ui/badge";
import { QrCode } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@stenvault/shared/ui/dialog";
import { QRCodeSVG } from "qrcode.react";

interface ShamirExternalSharesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShamirExternalSharesDialog({
    open,
    onOpenChange,
}: ShamirExternalSharesDialogProps) {
    const { data: myExternalShares, refetch: refetchExternalShares } =
        trpc.shamirRecovery.getMyExternalShares.useQuery(undefined, {
            enabled: false,
        });

    // Fetch external shares when dialog opens
    useEffect(() => {
        if (open) {
            refetchExternalShares();
        }
    }, [open, refetchExternalShares]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <QrCode className="w-5 h-5" />
                        External Recovery Shares
                    </DialogTitle>
                    <DialogDescription>
                        Your external shares for backup and recovery.
                    </DialogDescription>
                </DialogHeader>

                {myExternalShares?.shares &&
                myExternalShares.shares.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {myExternalShares.shares.map((share) => (
                            <div
                                key={share.index}
                                className="p-4 border rounded-lg space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                        Share #{share.index}
                                    </span>
                                    <Badge variant="secondary">External</Badge>
                                </div>
                                <div className="flex justify-center bg-white p-4 rounded-lg">
                                    <QRCodeSVG
                                        value={share.qrData}
                                        size={192}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">
                        No external shares configured.
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
