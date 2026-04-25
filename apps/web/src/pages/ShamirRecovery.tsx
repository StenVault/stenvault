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
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { formatTimeRemaining as sharedFormatTimeRemaining } from "@stenvault/shared";
import { toast } from "@stenvault/shared/lib/toast";
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
    CheckCircle,
    XCircle,
    Lock,
    Package,
} from "lucide-react";
import {
    AuthLayout,
    AuthCard,
    AuthInput,
    AuthButton,
    AuthDivider,
    AuthLink,
    AuthStepIndicator,
    AuthOTPInput,
    AuthPasswordPair,
    AuthRecoveryCodesGrid,
    AuthSidePanel,
} from "@/components/auth";
import { Progress } from "@stenvault/shared/ui/progress";
import { Checkbox } from "@stenvault/shared/ui/checkbox";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { CRYPTO_CONSTANTS, ARGON2_PARAMS, arrayBufferToBase64 } from "@/lib/platform";
import { deriveArgon2Key, generateRecoveryWrapsFromKey } from "@/hooks/masterKeyCrypto";
import { generateRecoveryCodes } from "@/lib/recoveryCodeUtils";
import { recoverMasterKey, parseExternalShareQR } from "@/lib/platform/webShamirRecoveryProvider";

type RecoveryStep = "initiate" | "collect" | "verify" | "password" | "complete";

export default function ShamirRecovery() {
    const setLocation = useNavigate();
    const [searchParams] = useSearchParams();
    const search = searchParams.toString();

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
    // Friction gate — checkbox stays inert until Copy or Download has fired.
    const [hasInteractedWithCodes, setHasInteractedWithCodes] = useState(false);
    const [otp, setOtp] = useState("");
    const [otpRequested, setOtpRequested] = useState(false);

    // tRPC mutations
    const initiateMutation = trpc.shamirRecovery.initiateRecovery.useMutation();
    const submitShareMutation = trpc.shamirRecovery.submitShare.useMutation();
    const requestOtpMutation = trpc.shamirRecovery.requestRecoveryOTP.useMutation();
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
            { recoveryToken, otp },
            { enabled: !!recoveryToken && !!otp && otp.length === 6 && step === "password" }
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

    // SEC-002: When threshold reached, go to OTP verification before password
    useEffect(() => {
        if (recoveryStatus?.remaining === 0 && step === "collect") {
            setStep("verify");
            // Auto-request OTP when threshold is reached
            if (!otpRequested) {
                requestOtpMutation.mutateAsync({ recoveryToken }).then(() => {
                    setOtpRequested(true);
                    toast.success("Verification code sent to your email");
                }).catch(() => {
                    toast.error("Failed to send verification code");
                });
            }
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
            toast.error("Enter or paste a share");
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
                hmac = qrMatch[5]!;
                // Reject truncated HMACs — full 64 hex chars required
                if (hmac.length < 64) {
                    toast.error("Share HMAC is truncated — please use a share with full integrity tag");
                    setIsSubmittingShare(false);
                    return;
                }
            } else {
                // Plain format without HMAC — reject (no legacy shares exist with 0 users)
                toast.error("Invalid share format — shares must include an integrity tag (HMAC)");
                setIsSubmittingShare(false);
                return;
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
        let masterKey: Uint8Array | null = null;

        try {
            // Reconstruct master key from shares
            masterKey = await recoverMasterKey(
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

            // Import MK once as extractable AES-GCM, then zero the raw bytes.
            // One import feeds both the password re-wrap AND the 10 recovery-code
            // wraps below — keeps the raw-bytes window at ~0s instead of ~50s.
            const mkCryptoKey = await crypto.subtle.importKey(
                "raw",
                masterKey.buffer as ArrayBuffer,
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            masterKey.fill(0);
            masterKey = null;

            // Wrap master key with new KEK using AES-KW
            const wrappedMK = await crypto.subtle.wrapKey("raw", mkCryptoKey, newKek, "AES-KW");
            const newWrappedMasterKey = arrayBufferToBase64(wrappedMK);

            // Generate new recovery codes (canonical 12-char format, server hashes with HMAC)
            const newRecoveryCodes = generateRecoveryCodes();

            // Dual-wrap: per-recovery-code wraps of the reconstructed MK, aligned to the
            // fresh codes so future resetWithRecoveryCode can preserve the MK.
            const newRecoveryWraps = await generateRecoveryWrapsFromKey(
                mkCryptoKey,
                newRecoveryCodes,
                argon2Params
            );

            // Complete recovery (SEC-002: identity verified via OTP in getCollectedShares)
            await completeRecoveryMutation.mutateAsync({
                recoveryToken,
                newPbkdf2Salt: saltBase64,
                newRecoveryCodes,
                newWrappedMasterKey,
                recoveryWraps: newRecoveryWraps,
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
            masterKey?.fill(0);
            setIsCompletingRecovery(false);
        }
    };

    const recoveryStepOrder: RecoveryStep[] = ["initiate", "collect", "verify", "password", "complete"];
    const stepIndex = Math.max(recoveryStepOrder.indexOf(step), 0);
    const stepIndicator = (
        <AuthStepIndicator
            variant="bars"
            steps={[
                { icon: Mail, label: "Start" },
                { icon: Package, label: "Collect" },
                { icon: Shield, label: "Verify" },
                { icon: Lock, label: "New Password" },
                { icon: Check, label: "Complete" },
            ]}
            current={stepIndex}
            srLabel={`Trusted Circle Recovery, step ${stepIndex + 1} of 5`}
            className="mb-2"
        />
    );

    // Format time remaining (uses shared helper)
    const formatTimeRemaining = (expiresAt: Date) => {
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return "Expired";
        return sharedFormatTimeRemaining(diff);
    };

    const shamirSidePanel = (
        <AuthSidePanel headline="Last resort. Your circle holds the pieces." />
    );

    // Initiate step - enter email
    if (step === "initiate") {
        return (
            <AuthLayout sidePanel={shamirSidePanel}>
                <AuthCard
                    title="Trusted Circle Recovery"
                    description="Gather your circle and recover your Encryption Password."
                >
                    {stepIndicator}
                    {initiateMutation.isSuccess ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                <Check className="w-5 h-5 text-green-500" />
                                <p className="text-sm text-slate-400">
                                    If you have Trusted Circle Recovery configured, you will receive an
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
                                Start recovery
                            </AuthButton>
                        </form>
                    )}

                    <AuthDivider text="Alternatives" />

                    <div className="flex flex-col gap-3">
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
                <AuthLayout showBackLink={false} sidePanel={shamirSidePanel}>
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
                <AuthLayout showBackLink={false} sidePanel={shamirSidePanel}>
                    <AuthCard
                        title="Recovery expired"
                        description="This recovery session has expired."
                    >
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-200/80">
                                <p className="font-medium text-red-200 mb-1">Session expired</p>
                                <p>Please start a new recovery request.</p>
                            </div>
                        </div>
                        <div className="mt-6">
                            <AuthButton
                                onClick={() => {
                                    setRecoveryToken("");
                                    setStep("initiate");
                                    setLocation("/recover");
                                }}
                            >
                                Start new recovery
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
            <AuthLayout showBackLink={false} sidePanel={shamirSidePanel}>
                <AuthCard
                    title="Collect recovery shares"
                    description={`Gather ${recoveryStatus.threshold} shares to recover your encryption key.`}
                >
                    {stepIndicator}
                    {/* Progress Section */}
                        <div className="space-y-4 mb-6">
                            <div className="flex items-center justify-between text-sm">
                                <h4 className="text-sm font-medium text-slate-300">Progress</h4>
                                <span className="text-white font-medium">
                                    {recoveryStatus.collected} / {recoveryStatus.threshold} shares
                                </span>
                            </div>
                            {/* Keyed by `collected` so each accepted share triggers a
                                single scale pulse — celebrates the micro-win without
                                animating the counter too. */}
                            <motion.div
                                key={recoveryStatus.collected}
                                initial={{ scale: 1 }}
                                animate={{ scale: [1, 1.03, 1] }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                            >
                                <Progress value={progress} className="h-2" />
                            </motion.div>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Clock className="w-3 h-3" />
                                <span>{formatTimeRemaining(recoveryStatus.expiresAt)}</span>
                            </div>
                        </div>

                        <div className="my-6 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

                        {/* Share Sources */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-slate-300">Share Sources</h4>

                            {/* Three sources, one palette — state is read from the icon hue
                                (slate = pending, violet = in flight, emerald = collected).
                                No per-source colour identity. */}

                            {/* Server Share */}
                            {(() => {
                                const collected =
                                    recoveryStatus.serverShareAvailable &&
                                    recoveryStatus.collectedIndices.includes(serverShare?.shareIndex ?? -1);
                                const iconColour = !recoveryStatus.serverShareAvailable
                                    ? 'text-slate-400'
                                    : collected
                                        ? 'text-emerald-400'
                                        : 'text-violet-300';
                                return (
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                                        <div className="flex items-center gap-3">
                                            <Server className={`w-5 h-5 ${iconColour}`} />
                                            <span className="text-sm">Server Share</span>
                                        </div>
                                        {recoveryStatus.serverShareAvailable ? (
                                            collected ? (
                                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                                            ) : (
                                                <Loader2 className="w-5 h-5 animate-spin text-violet-300" />
                                            )
                                        ) : (
                                            <XCircle className="w-5 h-5 text-slate-500" />
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Email Share */}
                            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                                <div className="flex items-center gap-3">
                                    <Mail className={`w-5 h-5 ${recoveryStatus.emailShareSent ? 'text-violet-300' : 'text-slate-400'}`} />
                                    <span className="text-sm">Email Share</span>
                                </div>
                                {recoveryStatus.emailShareSent ? (
                                    <span className="text-xs text-slate-400">Check email</span>
                                ) : (
                                    <XCircle className="w-5 h-5 text-slate-500" />
                                )}
                            </div>

                            {/* Trusted Contacts */}
                            {recoveryStatus.trustedContactsPending.length > 0 && (
                                <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                                    <div className="flex items-center gap-3">
                                        <Users className="w-5 h-5 text-violet-300" />
                                        <span className="text-sm">Trusted Contacts</span>
                                    </div>
                                    <span className="text-xs text-slate-400">
                                        {recoveryStatus.trustedContactsPending.length} pending
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="my-6 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

                        {/* External Share Input */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-slate-300">Paste a share</h4>
                            <AuthInput
                                id="external-share"
                                label="External share"
                                value={externalShareInput}
                                onChange={(e) => setExternalShareInput(e.target.value)}
                                placeholder="Paste share from QR code, email, or paper backup"
                                className="font-mono text-xs"
                                autoComplete="off"
                            />
                            <AuthButton
                                onClick={handleSubmitExternalShare}
                                disabled={!externalShareInput.trim() || isSubmittingShare}
                                isLoading={isSubmittingShare}
                                icon={<QrCode className="w-4 h-4" />}
                            >
                                Send share
                            </AuthButton>
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
            </AuthLayout>
        );
    }

    // SEC-002: OTP verification step — identity check before share retrieval
    if (step === "verify") {
        return (
            <AuthLayout showBackLink={false} sidePanel={shamirSidePanel}>
                <AuthCard
                    title="Verify your identity"
                    description="A verification code has been sent to your email. Enter it to continue recovery."
                >
                    {stepIndicator}
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        if (otp.length === 6) {
                            setStep("password");
                        }
                    }}>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
                                <Shield className="w-5 h-5 text-blue-500" />
                                <p className="text-sm text-blue-400">
                                    Check your email for a 6-digit verification code.
                                </p>
                            </div>
                            <AuthOTPInput
                                length={6}
                                value={otp}
                                onChange={setOtp}
                                variant="numeric"
                                autoFocus
                            />
                            <AuthButton
                                type="submit"
                                disabled={otp.length !== 6}
                                icon={<ArrowRight className="w-4 h-4" />}
                            >
                                Verify and continue
                            </AuthButton>
                            <button
                                type="button"
                                onClick={() => {
                                    requestOtpMutation.mutateAsync({ recoveryToken }).then(() => {
                                        toast.success("New verification code sent");
                                    }).catch(() => {
                                        toast.error("Failed to resend code");
                                    });
                                }}
                                className="w-full py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                                disabled={requestOtpMutation.isPending}
                            >
                                {requestOtpMutation.isPending ? "Sending…" : "Resend code"}
                            </button>
                        </div>
                    </form>
                </AuthCard>
            </AuthLayout>
        );
    }

    // Password step - set new password
    if (step === "password") {
        return (
            <AuthLayout showBackLink={false} sidePanel={shamirSidePanel}>
                <AuthCard
                    title="Set a new Encryption Password"
                    description="All shares collected. Create a new Encryption Password — your files will remain accessible."
                >
                    {stepIndicator}
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <p className="text-sm text-emerald-200">
                            Threshold reached — {recoveryStatus?.collected} shares collected.
                        </p>
                    </div>

                    <form onSubmit={handleCompleteRecovery} className="space-y-6">
                        <AuthPasswordPair
                            label="New Encryption Password"
                            confirmLabel="Confirm Encryption Password"
                            password={newPassword}
                            confirmPassword={confirmPassword}
                            onPasswordChange={setNewPassword}
                            onConfirmChange={setConfirmPassword}
                            passwordPlaceholder="Minimum 12 characters"
                            matchAffirmation
                            strengthSlot={<PasswordStrengthMeter password={newPassword} />}
                        />

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
                            Complete recovery
                        </AuthButton>
                    </form>
                </AuthCard>
            </AuthLayout>
        );
    }

    // Complete step - show recovery codes then success
    if (step === "complete") {
        return (
            <AuthLayout showBackLink={false} sidePanel={shamirSidePanel}>
                <AuthCard
                    title="Recovery complete"
                    description="Your Encryption Password has been reset."
                >
                    {stepIndicator}
                    <div className="space-y-6">
                        <div className="flex flex-col items-center gap-4 py-2">
                            <div className="p-4 rounded-full bg-emerald-500/15">
                                <Shield className="w-10 h-10 text-emerald-300" />
                            </div>
                        </div>

                        {recoveryCodes.length > 0 && !codesAcknowledged && (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-200/80">
                                        <p className="font-medium text-amber-200 mb-1">Save your recovery codes</p>
                                        <p>
                                            These codes can be used to reset your Encryption Password if you forget it.
                                            Each code can only be used once. Store them in a safe place.
                                        </p>
                                    </div>
                                </div>

                                <AuthRecoveryCodesGrid
                                    codes={recoveryCodes}
                                    onCopied={() => setHasInteractedWithCodes(true)}
                                    onDownloaded={() => setHasInteractedWithCodes(true)}
                                />

                                {!hasInteractedWithCodes && (
                                    <p className="text-xs text-amber-300/80 text-center -mt-2">
                                        Copy or download before continuing — these codes cannot be regenerated.
                                    </p>
                                )}

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="codes-saved"
                                        checked={codesAcknowledged}
                                        disabled={!hasInteractedWithCodes}
                                        onCheckedChange={(checked) =>
                                            setCodesAcknowledged(checked === true)
                                        }
                                        className="border-white/20 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500 data-[disabled]:opacity-40"
                                    />
                                    <label
                                        htmlFor="codes-saved"
                                        className={
                                            hasInteractedWithCodes
                                                ? 'text-sm text-slate-300 cursor-pointer select-none'
                                                : 'text-sm text-slate-500 cursor-not-allowed select-none'
                                        }
                                    >
                                        I&apos;ve saved my recovery codes — I understand they can&apos;t be regenerated
                                    </label>
                                </div>
                            </div>
                        )}

                        {(codesAcknowledged || recoveryCodes.length === 0) && (
                            <div className="space-y-4">
                                <p className="text-center text-sm text-slate-400">
                                    You can sign in with your new Encryption Password. Consider setting up
                                    new recovery shares in Settings.
                                </p>
                                <AuthButton onClick={() => setLocation("/auth/login")}>
                                    Go to sign in
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
