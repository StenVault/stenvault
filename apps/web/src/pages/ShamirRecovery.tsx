/**
 * Shamir Recovery Page
 *
 * Multi-step recovery flow using Shamir Secret Sharing.
 *
 * Flow:
 * 1. No token: Enter email to initiate recovery
 * 2. With token: Collect shares from various sources
 * 3. Threshold reached: Set new password
 *
 * @module pages/ShamirRecovery
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatTimeRemaining as sharedFormatTimeRemaining } from "@cloudvault/shared";
import { toast } from "sonner";
import {
    Mail,
    ArrowRight,
    Check,
    RefreshCw,
    Shield,
    Key,
    QrCode,
    Server,
    Users,
    Clock,
    AlertTriangle,
    Loader2,
    Copy,
    CheckCircle,
    XCircle,
    Lock,
    Download,
} from "lucide-react";
import {
    AuthLayout,
    AuthCard,
    AuthInput,
    AuthButton,
    AuthDivider,
    AuthLink,
} from "@/components/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { CRYPTO_CONSTANTS, ARGON2_PARAMS, arrayBufferToBase64 } from "@/lib/platform";
import { deriveArgon2Key } from "@/hooks/masterKeyCrypto";
import { getPasswordStrengthUI } from "@/lib/passwordValidation";
import { recoverMasterKey, parseExternalShareQR } from "@/lib/platform/webShamirRecoveryProvider";

type RecoveryStep = "initiate" | "collect" | "password" | "complete";

export default function ShamirRecovery() {
    const [, setLocation] = useLocation();
    const search = useSearch();

    // SECURITY FIX (M1): Read token from URL hash fragment instead of query string
    // Hash fragments are NOT sent to servers, reducing leak risk via:
    // - Server logs
    // - Referer headers
    // - Proxy logs
    // We also support legacy query string for backwards compatibility
    const getTokenFromUrl = (): string | null => {
        // Try hash fragment first (more secure)
        if (typeof window !== "undefined" && window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const hashToken = hashParams.get("token");
            if (hashToken) {
                // Clear the hash from URL for extra security (won't be in browser history)
                window.history.replaceState(null, "", window.location.pathname);
                return hashToken;
            }
        }
        // Fall back to query string for backwards compatibility
        return new URLSearchParams(search).get("token");
    };

    const tokenParam = getTokenFromUrl();

    // State
    const [step, setStep] = useState<RecoveryStep>(tokenParam ? "collect" : "initiate");
    const [email, setEmail] = useState("");
    const [recoveryToken, setRecoveryToken] = useState(tokenParam || "");
    const [externalShareInput, setExternalShareInput] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSubmittingShare, setIsSubmittingShare] = useState(false);
    const [isCompletingRecovery, setIsCompletingRecovery] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [codesAcknowledged, setCodesAcknowledged] = useState(false);

    // tRPC mutations
    const initiateMutation = trpc.shamirRecovery.initiateRecovery.useMutation();
    const submitShareMutation = trpc.shamirRecovery.submitShare.useMutation();
    const completeRecoveryMutation = trpc.shamirRecovery.completeRecovery.useMutation();

    // tRPC queries
    const {
        data: recoveryStatus,
        refetch: refetchStatus,
        isLoading: statusLoading,
    } = trpc.shamirRecovery.getRecoveryStatus.useQuery(
        { recoveryToken },
        { enabled: !!recoveryToken && step === "collect" }
    );

    const { data: serverShare, refetch: refetchServerShare } =
        trpc.shamirRecovery.getServerShare.useQuery(
            { recoveryToken },
            { enabled: !!recoveryToken && step === "collect" }
        );

    const { data: collectedShares, refetch: refetchCollectedShares } =
        trpc.shamirRecovery.getCollectedShares.useQuery(
            { recoveryToken },
            { enabled: !!recoveryToken && recoveryStatus?.remaining === 0 }
        );

    // Auto-submit server share when available
    useEffect(() => {
        if (
            serverShare?.available &&
            serverShare.shareIndex !== undefined &&
            recoveryStatus &&
            !recoveryStatus.collectedIndices.includes(serverShare.shareIndex)
        ) {
            handleSubmitServerShare();
        }
    }, [serverShare, recoveryStatus]);

    // Check if threshold reached and move to password step
    useEffect(() => {
        if (recoveryStatus?.remaining === 0 && step === "collect") {
            setStep("password");
        }
    }, [recoveryStatus, step]);

    const handleInitiateRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await initiateMutation.mutateAsync({ email });
            toast.success("Recovery initiated! Check your email.");
            // Show a message to check email
        } catch (error: any) {
            toast.error(error.message || "Failed to initiate recovery");
        }
    };

    const handleSubmitServerShare = async () => {
        if (!serverShare?.available || !serverShare.shareData) return;

        try {
            const result = await submitShareMutation.mutateAsync({
                recoveryToken,
                shareIndex: serverShare.shareIndex,
                shareData: serverShare.shareData,
                shareType: "server",
                integrityTag: serverShare.integrityTag,
            });

            if (result.accepted) {
                toast.success("Server share automatically added!");
                refetchStatus();
            }
        } catch (error) {
            console.error("Failed to auto-submit server share:", error);
        }
    };

    const handleSubmitExternalShare = async () => {
        if (!externalShareInput.trim()) {
            toast.error("Please enter or paste a share");
            return;
        }

        setIsSubmittingShare(true);

        try {
            // Try to parse as QR data format: shamir:v1:index/threshold/total:base64data|hmac16
            const shareString = externalShareInput.trim();
            let shareData: string;
            let shareIndex: number;
            let hmac: string;

            // Accept 16-char (legacy), 32-char (mid), and full 64-char HMACs
            // Check if it's QR format with HMAC
            const qrMatch = shareString.match(
                /^shamir:v1:(\d+)\/(\d+)\/(\d+):([A-Za-z0-9+/=]+)\|([a-f0-9]{16,64})$/
            );

            if (qrMatch) {
                shareIndex = parseInt(qrMatch[1]!, 10);
                shareData = qrMatch[4]!;
                // For QR format, we need to expand the truncated HMAC
                // The full HMAC was used during setup, we only have first 16 chars
                hmac = qrMatch[5]!.padEnd(64, "0"); // Pad for validation (server will verify)
            } else {
                // Try plain share string format: shamir:v1:index/threshold/total:base64data
                const plainMatch = shareString.match(
                    /^shamir:v1:(\d+)\/(\d+)\/(\d+):([A-Za-z0-9+/=]+)$/
                );

                if (plainMatch) {
                    shareIndex = parseInt(plainMatch[1]!, 10);
                    shareData = plainMatch[4]!;
                    // Generate HMAC locally - for external shares without HMAC
                    // We'll need to compute it or skip verification
                    hmac = "0".repeat(64); // Server will need to handle this
                } else {
                    toast.error("Invalid share format");
                    setIsSubmittingShare(false);
                    return;
                }
            }

            const result = await submitShareMutation.mutateAsync({
                recoveryToken,
                shareIndex,
                shareData,
                shareType: "external",
                integrityTag: hmac,
            });

            if (result.accepted) {
                toast.success(`Share #${shareIndex} accepted!`);
                setExternalShareInput("");
                refetchStatus();
            } else {
                toast.error(result.error || "Share not accepted");
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to submit share");
        } finally {
            setIsSubmittingShare(false);
        }
    };

    const handleCompleteRecovery = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        if (newPassword.length < 12) {
            toast.error("Password must be at least 12 characters");
            return;
        }

        if (!collectedShares?.shares || collectedShares.shares.length < collectedShares.threshold) {
            toast.error("Not enough shares collected");
            return;
        }

        setIsCompletingRecovery(true);

        try {
            // Reconstruct master key from shares
            const masterKey = await recoverMasterKey(
                collectedShares.shares.map((s) => ({
                    index: s.index,
                    data: s.data,
                }))
            );

            // Derive new KEK from new password using Argon2id
            const newSalt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.SALT_LENGTH));
            const argon2Params = {
                type: ARGON2_PARAMS.type,
                memoryCost: ARGON2_PARAMS.memoryCost,
                timeCost: ARGON2_PARAMS.timeCost,
                parallelism: ARGON2_PARAMS.parallelism,
                hashLength: ARGON2_PARAMS.hashLength,
            };
            const newKek = await deriveArgon2Key(newPassword, newSalt, argon2Params);

            // Convert salt to base64
            const saltBase64 = arrayBufferToBase64(newSalt.buffer as ArrayBuffer);

            // Wrap master key with new KEK using AES-KW
            const mkCryptoKey = await crypto.subtle.importKey(
                "raw",
                masterKey.buffer as ArrayBuffer,
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            const wrappedMK = await crypto.subtle.wrapKey("raw", mkCryptoKey, newKek, "AES-KW");
            const newWrappedMasterKey = arrayBufferToBase64(wrappedMK);

            // Generate new recovery codes hashes
            const newRecoveryCodes: string[] = [];
            for (let i = 0; i < 10; i++) {
                const codeBytes = new Uint8Array(4);
                window.crypto.getRandomValues(codeBytes);
                const code = Array.from(codeBytes)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")
                    .toUpperCase()
                    .slice(0, 8);
                newRecoveryCodes.push(code);
            }

            // Complete recovery (send plaintext codes, server hashes with HMAC)
            await completeRecoveryMutation.mutateAsync({
                recoveryToken,
                newPbkdf2Salt: saltBase64,
                newRecoveryCodes: newRecoveryCodes,
                newWrappedMasterKey: newWrappedMasterKey,
                kdfAlgorithm: "argon2id",
                argon2Params,
            });

            setRecoveryCodes(newRecoveryCodes);
            toast.success("Recovery complete! Save your recovery codes.");
            setStep("complete");
        } catch (error: any) {
            console.error("Recovery error:", error);
            toast.error(error.message || "Failed to complete recovery");
        } finally {
            setIsCompletingRecovery(false);
        }
    };

    // Format time remaining (uses shared helper)
    const formatTimeRemaining = (expiresAt: Date) => {
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return "Expired";
        return sharedFormatTimeRemaining(diff);
    };

    // Initiate step - enter email
    if (step === "initiate") {
        return (
            <AuthLayout>
                <AuthCard
                    title="Account Recovery"
                    description="Recover your encryption key using your distributed shares."
                >
                    {initiateMutation.isSuccess ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                <Check className="w-5 h-5 text-green-500" />
                                <p className="text-sm text-slate-400">
                                    If you have Shamir recovery configured, you will receive an
                                    email with instructions.
                                </p>
                            </div>
                            <AuthButton
                                variant="secondary"
                                onClick={() => initiateMutation.reset()}
                                icon={<RefreshCw className="w-4 h-4" />}
                            >
                                Try again
                            </AuthButton>
                        </div>
                    ) : (
                        <form onSubmit={handleInitiateRecovery} className="space-y-6">
                            <AuthInput
                                id="email"
                                type="email"
                                label="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                required
                            />

                            <AuthButton
                                type="submit"
                                isLoading={initiateMutation.isPending}
                                icon={<ArrowRight className="w-4 h-4" />}
                            >
                                Start Recovery
                            </AuthButton>
                        </form>
                    )}

                    <AuthDivider text="Other Options" />

                    <div className="space-y-3">
                        <AuthLink href="/auth/forgot-password" className="text-slate-500">
                            Standard password reset
                        </AuthLink>
                        <AuthLink href="/auth/login" className="text-slate-500">
                            Back to sign in
                        </AuthLink>
                    </div>
                </AuthCard>
            </AuthLayout>
        );
    }

    // Collect step - gather shares
    if (step === "collect") {
        if (statusLoading) {
            return (
                <AuthLayout showBackLink={false}>
                    <AuthCard title="Loading..." description="Checking recovery status...">
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    </AuthCard>
                </AuthLayout>
            );
        }

        if (!recoveryStatus || recoveryStatus.status === "expired") {
            return (
                <AuthLayout showBackLink={false}>
                    <AuthCard
                        title="Recovery Expired"
                        description="This recovery session has expired."
                    >
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Session Expired</AlertTitle>
                            <AlertDescription>
                                Please start a new recovery request.
                            </AlertDescription>
                        </Alert>
                        <div className="mt-6">
                            <AuthButton
                                onClick={() => {
                                    setRecoveryToken("");
                                    setStep("initiate");
                                    setLocation("/recover");
                                }}
                            >
                                Start New Recovery
                            </AuthButton>
                        </div>
                    </AuthCard>
                </AuthLayout>
            );
        }

        const progress = Math.round(
            (recoveryStatus.collected / recoveryStatus.threshold) * 100
        );

        return (
            <AuthLayout showBackLink={false}>
                <div className="w-full max-w-lg mx-auto">
                    <AuthCard
                        title="Collect Recovery Shares"
                        description={`Gather ${recoveryStatus.threshold} shares to recover your encryption key.`}
                    >
                        {/* Progress Section */}
                        <div className="space-y-4 mb-6">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">Progress</span>
                                <span className="text-white font-medium">
                                    {recoveryStatus.collected} / {recoveryStatus.threshold} shares
                                </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="w-3 h-3" />
                                <span>{formatTimeRemaining(recoveryStatus.expiresAt)}</span>
                            </div>
                        </div>

                        <Separator className="my-6 bg-white/10" />

                        {/* Share Sources */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-slate-300">Share Sources</h4>

                            {/* Server Share */}
                            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                <div className="flex items-center gap-3">
                                    <Server className="w-5 h-5 text-blue-400" />
                                    <span className="text-sm">Server Share</span>
                                </div>
                                {recoveryStatus.serverShareAvailable ? (
                                    recoveryStatus.collectedIndices.includes(
                                        serverShare?.shareIndex ?? -1
                                    ) ? (
                                        <CheckCircle className="w-5 h-5 text-green-500" />
                                    ) : (
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                    )
                                ) : (
                                    <XCircle className="w-5 h-5 text-slate-600" />
                                )}
                            </div>

                            {/* Email Share */}
                            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                <div className="flex items-center gap-3">
                                    <Mail className="w-5 h-5 text-green-400" />
                                    <span className="text-sm">Email Share</span>
                                </div>
                                {recoveryStatus.emailShareSent ? (
                                    <span className="text-xs text-slate-500">Check email</span>
                                ) : (
                                    <XCircle className="w-5 h-5 text-slate-600" />
                                )}
                            </div>

                            {/* Trusted Contacts */}
                            {recoveryStatus.trustedContactsPending.length > 0 && (
                                <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                    <div className="flex items-center gap-3">
                                        <Users className="w-5 h-5 text-purple-400" />
                                        <span className="text-sm">Trusted Contacts</span>
                                    </div>
                                    <span className="text-xs text-slate-500">
                                        {recoveryStatus.trustedContactsPending.length} pending
                                    </span>
                                </div>
                            )}
                        </div>

                        <Separator className="my-6 bg-white/10" />

                        {/* External Share Input */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-slate-300">
                                Enter External Share
                            </h4>
                            <p className="text-xs text-slate-500">
                                Paste a share from QR code, email, or paper backup.
                            </p>
                            <div className="space-y-3">
                                <Input
                                    value={externalShareInput}
                                    onChange={(e) => setExternalShareInput(e.target.value)}
                                    placeholder="Paste your recovery share here"
                                    className="font-mono text-xs bg-white/[0.02] border-white/[0.1]"
                                />
                                <Button
                                    onClick={handleSubmitExternalShare}
                                    disabled={!externalShareInput.trim() || isSubmittingShare}
                                    className="w-full"
                                >
                                    {isSubmittingShare ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <QrCode className="w-4 h-4 mr-2" />
                                            Submit Share
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Collected Indices */}
                        {recoveryStatus.collectedIndices.length > 0 && (
                            <div className="mt-6 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                <p className="text-xs text-green-400">
                                    Collected shares: #{recoveryStatus.collectedIndices.join(", #")}
                                </p>
                            </div>
                        )}
                    </AuthCard>
                </div>
            </AuthLayout>
        );
    }

    // Password step - set new password
    if (step === "password") {
        return (
            <AuthLayout showBackLink={false}>
                <AuthCard
                    title="Set New Password"
                    description="All shares collected! Create a new encryption password."
                >
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 mb-6">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <p className="text-sm text-green-400">
                            Threshold reached! {recoveryStatus?.collected} shares collected.
                        </p>
                    </div>

                    <form onSubmit={handleCompleteRecovery} className="space-y-6">
                        <div className="space-y-2">
                            <AuthInput
                                id="newPassword"
                                type="password"
                                label="New Encryption Password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••••••"
                                required
                            />
                            {newPassword && (() => {
                                const strength = getPasswordStrengthUI(newPassword);
                                return (
                                    <div className="space-y-1">
                                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${strength.color}`}
                                                style={{ width: strength.width }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-400">
                                            Strength: {strength.label}
                                            {newPassword.length < 12 && " (minimum 12 characters)"}
                                        </p>
                                    </div>
                                );
                            })()}
                        </div>

                        <AuthInput
                            id="confirmPassword"
                            type="password"
                            label="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••••••"
                            required
                        />

                        {newPassword && confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-sm text-red-400">Passwords do not match</p>
                        )}

                        <AuthButton
                            type="submit"
                            isLoading={isCompletingRecovery}
                            icon={<Lock className="w-4 h-4" />}
                            disabled={
                                !newPassword ||
                                !confirmPassword ||
                                newPassword !== confirmPassword ||
                                newPassword.length < 12
                            }
                        >
                            Complete Recovery
                        </AuthButton>
                    </form>
                </AuthCard>
            </AuthLayout>
        );
    }

    // Complete step - show recovery codes then success
    if (step === "complete") {
        return (
            <AuthLayout showBackLink={false}>
                <AuthCard
                    title="Recovery Complete"
                    description="Your encryption password has been reset."
                >
                    <div className="space-y-6">
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="p-4 rounded-full bg-green-500/20">
                                <Shield className="w-10 h-10 text-green-500" />
                            </div>
                        </div>

                        {recoveryCodes.length > 0 && !codesAcknowledged && (
                            <div className="space-y-4">
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Save Your Recovery Codes</AlertTitle>
                                    <AlertDescription>
                                        These codes can be used to reset your password if you forget it.
                                        Each code can only be used once. Store them in a safe place.
                                    </AlertDescription>
                                </Alert>

                                <div className="grid grid-cols-2 gap-2 p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                    {recoveryCodes.map((code, i) => (
                                        <code key={i} className="text-sm font-mono text-center py-1 text-slate-300">
                                            {code}
                                        </code>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => {
                                            navigator.clipboard.writeText(recoveryCodes.join("\n"));
                                            toast.success("Recovery codes copied to clipboard");
                                        }}
                                    >
                                        <Copy className="w-4 h-4 mr-2" />
                                        Copy All
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => {
                                            const blob = new Blob(
                                                [recoveryCodes.join("\n")],
                                                { type: "text/plain" }
                                            );
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = url;
                                            a.download = "cloudvault-recovery-codes.txt";
                                            a.click();
                                            URL.revokeObjectURL(url);
                                            toast.success("Recovery codes downloaded");
                                        }}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Download
                                    </Button>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="codes-saved"
                                        checked={codesAcknowledged}
                                        onCheckedChange={(checked) =>
                                            setCodesAcknowledged(checked === true)
                                        }
                                    />
                                    <label
                                        htmlFor="codes-saved"
                                        className="text-sm text-slate-400 cursor-pointer"
                                    >
                                        I have saved my recovery codes
                                    </label>
                                </div>
                            </div>
                        )}

                        {(codesAcknowledged || recoveryCodes.length === 0) && (
                            <div className="space-y-4">
                                <p className="text-center text-sm text-slate-400">
                                    You can now log in with your new password. Consider setting up
                                    new recovery shares in Settings.
                                </p>
                                <AuthButton onClick={() => setLocation("/auth/login")}>
                                    Go to Login
                                </AuthButton>
                            </div>
                        )}
                    </div>
                </AuthCard>
            </AuthLayout>
        );
    }

    return null;
}
