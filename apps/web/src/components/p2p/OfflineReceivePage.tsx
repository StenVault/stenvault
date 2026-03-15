/**
 * Offline Receive Page
 * 
 * Dedicated page for receiving offline/delayed P2P transfers.
 * Shows transfer details and handles chunk download.
 */
import { useState, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Cloud,
    CloudDownload,
    Download,
    Clock,
    User,
    FileIcon,
    AlertCircle,
    Check,
    Loader2,
    ArrowLeft,
    Shield,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { formatBytes } from "@stenvault/shared";
import { useOfflineTransferDownload } from "@/hooks/useOfflineTransferDownload";

export function OfflineReceivePage() {
    const [, params] = useRoute("/p2p/offline/:sessionId");
    const [, setLocation] = useLocation();
    const sessionId = params?.sessionId || "";

    const [isClaimed, setIsClaimed] = useState(false);
    const [manifest, setManifest] = useState<{
        fileName: string;
        fileSize: number;
        fileType: string;
        totalChunks: number;
        chunks: { index: number; hash: string }[];
    } | null>(null);

    // Use the new download hook
    const {
        status: downloadStatus,
        progress,
        error: downloadError,
        downloadedFile,
        startDownload,
        downloadFile,
        reset: resetDownload,
    } = useOfflineTransferDownload({ parallelDownloads: 3 });

    // Claim mutation
    const claimMutation = trpc.p2p.claimOfflineSession.useMutation({
        onSuccess: (data) => {
            setIsClaimed(true);
            setManifest(data.manifest);
            toast.success("Transfer claimed! Starting download...");
        },
        onError: (err) => {
            toast.error(err.message);
        },
    });

    // Handle claim
    const handleClaim = useCallback(() => {
        if (!sessionId) return;
        claimMutation.mutate({ sessionId });
    }, [sessionId, claimMutation]);

    // Auto-start download after claim
    useEffect(() => {
        if (isClaimed && manifest && downloadStatus === "idle") {
            startDownload(sessionId, manifest);
        }
    }, [isClaimed, manifest, sessionId, downloadStatus, startDownload]);

    // Get session preview first
    const previewQuery = trpc.p2p.getSessionPreview.useQuery(
        { sessionId: sessionId! },
        { enabled: !!sessionId && !isClaimed }
    );

    const session = claimMutation.data?.session || previewQuery.data;
    const isComplete = downloadStatus === "completed";
    const isDownloading = downloadStatus === "downloading" || downloadStatus === "assembling";
    const error = claimMutation.error?.message || downloadError;
    const downloadProgress = progress?.percent || 0;
    const downloadedChunks = progress?.completedChunks || 0;
    const totalChunks = progress?.totalChunks || manifest?.totalChunks || 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-purple-950/20 p-4">
            <div className="max-w-lg mx-auto pt-8 space-y-6">
                {/* Back button */}
                <Button
                    variant="ghost"
                    onClick={() => setLocation("/")}
                    className="gap-2"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Vault
                </Button>

                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex p-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 mb-4">
                        <Cloud className="h-10 w-10 text-purple-500" />
                    </div>
                    <h1 className="text-2xl font-bold">Offline Transfer</h1>
                    <p className="text-muted-foreground">
                        Someone sent you a file when you were offline
                    </p>
                </div>

                {/* Loading */}
                {previewQuery.isLoading && (
                    <Card>
                        <CardContent className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                        </CardContent>
                    </Card>
                )}

                {/* Error */}
                {(previewQuery.error || error) && (
                    <Card className="border-red-500/30 bg-red-500/5">
                        <CardContent className="flex items-center gap-3 py-4">
                            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-red-500">
                                    {previewQuery.error?.message || error}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Session details */}
                {session && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-muted">
                                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <CardTitle className="text-lg truncate">
                                        {session.fileName || "File"}
                                    </CardTitle>
                                    <CardDescription className="flex items-center gap-2 mt-1">
                                        <span>{formatBytes(session.fileSize || 0)}</span>
                                        <span>•</span>
                                        <Badge variant="outline" className="text-xs">
                                            {session.encryptionMethod === "shamir"
                                                ? "Shamir Encrypted"
                                                : "E2E Encrypted"
                                            }
                                        </Badge>
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Sender info */}
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                                <User className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">
                                        {claimMutation.data?.senderName || session.senderName || "Unknown"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {claimMutation.data?.senderEmail || ("senderEmail" in session ? session.senderEmail : "")}
                                    </p>
                                </div>
                            </div>

                            {/* Expiry */}
                            {session.expiresAt && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="h-4 w-4" />
                                    <span>
                                        Expires {formatDistanceToNow(new Date(session.expiresAt), { addSuffix: true })}
                                    </span>
                                </div>
                            )}

                            {/* Security info */}
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
                                <Shield className="h-4 w-4 mt-0.5" />
                                <p className="text-xs">
                                    This file was uploaded encrypted. Only you can decrypt it.
                                </p>
                            </div>

                            {/* Download progress */}
                            {isDownloading && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span>Downloading...</span>
                                        <span>{downloadedChunks} / {totalChunks} chunks</span>
                                    </div>
                                    <Progress value={downloadProgress} className="h-2" />
                                </div>
                            )}

                            {/* Complete */}
                            {isComplete && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
                                    <Check className="h-5 w-5" />
                                    <span className="text-sm font-medium">
                                        Download complete! File saved to your vault.
                                    </span>
                                </div>
                            )}

                            {/* Actions */}
                            {!isClaimed && !isComplete && (
                                <Button
                                    onClick={handleClaim}
                                    disabled={claimMutation.isPending}
                                    className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                                >
                                    {claimMutation.isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Claiming...
                                        </>
                                    ) : (
                                        <>
                                            <CloudDownload className="mr-2 h-4 w-4" />
                                            Claim & Download
                                        </>
                                    )}
                                </Button>
                            )}

                            {isComplete && (
                                <div className="space-y-2">
                                    <Button
                                        onClick={downloadFile}
                                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        Download File
                                    </Button>
                                    <Button
                                        onClick={() => setLocation("/")}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        Back to Vault
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
