/**
 * Offline Share Modal
 * 
 * Modal for creating offline/delayed P2P transfers.
 * The recipient doesn't need to be online - they can download later.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import {
    CloudUpload,
    Mail,
    Shield,
    Clock,
    Check,
    Copy,
    Loader2,
    AlertCircle,
    Send,
    FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@stenvault/shared";

interface OfflineShareModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileId: number;
    fileName: string;
    fileSize: number;
}

type UploadPhase = "idle" | "creating" | "uploading" | "complete" | "error";

export function OfflineShareModal({
    open,
    onOpenChange,
    fileId,
    fileName,
    fileSize,
}: OfflineShareModalProps) {
    // Form state
    const [recipientEmail, setRecipientEmail] = useState("");
    const [expiresInHours, setExpiresInHours] = useState(24);
    const [notifyRecipient, setNotifyRecipient] = useState(true);

    // Upload state
    const [phase, setPhase] = useState<UploadPhase>("idle");
    const [uploadProgress, setUploadProgress] = useState(0);
    const [claimUrl, setClaimUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Refs
    const abortController = useRef<AbortController | null>(null);

    // tRPC mutations
    const createSession = trpc.p2p.createOfflineSession.useMutation();
    const uploadChunk = trpc.p2p.uploadChunk.useMutation();
    const trpcUtils = trpc.useUtils();

    // Reset state when modal closes
    useEffect(() => {
        if (!open) {
            setPhase("idle");
            setUploadProgress(0);
            setClaimUrl(null);
            setError(null);
            setRecipientEmail("");
            setExpiresInHours(24);
            abortController.current?.abort();
        }
    }, [open]);

    /**
     * Start the offline transfer
     */
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        if (!recipientEmail) {
            toast.error("Please enter recipient email");
            return;
        }

        setPhase("creating");
        setError(null);
        abortController.current = new AbortController();

        try {
            // Step 1: Create offline session
            const session = await createSession.mutateAsync({
                fileId,
                recipientEmail,
                encryptionMethod: "double",
                splitShares: 1,
                expiresInHours,
                notifyRecipient,
            });

            setClaimUrl(session.claimUrl);
            setPhase("uploading");

            // Step 2: Fetch file content
            const fileData = await trpcUtils.files.getFileDownload.fetch({ fileId: fileId });
            if (!fileData?.url) {
                throw new Error("Could not get file download URL");
            }

            // Download file content
            const response = await fetch(fileData.url);
            if (!response.ok) {
                throw new Error("Failed to download file for transfer");
            }
            const fileBlob = await response.blob();
            const arrayBuffer = await fileBlob.arrayBuffer();

            // Step 3: Upload chunks
            const { chunkSize, totalChunks, sessionId } = session;

            for (let i = 0; i < totalChunks; i++) {
                // Check for abort
                if (abortController.current?.signal.aborted) {
                    throw new Error("Transfer cancelled");
                }

                // Extract chunk
                const offset = i * chunkSize;
                const chunkData = arrayBuffer.slice(offset, offset + chunkSize);

                // Convert to base64
                const chunkArray = new Uint8Array(chunkData);
                let binary = "";
                for (let j = 0; j < chunkArray.length; j++) {
                    binary += String.fromCharCode(chunkArray[j] ?? 0);
                }
                const encryptedData = btoa(binary);

                // Calculate hash
                const hashBuffer = await crypto.subtle.digest("SHA-256", chunkData);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const chunkHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

                // Upload chunk
                await uploadChunk.mutateAsync({
                    sessionId,
                    chunkIndex: i,
                    encryptedData,
                    chunkHash,
                });

                // Update progress
                setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
            }

            setPhase("complete");
            toast.success("Offline transfer created!", {
                description: notifyRecipient
                    ? "Recipient has been notified by email"
                    : "Share the link with the recipient",
            });

        } catch (err) {
            const message = err instanceof Error ? err.message : "Transfer failed";
            setError(message);
            setPhase("error");
            toast.error(message);
        }
    }, [
        recipientEmail,
        expiresInHours,
        notifyRecipient,
        fileId,
        createSession,
        uploadChunk,
        trpcUtils.files.getFileDownload,
    ]);

    /**
     * Copy claim URL to clipboard
     */
    const handleCopyUrl = useCallback(() => {
        if (claimUrl) {
            navigator.clipboard.writeText(claimUrl);
            toast.success("Link copied to clipboard");
        }
    }, [claimUrl]);

    /**
     * Close modal handler
     */
    const handleClose = useCallback(() => {
        if (phase === "uploading") {
            if (!confirm("Cancel the upload?")) return;
            abortController.current?.abort();
        }
        onOpenChange(false);
    }, [phase, onOpenChange]);

    // Expiration label
    const expirationLabel = expiresInHours <= 24
        ? `${expiresInHours} hour${expiresInHours > 1 ? "s" : ""}`
        : `${Math.floor(expiresInHours / 24)} day${expiresInHours >= 48 ? "s" : ""}`;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CloudUpload className="h-5 w-5 text-muted-foreground" />
                        Offline Transfer
                    </DialogTitle>
                    <DialogDescription>
                        Upload now, recipient downloads later
                    </DialogDescription>
                </DialogHeader>

                {/* File Info */}
                <Card className="bg-muted/50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <FileIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{fileName}</p>
                                <p className="text-sm text-muted-foreground">
                                    {formatBytes(fileSize)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {phase === "idle" && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Recipient Email */}
                        <div className="space-y-2">
                            <Label htmlFor="email">Recipient Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={recipientEmail}
                                    onChange={(e) => setRecipientEmail(e.target.value)}
                                    placeholder="recipient@example.com"
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>

                        {/* Expiration */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Expires in
                                </Label>
                                <Badge variant="secondary">{expirationLabel}</Badge>
                            </div>
                            <Slider
                                value={[expiresInHours]}
                                onValueChange={([value]) => setExpiresInHours(value ?? 24)}
                                min={1}
                                max={168}
                                step={1}
                                className="w-full"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>1 hour</span>
                                <span>7 days</span>
                            </div>
                        </div>

                        {/* Notify Recipient */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="notify"
                                checked={notifyRecipient}
                                onChange={(e) => setNotifyRecipient(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                            />
                            <Label htmlFor="notify" className="text-sm">
                                Send email notification to recipient
                            </Label>
                        </div>

                        {/* Security Note */}
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 text-sm">
                            <Shield className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            <p className="text-muted-foreground">
                                File is encrypted before upload. Only the intended recipient can decrypt it.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <div className="flex gap-2 justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" className="gap-2">
                                <Send className="h-4 w-4" />
                                Start Upload
                            </Button>
                        </div>
                    </form>
                )}

                {phase === "creating" && (
                    <div className="py-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                        <p className="text-muted-foreground">Creating offline session...</p>
                    </div>
                )}

                {phase === "uploading" && (
                    <div className="py-4 space-y-4">
                        <div className="text-center">
                            <CloudUpload className="h-8 w-8 mx-auto mb-2 text-primary" />
                            <p className="font-medium">Uploading...</p>
                            <p className="text-sm text-muted-foreground">
                                {uploadProgress}% complete
                            </p>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                        <Button
                            variant="outline"
                            onClick={() => abortController.current?.abort()}
                            className="w-full"
                        >
                            Cancel Upload
                        </Button>
                    </div>
                )}

                {phase === "complete" && claimUrl && (
                    <div className="py-4 space-y-4">
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <Check className="h-6 w-6 text-green-500" />
                            </div>
                            <h3 className="font-medium text-lg">Transfer Ready!</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                {notifyRecipient
                                    ? "Recipient has been notified by email"
                                    : "Share this link with the recipient"
                                }
                            </p>
                        </div>

                        {/* Claim URL */}
                        <div className="space-y-2">
                            <Label>Download Link</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={claimUrl}
                                    readOnly
                                    className="text-xs font-mono"
                                />
                                <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={handleCopyUrl}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>Expires in {expirationLabel}</span>
                        </div>

                        <Button onClick={() => onOpenChange(false)} className="w-full">
                            Done
                        </Button>
                    </div>
                )}

                {phase === "error" && (
                    <div className="py-4 space-y-4">
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <h3 className="font-medium text-lg">Transfer Failed</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                {error || "An error occurred"}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                className="flex-1"
                            >
                                Close
                            </Button>
                            <Button
                                onClick={() => setPhase("idle")}
                                className="flex-1"
                            >
                                Try Again
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
