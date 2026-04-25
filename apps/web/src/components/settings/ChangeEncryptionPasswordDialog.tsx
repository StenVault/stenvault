/**
 * Change Encryption Password dialog.
 *
 * One opt-in: `rotateRecoveryInfrastructure` also regenerates recovery
 * codes and invalidates any active Shamir config. Sessions on other
 * devices are always revoked; THIS session is always preserved so the
 * dialog flow can complete in its surface of origin. A separate "Log
 * out everywhere" action in Settings handles the explicit-panic case.
 *
 * Rationale: re-encrypting the whole vault to rotate the Master Key is
 * infeasible at scale, so the MK bytes are preserved and only the envelope
 * (KEK + recovery wraps) is rotated. Recovery codes and Shamir config are
 * preserved by default because they already wrap the same MK and stay
 * valid — forcing a nuclear rotation punishes hygiene-only changes.
 *
 * Crypto flow is purely client-side — MK bytes never leave the browser.
 * Current password verification is implicit via AES-KW unwrap: wrong
 * password throws OperationError (RFC 3394 integrity check).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowLeft,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    ShieldCheck,
    Users,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { Button } from '@stenvault/shared/ui/button';
import { Input } from '@stenvault/shared/ui/input';
import { Label } from '@stenvault/shared/ui/label';
import { Checkbox } from '@stenvault/shared/ui/checkbox';
import { toast } from '@stenvault/shared/lib/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@stenvault/shared/utils';

import { trpc } from '@/lib/trpc';
import { clearMasterKeyCache } from '@/hooks/useMasterKey';
import {
    deriveRawMasterKeyBytes,
    deriveArgon2Key,
    generateRecoveryWrapsFromKey,
    toArrayBuffer,
} from '@/hooks/masterKeyCrypto';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/platform';
import { generateRecoveryCodes } from '@/lib/recoveryCodeUtils';
import { getDeviceFingerprintHash } from '@/lib/deviceEntropy';
import { ARGON2_PARAMS, type Argon2Params } from '@stenvault/shared/platform/crypto';
import { getPasswordStrengthUI } from '@/lib/passwordValidation';
import { RecoveryCodesSaveStep } from './RecoveryCodesSaveStep';

interface ChangeEncryptionPasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Step = 'confirm' | 'new' | 'codes' | 'shamir' | 'done';

const MIN_PASSWORD_LENGTH = 12;

export function ChangeEncryptionPasswordDialog({
    open,
    onOpenChange,
}: ChangeEncryptionPasswordDialogProps) {
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    // Step machine
    const [step, setStep] = useState<Step>('confirm');

    // Form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [newHint, setNewHint] = useState('');
    const [rotateRecovery, setRotateRecovery] = useState(false);

    // Crypto state carried across steps. The MK is held as an extractable
    // AES-KW CryptoKey between "confirm" and "new" so we can rewrap it
    // against the new KEK + (optionally) rewrap per recovery code. It is
    // zeroed/dropped in resetAll().
    const [mkKey, setMkKey] = useState<CryptoKey | null>(null);

    // Results from the server, surfaced in the 'codes' and 'shamir' steps.
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [shamirWasReset, setShamirWasReset] = useState(false);

    // UI state
    const [busy, setBusy] = useState(false);
    const [codesSavedConfirmed, setCodesSavedConfirmed] = useState(false);

    const encryptionConfig = trpc.encryption.getEncryptionConfig.useQuery(
        undefined,
        { enabled: open },
    );
    const masterKeyStatus = trpc.encryption.getMasterKeyStatus.useQuery(
        undefined,
        { enabled: open },
    );
    const changeMutation = trpc.encryption.changeMasterPassword.useMutation();

    const resetAll = () => {
        setStep('confirm');
        setCurrentPassword('');
        setShowCurrent(false);
        setNewPassword('');
        setConfirmPassword('');
        setShowNew(false);
        setNewHint('');
        setRotateRecovery(false);
        setMkKey(null);
        setGeneratedCodes([]);
        setShamirWasReset(false);
        setCodesSavedConfirmed(false);
        setBusy(false);
    };

    useEffect(() => {
        if (!open) resetAll();
    }, [open]);

    // 'confirm' — verify current password locally (AES-KW unwrap).

    const handleConfirmCurrent = async () => {
        if (!currentPassword) {
            toast.error('Enter your current Encryption Password');
            return;
        }
        if (!encryptionConfig.data?.isConfigured) {
            toast.error('Encryption not configured');
            return;
        }
        const cfg = encryptionConfig.data;
        if (!cfg.salt || !cfg.argon2Params || !cfg.masterKeyEncrypted) {
            toast.error('Encryption configuration not loaded. Please try again.');
            return;
        }

        setBusy(true);
        try {
            const saltBytes = new Uint8Array(base64ToArrayBuffer(cfg.salt));
            const mkRaw = await deriveRawMasterKeyBytes(
                currentPassword,
                saltBytes,
                cfg.argon2Params as Argon2Params,
                cfg.masterKeyEncrypted,
            );
            try {
                // Import as extractable AES-KW so the "new" step can both
                // rewrap with the new KEK AND (on opt-in) rewrap per
                // recovery code without re-deriving raw bytes.
                const extractable = await crypto.subtle.importKey(
                    'raw',
                    toArrayBuffer(mkRaw),
                    { name: 'AES-KW', length: 256 },
                    true,
                    ['wrapKey', 'unwrapKey'],
                );
                setMkKey(extractable);
                setStep('new');
            } finally {
                mkRaw.fill(0);
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'OperationError') {
                toast.error('Incorrect Encryption Password');
            } else {
                // eslint-disable-next-line no-console
                console.error('deriveRawMasterKeyBytes failed', err);
                toast.error('Could not verify your password. Please try again.');
            }
        } finally {
            setBusy(false);
        }
    };

    // 'new' — collect the new password and rotation choices, then rewrap.

    const newPasswordOk =
        newPassword.length >= MIN_PASSWORD_LENGTH &&
        newPassword === confirmPassword &&
        newPassword !== currentPassword;
    const passwordStrength = newPassword ? getPasswordStrengthUI(newPassword) : null;

    const handleSave = async () => {
        if (!mkKey) {
            toast.error('Please confirm your current password first.');
            setStep('confirm');
            return;
        }
        if (!newPasswordOk) {
            if (newPassword === currentPassword) {
                toast.error('New password must differ from the current one.');
            } else if (newPassword !== confirmPassword) {
                toast.error('Passwords do not match.');
            } else {
                toast.error(`Minimum ${MIN_PASSWORD_LENGTH} characters.`);
            }
            return;
        }

        setBusy(true);
        try {
            // 1. New Argon2id KEK + salt
            const newSalt = crypto.getRandomValues(new Uint8Array(32));
            const newKek = await deriveArgon2Key(newPassword, newSalt, ARGON2_PARAMS);

            // 2. Rewrap the SAME MK with the new KEK
            const wrappedBuf = await crypto.subtle.wrapKey('raw', mkKey, newKek, 'AES-KW');
            const masterKeyEncrypted = arrayBufferToBase64(wrappedBuf);

            // 3. Opt-in: new recovery codes + wraps against the same MK
            let newRecoveryCodes: string[] | undefined;
            let recoveryWraps: Awaited<ReturnType<typeof generateRecoveryWrapsFromKey>> | undefined;
            if (rotateRecovery) {
                newRecoveryCodes = generateRecoveryCodes();
                recoveryWraps = await generateRecoveryWrapsFromKey(
                    mkKey,
                    newRecoveryCodes,
                    ARGON2_PARAMS,
                );
            }

            // 4. Fingerprint this device so the backend can re-sign tokens
            // scoped to it while revoking every other session.
            const currentDeviceFingerprint = await getDeviceFingerprintHash();

            // 5. Call mutation
            const result = await changeMutation.mutateAsync({
                newPbkdf2Salt: arrayBufferToBase64(toArrayBuffer(newSalt)),
                newPasswordHint: newHint || undefined,
                masterKeyEncrypted,
                argon2Params: ARGON2_PARAMS,
                rotateRecoveryInfrastructure: rotateRecovery,
                keepCurrentSession: true,
                currentDeviceFingerprint,
                newRecoveryCodes,
                recoveryWraps,
            });

            // Drop the MK from component state — the cached bundle in
            // useMasterKey is separately cleared in the done step.
            setMkKey(null);

            setGeneratedCodes(newRecoveryCodes ?? []);
            setShamirWasReset(!!result.shamirSharesInvalidated);

            // Dependent sections (RecoveryCodesSection, ShamirRecoverySection,
            // EncryptionPasswordSection) were fetched before the rotation and
            // would otherwise show stale counts/state until the next hard
            // refresh. Safe because this session survives the mutation.
            void utils.encryption.getMasterKeyStatus.invalidate();
            void utils.encryption.getEncryptionConfig.invalidate();
            if (rotateRecovery) {
                void utils.shamirRecovery.getStatus.invalidate();
            }

            // Advance: codes → (maybe) shamir → done
            if (rotateRecovery) {
                setStep('codes');
            } else {
                setStep('done');
            }
        } catch (err: unknown) {
            // eslint-disable-next-line no-console
            console.error('changeMasterPassword failed', err);
            const message = err instanceof Error ? err.message : 'Failed to change password';
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    // 'codes' is fully rendered by the shared <RecoveryCodesSaveStep>
    // below — copy/download/confirmation live in that component.

    const handleAfterCodes = () => {
        if (shamirWasReset) {
            setStep('shamir');
        } else {
            setStep('done');
        }
    };

    // 'shamir' — reset notice; only reachable when the user opted in AND
    // they had an active Shamir config before the change.

    const handleSetupShamirLater = () => setStep('done');
    const handleSetupShamirNow = () => {
        // The /settings?setup=shamir query param is picked up by
        // ShamirRecoverySection to auto-open its setup dialog.
        setStep('done');
        onOpenChange(false);
        navigate('/settings?section=security&setup=shamir');
    };

    // 'done' — terminal screen. Locks the cached MK bundle so the
    // VaultUnlockModal prompts for the new password; device-wrapped
    // MK + UES stay intact so the trusted-device fast path still
    // works after the user re-enters the new password.

    const handleDone = () => {
        clearMasterKeyCache();
        onOpenChange(false);
    };

    // ============ Render ============

    const isCodesStep = step === 'codes';
    const canSubmitNew = newPasswordOk && !busy;

    // Crypto flow: accidental dismiss costs the user their typed password.
    // Block every implicit close (backdrop click + ESC). The user still has
    // the Cancel button and the "X" in the top-right for explicit intent.
    const blockImplicitClose = (event: Event) => {
        event.preventDefault();
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                onOpenChange(next);
            }}
        >
            <DialogContent
                className={cn(
                    // Scroll-safe 3-zone layout: header + footer stay pinned,
                    // middle zone scrolls when the body exceeds the viewport.
                    'flex flex-col gap-0 p-0 max-h-[90vh]',
                    isCodesStep ? 'max-w-2xl' : 'max-w-md',
                )}
                onPointerDownOutside={blockImplicitClose}
                onInteractOutside={blockImplicitClose}
                onEscapeKeyDown={blockImplicitClose}
            >
                {step === 'confirm' && (
                    <>
                        <div className="px-6 pt-6 pb-3 shrink-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Lock className="w-5 h-5" />
                                    Confirm your current password
                                </DialogTitle>
                                <DialogDescription>
                                    We verify it on this device — it never leaves the browser.
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0">
                            <div className="space-y-2">
                                <Label htmlFor="current-encryption-password">Current Encryption Password</Label>
                                <div className="relative">
                                    <Input
                                        id="current-encryption-password"
                                        type={showCurrent ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Your current Encryption Password"
                                        className="pr-10"
                                        disabled={busy}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label={showCurrent ? 'Hide password' : 'Show password'}
                                    >
                                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 pb-6 pt-3 border-t border-border/50 shrink-0">
                            <DialogFooter>
                                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleConfirmCurrent}
                                    disabled={!currentPassword || busy || !encryptionConfig.data?.isConfigured}
                                >
                                    {busy ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Verifying…
                                        </>
                                    ) : (
                                        'Continue'
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                )}

                {step === 'new' && (
                    <>
                        <div className="px-6 pt-6 pb-3 shrink-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Lock className="w-5 h-5" />
                                    Choose a new password
                                </DialogTitle>
                                <DialogDescription>
                                    Your Master Key and files stay encrypted — only the password that wraps them changes.
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="new-encryption-password">New Encryption Password</Label>
                                <div className="relative">
                                    <Input
                                        id="new-encryption-password"
                                        type={showNew ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                                        className="pr-10"
                                        disabled={busy}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label={showNew ? 'Hide password' : 'Show password'}
                                    >
                                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {passwordStrength && newPassword.length >= 4 && (
                                    <p className="text-xs text-muted-foreground">
                                        Strength: <span className="font-medium">{passwordStrength.label}</span>
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirm-encryption-password">Confirm new password</Label>
                                <Input
                                    id="confirm-encryption-password"
                                    type={showNew ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter the new password"
                                    disabled={busy}
                                />
                                {confirmPassword && newPassword !== confirmPassword && (
                                    <p className="text-sm text-red-500">Passwords do not match</p>
                                )}
                                {newPassword && newPassword === currentPassword && (
                                    <p className="text-sm text-red-500">
                                        New password must differ from the current one
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="new-encryption-hint">Password hint (optional)</Label>
                                <Input
                                    id="new-encryption-hint"
                                    value={newHint}
                                    onChange={(e) => setNewHint(e.target.value)}
                                    placeholder="A hint only you will understand"
                                    maxLength={255}
                                    disabled={busy}
                                />
                            </div>

                            <div className="rounded-lg border border-border p-3 space-y-3">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="rotate-recovery"
                                        checked={rotateRecovery}
                                        onCheckedChange={(checked) => setRotateRecovery(checked === true)}
                                        disabled={busy}
                                    />
                                    <div className="space-y-1 leading-snug">
                                        <label
                                            htmlFor="rotate-recovery"
                                            className="text-sm font-medium cursor-pointer"
                                        >
                                            Also replace recovery codes and Trusted Circle
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                            You&apos;ll see new recovery codes next. Your Trusted Circle will need to be rebuilt.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* After a rotation this device stays signed in (so the user
                                can copy new recovery codes before leaving); every other
                                session / trusted device is revoked server-side. A separate
                                "Log out everywhere" action lives in Settings for the
                                explicit panic-button case — it is never combined with a
                                password change. */}
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                <p className="text-sm text-muted-foreground leading-snug">
                                    You&apos;ll re-enter the new Encryption Password to unlock the vault on this device.
                                    Other sessions and trusted devices are signed out.
                                </p>
                            </div>
                        </div>

                        <div className="px-6 pb-6 pt-3 border-t border-border/50 shrink-0">
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        // Drop the extractable MK so the user
                                        // is forced to re-derive from password
                                        // if they come back to this step.
                                        // Minimises DevTools exposure window.
                                        setMkKey(null);
                                        setStep('confirm');
                                    }}
                                    disabled={busy}
                                >
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>
                                <Button onClick={handleSave} disabled={!canSubmitNew}>
                                    {busy ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving…
                                        </>
                                    ) : (
                                        'Save password'
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                )}

                {step === 'codes' && (
                    <>
                        <div className="px-6 pt-6 pb-3 shrink-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-green-600" />
                                    Save your new recovery codes
                                </DialogTitle>
                                <DialogDescription>
                                    Your old codes no longer work. Keep these in a safe place — each works once.
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0">
                            <RecoveryCodesSaveStep
                                codes={generatedCodes}
                                confirmed={codesSavedConfirmed}
                                onConfirmedChange={setCodesSavedConfirmed}
                            />
                        </div>

                        <div className="px-6 pb-6 pt-3 border-t border-border/50 shrink-0">
                            <DialogFooter>
                                <Button onClick={handleAfterCodes} disabled={!codesSavedConfirmed} className="w-full">
                                    Continue
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                )}

                {step === 'shamir' && (
                    <>
                        <div className="px-6 pt-6 pb-3 shrink-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Your Trusted Circle was reset
                                </DialogTitle>
                                <DialogDescription>
                                    Because you rotated your recovery infrastructure, the Shamir shares you distributed
                                    are no longer accepted. You can set up a fresh Trusted Circle now or later.
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0">
                            <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>No recovery via Trusted Circle until you set it up again</AlertTitle>
                                <AlertDescription>
                                    Your recovery codes still work as a fallback.
                                </AlertDescription>
                            </Alert>
                        </div>

                        <div className="px-6 pb-6 pt-3 border-t border-border/50 shrink-0">
                            <DialogFooter>
                                <Button variant="outline" onClick={handleSetupShamirLater}>
                                    Skip for now
                                </Button>
                                <Button onClick={handleSetupShamirNow}>Set up now</Button>
                            </DialogFooter>
                        </div>
                    </>
                )}

                {step === 'done' && (
                    <>
                        <div className="px-6 pt-6 pb-3 shrink-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-green-600" />
                                    Encryption password changed
                                </DialogTitle>
                                <DialogDescription>
                                    We locked the vault on this device. Unlock with your new Encryption Password to continue.
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <div className="px-6 pb-6 pt-3 border-t border-border/50 shrink-0">
                            <DialogFooter>
                                <Button onClick={handleDone} className="w-full">
                                    Unlock vault
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default ChangeEncryptionPasswordDialog;
