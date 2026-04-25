/**
 * Shamir Revoke Dialog Component
 *
 * Confirms and executes revocation of all Shamir recovery shares.
 * Requires encryption password verification before proceeding.
 *
 * @module components/settings/ShamirRevokeDialog
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "@/lib/toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMasterKey } from "@/hooks/useMasterKey";

interface ShamirRevokeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function ShamirRevokeDialog({
    open,
    onOpenChange,
    onSuccess,
}: ShamirRevokeDialogProps) {
    const [revokePassword, setRevokePassword] = useState("");

    const { config: mkConfig, deriveMasterKey } = useMasterKey();

    const revokeMutation = trpc.shamirRecovery.revokeAll.useMutation({
        onSuccess: () => {
            toast.success("All recovery shares revoked");
            onOpenChange(false);
            setRevokePassword("");
            onSuccess();
        },
        onError: (error) => toast.error(error.message),
    });

    const handleRevoke = async () => {
        if (!revokePassword) {
            toast.error("Enter your password to confirm");
            return;
        }

        try {
            // Verify password locally by deriving master key (AES-KW unwrap fails if wrong)
            await deriveMasterKey(revokePassword);

            // Password verified client-side — server trusts authenticated client (ZK)
            await revokeMutation.mutateAsync({});
        } catch (error) {
            console.error("Revoke error:", error);
            toast.error("Failed to verify password");
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setRevokePassword("");
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <Trash2 className="w-5 h-5" />
                        Revoke All Recovery Shares
                    </DialogTitle>
                    <DialogDescription>
                        This will invalidate all existing recovery shares. You
                        will need to set up recovery again.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Warning</AlertTitle>
                        <AlertDescription>
                            All distributed shares (server, email, contacts,
                            external) will become invalid. This action cannot be
                            undone.
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                        <Label htmlFor="revoke-password">
                            Enter your encryption password to confirm
                        </Label>
                        <Input
                            id="revoke-password"
                            type="password"
                            value={revokePassword}
                            onChange={(e) => setRevokePassword(e.target.value)}
                            placeholder="Your encryption password"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => {
                            handleOpenChange(false);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleRevoke}
                        disabled={!revokePassword || revokeMutation.isPending}
                    >
                        {revokeMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Revoking...
                            </>
                        ) : (
                            "Revoke All Shares"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
