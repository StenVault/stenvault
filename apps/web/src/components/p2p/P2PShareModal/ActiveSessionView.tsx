/**
 * Active Session View
 * Shows the share link, connection status, and progress when a session is active
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { P2PConnectionStatus } from "../P2PConnectionStatus";
import { P2PFingerprintVerification } from "../P2PFingerprintVerification";
import { P2PTransferProgress } from "../P2PTransferProgress";
import { ShamirShareDisplay } from "../ShamirShareDisplay";
import type { P2PConnectionState, P2PTransferState } from "../types";
import type { EncodedShare } from "@/lib/shamirSecretSharing";

interface ActiveSessionViewProps {
    shareUrl: string;
    connectionState: P2PConnectionState;
    transferState: P2PTransferState;
    fileName: string;
    isShamir: boolean;
    shamirShares: EncodedShare[];
    peerFingerprint?: string;
    localFingerprint?: string;
    onCancel: () => void;
    onClose: () => void;
}

export function ActiveSessionView({
    shareUrl,
    connectionState,
    transferState,
    fileName,
    isShamir,
    shamirShares,
    peerFingerprint,
    localFingerprint,
    onCancel,
    onClose,
}: ActiveSessionViewProps) {
    const [copied, setCopied] = useState(false);
    const [fingerprintVerified, setFingerprintVerified] = useState(false);

    const showProgress = connectionState === "transferring" || connectionState === "completed";

    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success("Link copied to clipboard!");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy link");
        }
    }, [shareUrl]);

    return (
        <>
            {/* Connection status */}
            <P2PConnectionStatus status={connectionState} peerFingerprint={peerFingerprint} />

            {/* Fingerprint verification gate */}
            {connectionState === "connected" && peerFingerprint && localFingerprint && !fingerprintVerified && (
                <P2PFingerprintVerification
                    open={true}
                    localFingerprint={localFingerprint}
                    peerFingerprint={peerFingerprint}
                    onConfirm={() => setFingerprintVerified(true)}
                    onReject={onCancel}
                />
            )}

            {/* Shamir shares display */}
            {isShamir && shamirShares.length > 0 && (
                <ShamirShareDisplay shares={shamirShares} />
            )}

            {/* Share link */}
            <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                    <Input
                        value={shareUrl}
                        readOnly
                        className="font-mono text-xs"
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyLink}
                    >
                        {copied ? (
                            <Check className="h-4 w-4 text-green-500" />
                        ) : (
                            <Copy className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(shareUrl, "_blank")}
                    >
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    {isShamir
                        ? "Send the link AND the required shares to your recipient."
                        : "Send this link to your recipient. They must be logged in to receive."
                    }
                </p>
            </div>

            {/* Transfer progress */}
            {showProgress && (
                <P2PTransferProgress
                    state={transferState}
                    fileName={fileName}
                    onCancel={onCancel}
                />
            )}

            {/* Cancel/Close button */}
            {connectionState !== "completed" && (
                <Button
                    variant="outline"
                    onClick={onClose}
                    className="w-full"
                >
                    Cancel Session
                </Button>
            )}
        </>
    );
}
