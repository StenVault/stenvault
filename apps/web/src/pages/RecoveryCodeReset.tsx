/**
 * Reset the master password using a recovery code.
 *
 * Flow:
 * 1. User enters 12-character recovery code
 * 2. Backend validates code (without consuming)
 * 3. If valid, show new password form
 * 4. User sets new Master Password
 * 5. Client generates new recovery codes
 * 6. Backend resets password and consumes the used code
 * 7. Show new recovery codes for user to save
 *
 * Security:
 * - Each recovery code can only be used once
 * - New codes are generated on every reset
 * - Zero-knowledge: password never sent to server
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Key,
    Lock,
    Eye,
    EyeOff,
    Loader2,
    CheckCircle2,
    ArrowRight,
    AlertTriangle,
    Copy,
    Check,
    Download,
    Shield,
} from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { Button } from '@stenvault/shared/ui/button';
import { Input } from '@stenvault/shared/ui/input';
import { Label } from '@stenvault/shared/ui/label';
import { Checkbox } from '@stenvault/shared/ui/checkbox';
import { toast } from '@stenvault/shared/lib/toast';
import { trpc } from '@/lib/trpc';
import { AuthLayout, AuthCard, AuthLink } from '@/components/auth';
import { generateRecoveryCodes, RECOVERY_CODE_LENGTH } from '@/lib/recoveryCodeUtils';
import { arrayBufferToBase64 } from '@stenvault/shared';
import { getPasswordStrengthUI } from '@/lib/passwordValidation';
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
    const setLocation = useNavigate();

    // State
    const [step, setStep] = useState<ResetStep>('code');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
    const [copiedAll, setCopiedAll] = useState(false);
    const [savedConfirmed, setSavedConfirmed] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    // Wrap returned by the server after successful code validation.
    // Used in step 2 to unwrap the original MK (preserving all user data).
    const [recoveryWrap, setRecoveryWrap] = useState<RecoveryWrap | null>(null);

    // Mutations
    const validateCodeMutation = trpc.encryption.validateRecoveryCode.useMutation();
    const resetMutation = trpc.encryption.resetWithRecoveryCode.useMutation();

    // Validation
    const passwordMinLength = 12;
    const passwordsMatch = password === confirmPassword;
    const passwordValid = password.length >= passwordMinLength;
    const canProceedPassword = passwordValid && passwordsMatch;

    const strength = getPasswordStrengthUI(password);

    // Step 1: Validate recovery code. On success, server returns the per-code wrap
    // so the client can unwrap the original Master Key in step 2.
    const handleValidateCode = async () => {
        if (recoveryCode.length !== RECOVERY_CODE_LENGTH) {
            toast.error(`Please enter a valid ${RECOVERY_CODE_LENGTH}-character recovery code`);
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
            toast.error('Missing recovery wrap. Please re-enter your code.');
            setStep('code');
            return;
        }

        setIsResetting(true);
        let masterKeyRaw: Uint8Array | null = null;

        try {
            // 1. Unwrap ORIGINAL MK using the recovery code + server-provided wrap.
            //    This is the dual-wrap entry point: the recovery code is real key material.
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
            //    AES-KW wrapKey (both the password re-wrap below and each recovery wrap)
            //    requires the source key to be extractable; the CryptoKey handle is
            //    safer to hold than raw bytes — cannot be exfiltrated without a live
            //    JS reference, which this function owns for its own lifetime.
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
            await resetMutation.mutateAsync({
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

            setNewRecoveryCodes(newCodesPlain);
            setStep('complete');
            toast.success('Master Password reset — your files are preserved.');
        } catch (error) {
            console.error('Reset failed:', error);
            toast.error('Failed to reset password. Please try again.');
        } finally {
            masterKeyRaw?.fill(0);
            setIsResetting(false);
        }
    };

    // Copy all recovery codes
    const handleCopyAll = async () => {
        const text = newRecoveryCodes.join('\n');
        await navigator.clipboard.writeText(text);
        setCopiedAll(true);
        toast.success('Recovery codes copied to clipboard');
        setTimeout(() => setCopiedAll(false), 3000);
    };

    // Download recovery codes as file
    const handleDownload = () => {
        const content = [
            '=== StenVault Recovery Codes ===',
            '',
            'Keep these codes in a safe place.',
            'Each code can only be used once.',
            '',
            ...newRecoveryCodes.map((code, i) => `${i + 1}. ${code}`),
            '',
            `Generated: ${new Date().toISOString()}`,
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stenvault-recovery-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Recovery codes downloaded');
    };

    // Complete setup
    const handleComplete = () => {
        if (!savedConfirmed) {
            toast.error('Please confirm you have saved the recovery codes');
            return;
        }
        setLocation('/auth/login');
    };

    return (
        <AuthLayout>
            <AuthCard
                title={
                    step === 'code' ? 'Recover Your Vault' :
                        step === 'password' ? 'Set New Password' :
                            'Save Your Recovery Codes'
                }
                description={
                    step === 'code' ? 'Enter a recovery code to reset your Master Password.' :
                        step === 'password' ? 'Choose a strong new Master Password.' :
                            'These new codes replace all previous ones.'
                }
            >
                {/* Step 1: Recovery Code Input */}
                {step === 'code' && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="recovery-code" className="text-slate-200">
                                Recovery Code
                            </Label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    id="recovery-code"
                                    type="text"
                                    value={recoveryCode}
                                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, RECOVERY_CODE_LENGTH))}
                                    placeholder={"X".repeat(RECOVERY_CODE_LENGTH)}
                                    className="pl-10 bg-slate-900/50 border-slate-600 text-white text-center text-xl tracking-widest font-mono placeholder:text-slate-500"
                                    maxLength={RECOVERY_CODE_LENGTH}
                                    autoFocus
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                Enter one of your 12-character recovery codes
                            </p>
                        </div>

                        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-200/80">
                                <p className="font-medium text-amber-200 mb-1">Important</p>
                                <p>This code will be consumed and cannot be used again.</p>
                            </div>
                        </div>

                        <Button
                            onClick={handleValidateCode}
                            disabled={recoveryCode.length !== RECOVERY_CODE_LENGTH || isValidating}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            {isValidating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <ArrowRight className="w-4 h-4 mr-2" />
                                    Continue
                                </>
                            )}
                        </Button>

                        <div className="text-center">
                            <AuthLink href="/auth/login" className="text-slate-500">
                                Back to sign in
                            </AuthLink>
                        </div>
                    </div>
                )}

                {/* Step 2: New Password */}
                {step === 'password' && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-200">
                                New Master Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter a strong password..."
                                    className="pl-10 pr-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Strength indicator */}
                            {password && (
                                <div className="space-y-1">
                                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={cn('h-full transition-all duration-300', strength.color)}
                                            style={{ width: strength.width }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Strength: <span className="font-medium">{strength.label}</span>
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm" className="text-slate-200">
                                Confirm Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    id="confirm"
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your password..."
                                    className={cn(
                                        'pl-10 pr-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500',
                                        confirmPassword && !passwordsMatch && 'border-red-500'
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {confirmPassword && !passwordsMatch && (
                                <p className="text-xs text-red-400">Passwords do not match</p>
                            )}
                        </div>

                        <Button
                            onClick={handleResetPassword}
                            disabled={!canProceedPassword || isResetting}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            {isResetting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4 mr-2" />
                                    Reset Password
                                </>
                            )}
                        </Button>

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
                                className="text-sm text-slate-500 hover:text-slate-400"
                            >
                                Back to recovery code
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: New Recovery Codes */}
                {step === 'complete' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-center py-2">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10">
                                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                            </div>
                        </div>

                        {/* Codes grid */}
                        <div className="grid grid-cols-2 gap-2">
                            {newRecoveryCodes.map((code, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2"
                                >
                                    <span className="text-slate-500 text-sm mr-2">{index + 1}.</span>
                                    <code data-testid="recovery-code" className="font-mono text-emerald-400 text-sm tracking-wider">{code}</code>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={handleCopyAll}
                                className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
                            >
                                {copiedAll ? (
                                    <Check className="w-4 h-4 mr-2 text-emerald-400" />
                                ) : (
                                    <Copy className="w-4 h-4 mr-2" />
                                )}
                                {copiedAll ? 'Copied!' : 'Copy All'}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleDownload}
                                className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Download
                            </Button>
                        </div>

                        {/* Warning */}
                        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-200/80">
                                <p className="font-medium text-red-200 mb-1">Save these codes now!</p>
                                <p>Your old recovery codes no longer work. Store these in a safe place.</p>
                            </div>
                        </div>

                        {/* Confirmation checkbox */}
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="confirm-saved"
                                checked={savedConfirmed}
                                onCheckedChange={(checked) => setSavedConfirmed(checked === true)}
                                className="border-slate-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                            <label
                                htmlFor="confirm-saved"
                                className="text-sm text-slate-300 cursor-pointer"
                            >
                                I have saved my recovery codes in a safe place
                            </label>
                        </div>

                        {/* Complete */}
                        <Button
                            onClick={handleComplete}
                            disabled={!savedConfirmed}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            Go to Login
                        </Button>
                    </div>
                )}
            </AuthCard>
        </AuthLayout>
    );
}
