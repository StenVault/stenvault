/**
 * Reset the encryption password using a recovery code.
 *
 * Flow:
 * 1. User enters 12-character recovery code
 * 2. Backend validates code and returns its wrap (without consuming)
 * 3. If valid, show new password form
 * 4. Client unwraps original MK with code-derived KEK, re-wraps with new password-KEK
 * 5. Client generates new recovery codes + wraps; server stores atomically
 * 6. Show new recovery codes for user to save
 *
 * Security:
 * - Each recovery code can only be used once
 * - New codes are generated on every reset
 * - Zero-knowledge: password never sent to server
 * - Dual-wrap: MK bytes preserved → all files decryptable after reset
 */

import { useState, useEffect } from 'react';
import {
    Key,
    CheckCircle2,
    ArrowRight,
    AlertTriangle,
    Check,
    Lock,
} from 'lucide-react';
import { toast } from '@stenvault/shared/lib/toast';
import { Checkbox } from '@stenvault/shared/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import {
    AuthLayout,
    AuthCard,
    AuthButton,
    AuthLink,
    AuthStepIndicator,
    AuthPasswordPair,
    AuthRecoveryCodeInput,
    AuthRecoveryCodesGrid,
    AuthSidePanel,
} from '@/components/auth';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { generateRecoveryCodes, RECOVERY_CODE_LENGTH } from '@/lib/recoveryCodeUtils';
import { arrayBufferToBase64 } from '@stenvault/shared';
import {
    ARGON2_PARAMS,
    type Argon2Params,
    type RecoveryWrap,
} from '@stenvault/shared/platform/crypto';
import {
    deriveArgon2Key,
    generateRecoveryWrapsFromKey,
    unwrapMKFromRecoveryWrap,
    toArrayBuffer,
} from '@/hooks/masterKeyCrypto';

type ResetStep = 'code' | 'password' | 'complete';

export default function RecoveryCodeReset() {
    const { logout } = useAuth();

    const [step, setStep] = useState<ResetStep>('code');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
    const [savedConfirmed, setSavedConfirmed] = useState(false);
    // Friction gate — checkbox stays inert until the user has copied or downloaded.
    const [hasInteractedWithCodes, setHasInteractedWithCodes] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    // True only when the reset actually revoked existing Shamir shares (server decides).
    // Drives the step-3 copy: "your Trusted Circle was reset" vs generic safety-net nudge.
    const [shamirWasInvalidated, setShamirWasInvalidated] = useState(false);
    // Wrap returned by the server after successful code validation.
    // Used in step 2 to unwrap the original MK (preserving all user data).
    const [recoveryWrap, setRecoveryWrap] = useState<RecoveryWrap | null>(null);

    const validateCodeMutation = trpc.encryption.validateRecoveryCode.useMutation();
    const resetMutation = trpc.encryption.resetWithRecoveryCode.useMutation();

    const passwordMinLength = 12;
    const passwordsMatch = password === confirmPassword;
    const passwordValid = password.length >= passwordMinLength;
    const canProceedPassword = passwordValid && passwordsMatch;

    // Step 1: Validate recovery code. On success, server returns the per-code wrap
    // so the client can unwrap the original Master Key in step 2.
    const handleValidateCode = async () => {
        if (recoveryCode.length !== RECOVERY_CODE_LENGTH) {
            toast.error(`Enter a valid ${RECOVERY_CODE_LENGTH}-character recovery code`);
            return;
        }

        setIsValidating(true);
        try {
            const result = await validateCodeMutation.mutateAsync({
                recoveryCode: recoveryCode.toUpperCase(),
            });

            if (result.isValid && result.wrap) {
                setRecoveryWrap(result.wrap);
                setStep('password');
                toast.success('Recovery code verified');
            } else {
                toast.error('Invalid or already used recovery code');
            }
        } catch {
            toast.error('Failed to validate recovery code');
        } finally {
            setIsValidating(false);
        }
    };

    // Step 2: Reset password — unwrap the ORIGINAL Master Key with the recovery code's
    // Argon2id-derived KEK, then re-wrap with the new password-KEK and emit fresh per-code
    // wraps for a new set of recovery codes. The MK bytes are preserved → all hybrid
    // keypairs, file keys, filenames remain decryptable.
    const handleResetPassword = async () => {
        if (!canProceedPassword) return;
        if (!recoveryWrap) {
            toast.error('Missing recovery wrap. Re-enter your code.');
            setStep('code');
            return;
        }

        setIsResetting(true);
        let masterKeyRaw: Uint8Array | null = null;

        try {
            // 1. Unwrap ORIGINAL MK using the recovery code + server-provided wrap.
            masterKeyRaw = await unwrapMKFromRecoveryWrap(
                recoveryWrap,
                recoveryCode.toUpperCase()
            );

            // 2. Generate new password-KEK: fresh salt + Argon2id(newPassword, salt).
            const salt = crypto.getRandomValues(new Uint8Array(32));
            const saltBase64 = arrayBufferToBase64(salt.buffer as ArrayBuffer);
            const argon2Params: Argon2Params = {
                type: 'argon2id' as const,
                memoryCost: ARGON2_PARAMS.memoryCost,
                timeCost: ARGON2_PARAMS.timeCost,
                parallelism: ARGON2_PARAMS.parallelism,
                hashLength: ARGON2_PARAMS.hashLength,
            };
            const kek = await deriveArgon2Key(password, salt, argon2Params);

            // 3. Import MK once as extractable AES-GCM, then zero the raw bytes.
            const mkKey = await crypto.subtle.importKey(
                'raw',
                toArrayBuffer(masterKeyRaw),
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            masterKeyRaw.fill(0);
            masterKeyRaw = null;

            // 4. Re-wrap the SAME MK with the new password-KEK.
            const wrappedMasterKey = await crypto.subtle.wrapKey(
                'raw',
                mkKey,
                kek,
                'AES-KW'
            );
            const masterKeyEncryptedB64 = arrayBufferToBase64(wrappedMasterKey);

            // 5. Generate 10 fresh recovery codes + per-code wraps (aligned to the same MK CryptoKey).
            const newCodesPlain = generateRecoveryCodes();
            const newRecoveryWraps = await generateRecoveryWrapsFromKey(
                mkKey,
                newCodesPlain,
                argon2Params
            );

            // 6. Send reset request to backend. Server atomically replaces password-salt,
            //    wrappedMK, recovery-code hashes, and recovery wraps.
            const result = await resetMutation.mutateAsync({
                recoveryCode: recoveryCode.toUpperCase(),
                newPbkdf2Salt: saltBase64,
                newRecoveryCodes: newCodesPlain,
                masterKeyEncrypted: masterKeyEncryptedB64,
                recoveryWraps: newRecoveryWraps,
                argon2Params: {
                    type: 'argon2id' as const,
                    memoryCost: argon2Params.memoryCost,
                    timeCost: argon2Params.timeCost,
                    parallelism: argon2Params.parallelism,
                    hashLength: argon2Params.hashLength,
                },
            });

            setShamirWasInvalidated(Boolean(result.shamirSharesInvalidated));
            setNewRecoveryCodes(newCodesPlain);
            setStep('complete');
            toast.success('Encryption Password reset — your files are preserved.');
        } catch (error) {
            console.error('Reset failed:', error);
            toast.error('Failed to reset password. Try again.');
        } finally {
            masterKeyRaw?.fill(0);
            setIsResetting(false);
        }
    };

    // Backend revokes every session on successful reset (securityStamp rotated + Redis blocklist).
    // Use the full logout() path so the browser hard-redirects to /auth/login, destroying TanStack
    // cache — otherwise the stale getEncryptionConfig would make the new KEK look broken until a
    // manual refresh, and that refresh would land the user in the same kick-out mid-session.
    const handleComplete = async () => {
        if (!savedConfirmed) {
            toast.error('Confirm you have saved the recovery codes');
            return;
        }
        setIsLoggingOut(true);
        toast.success('Encryption Password reset. Sign in with your new password.');
        try {
            await logout();
        } catch {
            setIsLoggingOut(false);
        }
    };

    // Hand off to Settings → Security after sign-in. Reuses the same post-login
    // redirect channel AuthGuard already relies on (sessionStorage['stenvault_return_url']),
    // so the user logs out cleanly, authenticates with the new Encryption Password, and
    // lands directly on the Shamir section. Clicking "Set up Trusted Circle" without
    // this handshake would open Settings mid-kick-out and 401 before the user could act.
    const handleTrustedCircleHandoff = async () => {
        if (!savedConfirmed) return;
        sessionStorage.setItem('stenvault_return_url', '/settings?tab=security');
        setIsLoggingOut(true);
        toast.success('Sign in with your new password to set up your Trusted Circle.');
        try {
            await logout();
        } catch {
            setIsLoggingOut(false);
        }
    };

    // Same shape as EncryptionSetup — once the user has new codes on screen
    // in step 3 the guard would do more harm than good (block the CTA),
    // so the handler only runs while there's work in progress to lose.
    useEffect(() => {
        if (step === 'complete') return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [step]);

    const stepIndex = (['code', 'password', 'complete'] as const).indexOf(step);

    const recoveryCodeResetSidePanel = (
        <AuthSidePanel headline="A recovery code. A new seal. Files intact." />
    );

    return (
        <AuthLayout
            showBackLink={step !== 'complete'}
            backLinkUrl="/home"
            backLinkText="Back to vault"
            sidePanel={recoveryCodeResetSidePanel}
        >
            <AuthCard
                title={
                    step === 'code' ? 'Recover your files' :
                        step === 'password' ? 'Set a new Encryption Password' :
                            'Save your new recovery codes'
                }
                description={
                    step === 'code' ? 'Enter a recovery code.' :
                        step === 'password' ? 'Set your new Encryption Password.' :
                            'These new codes replace all previous ones — the old ones stop working now.'
                }
            >
                <AuthStepIndicator
                    variant="bars"
                    steps={[
                        { icon: Key, label: 'Recovery Code' },
                        { icon: Lock, label: 'New Password' },
                        { icon: Key, label: 'New Codes' },
                    ]}
                    current={stepIndex}
                    srLabel={`Recovery reset, step ${stepIndex + 1} of 3`}
                    className="mb-2"
                />

                {/* Step 1: Recovery Code Input */}
                {step === 'code' && (
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleValidateCode(); }}
                        className="space-y-6"
                    >
                        <AuthRecoveryCodeInput
                            length={RECOVERY_CODE_LENGTH}
                            value={recoveryCode}
                            onChange={setRecoveryCode}
                            helperText="Enter one of your 12-character recovery codes"
                            autoFocus
                        />

                        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-200/80">
                                <p className="font-medium text-amber-200 mb-1">Important</p>
                                <p>This code will be consumed and cannot be used again.</p>
                            </div>
                        </div>

                        <AuthButton
                            type="submit"
                            isLoading={isValidating}
                            disabled={recoveryCode.length !== RECOVERY_CODE_LENGTH}
                            icon={<ArrowRight className="w-4 h-4" />}
                        >
                            Verify this code
                        </AuthButton>

                        <div className="text-center">
                            <AuthLink href="/home" className="text-slate-500">
                                Back to unlock vault
                            </AuthLink>
                        </div>
                    </form>
                )}

                {/* Step 2: New Password */}
                {step === 'password' && (
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }}
                        className="space-y-6"
                    >
                        <AuthPasswordPair
                            label="New Encryption Password"
                            confirmLabel="Confirm Encryption Password"
                            password={password}
                            confirmPassword={confirmPassword}
                            onPasswordChange={setPassword}
                            onConfirmChange={setConfirmPassword}
                            passwordPlaceholder="Minimum 12 characters"
                            matchAffirmation
                            strengthSlot={<PasswordStrengthMeter password={password} />}
                        />

                        <AuthButton
                            type="submit"
                            isLoading={isResetting}
                            disabled={!canProceedPassword}
                            icon={<Lock className="w-4 h-4" />}
                        >
                            Set new Encryption Password
                        </AuthButton>

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setStep('code');
                                    // Drop any in-progress reset state so a later attempt
                                    // can't silently reuse a stale wrap / password pair.
                                    setRecoveryWrap(null);
                                    setPassword('');
                                    setConfirmPassword('');
                                }}
                                className="text-sm text-slate-500 hover:text-slate-400 transition-colors"
                            >
                                Back to recovery code
                            </button>
                        </div>
                    </form>
                )}

                {/* Step 3: New Recovery Codes */}
                {step === 'complete' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-center py-2">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15">
                                <CheckCircle2 className="w-6 h-6 text-emerald-300" />
                            </div>
                        </div>

                        <AuthRecoveryCodesGrid
                            codes={newRecoveryCodes}
                            onCopied={() => setHasInteractedWithCodes(true)}
                            onDownloaded={() => setHasInteractedWithCodes(true)}
                        />

                        {!hasInteractedWithCodes && (
                            <p className="text-xs text-amber-300/80 text-center -mt-2">
                                Copy or download before continuing — these codes cannot be regenerated.
                            </p>
                        )}

                        {/* Trust signal — dual-wrap recovery means the master key bytes were
                            preserved across the reset, so every encrypted file and every
                            existing share is still reachable with the new password. Saying
                            this out loud is the one place the moat reaches user-facing copy. */}
                        <p className="text-xs text-slate-400 text-center">
                            Your original files and shares stay intact — only the code rotated.
                        </p>

                        {/* Consolidated warning — old codes invalidated AND every session revoked on
                            the server (see resetWithRecoveryCode at encryptionRouter.ts:574). Amber
                            matches the step-1 warning palette so the flow reads as one surface. */}
                        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-200/80">
                                <p className="font-medium text-amber-200 mb-1">Save these codes and sign in again</p>
                                <p>Your old recovery codes no longer work. For your safety, every device has been signed out — sign in with your new Encryption Password to continue.</p>
                            </div>
                        </div>

                        {/* Confirmation checkbox */}
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="confirm-saved"
                                checked={savedConfirmed}
                                disabled={!hasInteractedWithCodes}
                                onCheckedChange={(checked) => setSavedConfirmed(checked === true)}
                                className="border-white/20 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500 data-[disabled]:opacity-40"
                            />
                            <label
                                htmlFor="confirm-saved"
                                className={
                                    hasInteractedWithCodes
                                        ? 'text-sm text-slate-300 cursor-pointer select-none'
                                        : 'text-sm text-slate-500 cursor-not-allowed select-none'
                                }
                            >
                                I&apos;ve saved my recovery codes — I understand they can&apos;t be regenerated
                            </label>
                        </div>

                        {/* Complete */}
                        <AuthButton
                            onClick={handleComplete}
                            disabled={!savedConfirmed}
                            isLoading={isLoggingOut}
                            loadingText="Signing out…"
                            icon={<Check className="w-4 h-4" />}
                        >
                            Sign in with new password
                        </AuthButton>

                        {/* Surfaces only after the user has confirmed saving the codes.
                            A premature click here would navigate away and orphan the
                            one-time codes (they cannot be regenerated). Copy is
                            context-aware: if the reset wiped an existing Trusted Circle
                            (server-reported via shamirSharesInvalidated), the user
                            deserves to know it was reset — not a generic pitch. */}
                        {savedConfirmed && (
                            <p className="text-xs text-slate-500 text-center">
                                {shamirWasInvalidated ? (
                                    <>
                                        Your Trusted Circle was reset for your safety —{' '}
                                        <button
                                            type="button"
                                            onClick={handleTrustedCircleHandoff}
                                            disabled={isLoggingOut}
                                            className="text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline"
                                        >
                                            set it up again in Settings
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        Want a safety net?{' '}
                                        <button
                                            type="button"
                                            onClick={handleTrustedCircleHandoff}
                                            disabled={isLoggingOut}
                                            className="text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline"
                                        >
                                            Set up Trusted Circle Recovery in Settings
                                        </button>
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                )}
            </AuthCard>
        </AuthLayout>
    );
}
