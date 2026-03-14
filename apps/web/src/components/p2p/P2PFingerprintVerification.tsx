/**
 * P2P Fingerprint Verification Dialog
 * Requires explicit verification of key fingerprints before allowing file transfer.
 * Prevents MITM attacks by ensuring both parties see the same key fingerprints.
 */
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, ShieldCheck, ShieldX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface P2PFingerprintVerificationProps {
    open: boolean;
    localFingerprint: string;
    peerFingerprint: string;
    onConfirm: () => void;
    onReject: () => void;
}

export function P2PFingerprintVerification({
    open,
    localFingerprint,
    peerFingerprint,
    onConfirm,
    onReject,
}: P2PFingerprintVerificationProps) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onReject()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-amber-500" />
                        Verify Connection Security
                    </DialogTitle>
                    <DialogDescription>
                        Compare these fingerprints with your peer to ensure the connection is secure.
                        Both sides should see the same values.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <Alert className="border-amber-500/50 bg-amber-500/10">
                        <AlertDescription className="text-sm">
                            Verify these fingerprints match on both devices before transferring files.
                            A mismatch may indicate a man-in-the-middle attack.
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Your Fingerprint
                            </p>
                            <div className="p-3 bg-muted rounded-lg">
                                <code className="text-sm font-mono break-all leading-relaxed">
                                    {localFingerprint}
                                </code>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Peer Fingerprint
                            </p>
                            <div className="p-3 bg-muted rounded-lg">
                                <code className="text-sm font-mono break-all leading-relaxed">
                                    {peerFingerprint}
                                </code>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-row gap-2 sm:gap-0">
                    <Button
                        variant="destructive"
                        onClick={onReject}
                        className="flex-1 sm:flex-none"
                    >
                        <ShieldX className="mr-2 h-4 w-4" />
                        Reject
                    </Button>
                    <Button
                        onClick={onConfirm}
                        className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                    >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Fingerprints Match
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
