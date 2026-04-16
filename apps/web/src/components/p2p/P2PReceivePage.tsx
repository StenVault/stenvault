/**
 * P2P Receive Page
 * Page for receiving a P2P file transfer (recipient side).
 * Route: /p2p/:sessionId
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Wifi,
    Download,
    Shield,
    ShieldCheck,
    User,
    FileIcon,
    Clock,
    AlertCircle,
    Loader2,
    Check,
    LogIn,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatBytes } from "@stenvault/shared";
import { useP2PTransfer } from "@/hooks/p2p";
import { useTheme } from "@/contexts/ThemeContext";
import { P2PConnectionStatus } from "./P2PConnectionStatus";
import { P2PTransferProgress } from "./P2PTransferProgress";

function formatTimeRemaining(expiresAt: Date | string): string {
    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);

    if (hours >= 1) {
        return `${hours}h ${minutes % 60}m remaining`;
    }
    return `${minutes}m remaining`;
}

export function P2PReceivePage() {
    const params = useParams<{ sessionId: string }>();
    const setLocation = useNavigate();
    const sessionId = params.sessionId || "";

    // Query session preview
    const {
        data: preview,
        isLoading: loadingPreview,
        error: previewError,
    } = trpc.p2p.getSessionPreview.useQuery(
        { sessionId },
        { enabled: !!sessionId }
    );

    // Check if user is logged in
    const { data: user } = trpc.auth.me.useQuery();
    const isLoggedIn = !!user;

    // P2P transfer hook
    const {
        connectionState,
        transferState,
        joinSession,
        cancelTransfer,
        isLoading: joinLoading,
        error: joinError,
        peerFingerprint,
    } = useP2PTransfer();

    const { theme } = useTheme();
    const [hasJoined, setHasJoined] = useState(false);

    const handleJoinSession = useCallback(async () => {
        if (!sessionId) return;

        try {
            await joinSession(sessionId);
            setHasJoined(true);
            toast.success("Connected to sender!");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to join session";
            toast.error(message);
        }
    }, [sessionId, joinSession]);

    const handleLogin = useCallback(() => {
        // Redirect to login with return URL
        setLocation(`/auth/login?redirect=/p2p/${sessionId}`);
    }, [setLocation, sessionId]);

    // Auto-redirect if completed
    useEffect(() => {
        if (connectionState !== "completed") return;

        const timeout = setTimeout(() => {
            toast.success("File received and saved to your storage!");
            setLocation("/drive");
        }, 2000);

        return () => clearTimeout(timeout);
    }, [connectionState, setLocation]);

    // Loading state
    if (loadingPreview) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="space-y-4">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-full" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Not found
    if (!preview?.found) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-full bg-red-500/10">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <div>
                                <CardTitle>Session Not Found</CardTitle>
                                <CardDescription>
                                    This P2P session doesn't exist or has been cancelled.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setLocation("/")}
                        >
                            Go to Home
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Expired
    if (preview.expired) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-full bg-amber-500/10">
                                <Clock className="h-6 w-6 text-amber-500" />
                            </div>
                            <div>
                                <CardTitle>Session Expired</CardTitle>
                                <CardDescription>
                                    This P2P session has timed out. Ask the sender for a new link.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setLocation("/")}
                        >
                            Go to Home
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Not logged in
    if (!isLoggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-3 rounded-full" style={{ backgroundColor: `${theme.brand.primary}15` }}>
                                <Wifi className="h-6 w-6" style={{ color: theme.brand.primary }} />
                            </div>
                            <div>
                                <CardTitle>Quantum Mesh</CardTitle>
                                <CardDescription>P2P Encrypted File Transfer</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* File preview */}
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                            <FileIcon className="h-10 w-10 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{"[Encrypted]"}</p>
                                {preview.fileSize && (
                                    <p className="text-sm text-muted-foreground">
                                        {formatBytes(preview.fileSize)}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Sender info */}
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>From: {"StenVault User"}</span>
                        </div>

                        {/* Encryption badge */}
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-green-500" />
                            <span className="text-sm">
                                {preview.encryptionMethod === "double"
                                    ? "Double Encryption (E2E + Transport)"
                                    : "WebRTC Encrypted"}
                            </span>
                        </div>

                        {/* Expiration */}
                        {preview.expiresAt && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>{formatTimeRemaining(preview.expiresAt)}</span>
                            </div>
                        )}

                        {/* Login required message */}
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <p className="text-sm text-amber-600">
                                You need to log in to receive this file.
                            </p>
                        </div>

                        {/* Login button */}
                        <Button
                            onClick={handleLogin}
                            className="w-full"
                        >
                            <LogIn className="mr-2 h-4 w-4" />
                            Log In to Receive
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Main receive UI
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-full" style={{ backgroundColor: `${theme.brand.primary}15` }}>
                            <Wifi className="h-6 w-6" style={{ color: theme.brand.primary }} />
                        </div>
                        <div className="flex-1">
                            <CardTitle className="flex items-center gap-2">
                                Quantum Mesh
                                <Badge variant="secondary">P2P</Badge>
                            </CardTitle>
                            <CardDescription>Direct peer-to-peer file transfer</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* File info */}
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                        <FileIcon className="h-10 w-10 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{"[Encrypted]"}</p>
                            {preview.fileSize && (
                                <p className="text-sm text-muted-foreground">
                                    {formatBytes(preview.fileSize)}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Sender info */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>From: {"StenVault User"}</span>
                    </div>

                    {/* Encryption info */}
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-green-500" />
                        <span className="text-sm">
                            {preview.encryptionMethod === "double"
                                ? "Double Encryption (E2E + Transport)"
                                : "WebRTC Encrypted"}
                        </span>
                    </div>

                    {/* Connection status */}
                    {hasJoined && (
                        <P2PConnectionStatus status={connectionState} peerFingerprint={peerFingerprint ?? undefined} />
                    )}

                    {/* Transfer progress */}
                    {(connectionState === "transferring" || connectionState === "completed") && (
                        <P2PTransferProgress
                            state={transferState}
                            fileName={"[Encrypted]"}
                            onCancel={cancelTransfer}
                        />
                    )}

                    {/* Error display */}
                    {joinError && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                            <p className="text-sm text-red-500">{joinError}</p>
                        </div>
                    )}

                    {/* Action buttons */}
                    {!hasJoined ? (
                        <Button
                            onClick={handleJoinSession}
                            disabled={joinLoading}
                            className="w-full"
                        >
                            {joinLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <Download className="mr-2 h-4 w-4" />
                                    Receive File
                                </>
                            )}
                        </Button>
                    ) : connectionState === "completed" ? (
                        <Button
                            onClick={() => setLocation("/drive")}
                            className="w-full"
                        >
                            <Check className="mr-2 h-4 w-4" />
                            Go to My Files
                        </Button>
                    ) : connectionState === "failed" ? (
                        <Button
                            variant="outline"
                            onClick={() => setLocation("/")}
                            className="w-full"
                        >
                            Go to Home
                        </Button>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
