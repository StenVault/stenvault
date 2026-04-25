/**
 * First-time Encryption Password setup (step 2 of the Register funnel).
 *
 * The client generates a 32-byte master key, derives a KEK from the user's
 * Encryption Password (Argon2id), wraps the master key with AES-KW, and
 * prints the one-time recovery codes. Nothing ever leaves the browser in
 * plaintext — the server sees only the wrapped-key bytes and the recovery
 * code HMACs.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, KeyRound, Users, RefreshCw, Lock, ShieldCheck } from 'lucide-react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useMasterKey } from '@/hooks/useMasterKey';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { getPasswordStrengthUI } from '@/lib/passwordValidation';
import {
    AuthLayout,
    AuthCard,
    AuthInput,
    AuthButton,
    AuthEyebrow,
    AuthStepIndicator,
    AuthPasswordPair,
    AuthRecoveryCodesGrid,
    AuthSidePanel,
    AuthLastCheckDialog,
} from '@/components/auth';
import { KeyRecedingMotif } from '@/components/auth/motifs/KeyRecedingMotif';
import { Checkbox } from '@stenvault/shared/ui/checkbox';
import { Button } from '@stenvault/shared/ui/button';
import { cn } from '@stenvault/shared/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@stenvault/shared/ui/dialog';
import { toast } from '@stenvault/shared/lib/toast';
import { trpc } from '@/lib/trpc';
import {
    generateAndStoreUES,
    exportUESForServer,
} from '@/lib/uesManager';
import { devLog, devWarn } from '@/lib/debugLogger';
import {
    getDeviceFingerprintHash,
    getDeviceName,
    getBrowserInfo,
} from '@/lib/deviceEntropy';

type SetupStep = 'password' | 'recovery' | 'complete';

export default function EncryptionSetup() {
    const setLocation = useNavigate();
    const { setupMasterKey, isDerivingKey, isConfigured, getCachedKey } = useMasterKey();

    const [step, setStep] = useState<SetupStep>('password');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordHint, setPasswordHint] = useState('');

    const [hybridKemError, setHybridKemError] = useState(false);
    // Surface the Fair-strength "Last check" confirmation at submit. Good or
    // stronger passwords skip it; Weak is already blocked by canProceed.
    const [showLastCheck, setShowLastCheck] = useState(false);

    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [savedConfirmed, setSavedConfirmed] = useState(false);
    // Friction gate: the "I've saved" checkbox stays inert until the user has
    // actually interacted with Copy or Download. A checkbox alone lets users
    // confirm what they didn't do; data loss on KEK is irreversible.
    const [hasInteractedWithCodes, setHasInteractedWithCodes] = useState(false);

    const passwordMinLength = 12;
    const passwordsMatch = password === confirmPassword;
    const passwordValid = password.length >= passwordMinLength;
    // Block the Seal CTA until strength reaches Fair (score 2). Weak passwords
    // that slip past the 12-char minimum still carry unrecoverable loss risk if
    // the user forgets them — the recovery codes are the only safety net and
    // they don't exist yet at this point.
    const strengthScore = password ? getPasswordStrengthUI(password).score : 0;
    const canProceed = passwordValid && passwordsMatch && strengthScore >= 2;

    const registerDeviceMutation = trpc.devices.registerTrustedDevice.useMutation();

    const handleSetup = async () => {
        if (!canProceed) return;

        try {
            const result = await setupMasterKey(password, passwordHint || undefined);
            if (result.success) {
                try {
                    const uesData = await generateAndStoreUES();
                    if (import.meta.env.DEV) devLog('[UES] Generated and stored locally');

                    const [fingerprint, deviceName, browserInfo] = await Promise.all([
                        getDeviceFingerprintHash(),
                        Promise.resolve(getDeviceName()),
                        Promise.resolve(getBrowserInfo()),
                    ]);

                    const cachedMasterKey = getCachedKey();
                    if (cachedMasterKey) {
                        const exported = await exportUESForServer(uesData.ues, cachedMasterKey);

                        await registerDeviceMutation.mutateAsync({
                            deviceFingerprint: fingerprint,
                            deviceName,
                            platform: 'web',
                            browserInfo,
                            uesEncrypted: exported.uesEncrypted,
                            uesEncryptionIv: exported.uesIv,
                        });

                        if (import.meta.env.DEV) devLog('[UES] Device registered as trusted');
                    } else {
                        if (import.meta.env.DEV) devWarn('[UES] Master Key not cached after setup, skipping device registration');
                    }
                } catch (uesError) {
                    if (import.meta.env.DEV) devWarn('[UES] Failed to setup UES (non-critical):', uesError);
                }

                setRecoveryCodes(result.recoveryCodesPlain);
                setStep('recovery');
            }
        } catch (err: any) {
            if (err?.code === 'HYBRID_KEM_UNAVAILABLE') {
                setHybridKemError(true);
            }
        }
    };

    // Strict equality on Fair (not `< 3`) makes the intent explicit: the tier
    // that passes the gate but deserves one second of doubt, nothing else.
    const requestSeal = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canProceed) return;
        if (strengthScore === 2) {
            setShowLastCheck(true);
            return;
        }
        handleSetup();
    };

    const handleComplete = () => {
        if (!savedConfirmed) {
            toast.error('Confirm you have saved the recovery codes');
            return;
        }
        setStep('complete');
    };

    // Act 3 hand-off: offer a contextual passkey invitation while the user is
    // still in security-mindset. Browsers without WebAuthn skip straight to the
    // vault so we never render the nudge screen just to bounce off it.
    const handleFinish = () => {
        if (browserSupportsWebAuthn()) {
            setLocation('/auth/passkey-setup');
        } else {
            setLocation('/');
        }
    };

    useEffect(() => {
        if (step === 'complete') return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [step]);

    useEffect(() => {
        if (isConfigured) {
            setLocation('/');
        }
    }, [isConfigured, setLocation]);

    if (isConfigured) {
        return null;
    }

    const title =
        step === 'password' ? 'Set your Encryption Password' :
            step === 'recovery' ? 'Your recovery codes' :
                'Your vault is sealed.';

    const description =
        step === 'password' ? (
            "Different from Sign-in. Save your recovery codes — we can't reset this one."
        ) : step === 'recovery' ? (
            "These 10 codes are your only way back if you forget your Encryption Password. We can't generate new ones for you."
        ) : (
            'Upload your first file to see the lock close.'
        );

    const encryptionSetupSidePanel = (
        <AuthSidePanel
            headline="This is the one we never see."
            motif={<KeyRecedingMotif />}
        />
    );

    return (
        <AuthLayout showBackLink={false} sidePanel={encryptionSetupSidePanel}>
            <AuthCard title={title} description={description as string}>
                {/* Step 1: Password — the Contract act. Eyebrow + outer funnel dots carry
                    the position; the old sub-step bars and Register-inherited Explainer
                    are gone (progressive disclosure). */}
                {step === 'password' && (
                    <div className="space-y-6 mt-6">
                        <div className="space-y-3">
                            <AuthEyebrow>Step 2 of 2 · Encryption</AuthEyebrow>
                            <AuthStepIndicator
                                variant="dots"
                                steps={[
                                    { icon: KeyRound, label: 'Sign-in' },
                                    { icon: Lock, label: 'Encryption' },
                                ]}
                                current={1}
                                srLabel="Funnel step 2 of 2: Encryption Password"
                            />
                        </div>

                        <form
                            onSubmit={requestSeal}
                            className="space-y-6"
                        >
                            <AuthPasswordPair
                                label="Encryption Password"
                                confirmLabel="Confirm Encryption Password"
                                password={password}
                                confirmPassword={confirmPassword}
                                onPasswordChange={setPassword}
                                onConfirmChange={setConfirmPassword}
                                passwordPlaceholder="Protects your files — different from Sign-in"
                                matchAffirmation
                                strengthSlot={<PasswordStrengthMeter password={password} />}
                            />

                            <div className="space-y-2">
                                <AuthInput
                                    id="hint"
                                    type="text"
                                    label="Password hint (optional)"
                                    value={passwordHint}
                                    onChange={(e) => setPasswordHint(e.target.value)}
                                    placeholder="Something only you would recognise"
                                    maxLength={255}
                                />
                                <p className="text-xs text-slate-400 ml-1">
                                    Shown on the unlock screen. Don&apos;t include the password itself.
                                </p>
                            </div>

                            <AuthButton
                                type="submit"
                                isLoading={isDerivingKey}
                                disabled={!canProceed}
                                loadingText="Deriving encryption key…"
                                icon={<Lock className="w-4 h-4" />}
                            >
                                Seal my files
                            </AuthButton>
                            <p className="text-xs text-slate-500 text-center -mt-2">
                                Next: 10 recovery codes.
                            </p>
                        </form>
                    </div>
                )}

                {/* Step 2: Recovery Codes */}
                {step === 'recovery' && (
                    <div className="space-y-6 mt-6">
                        <AuthEyebrow className="-mt-2">
                            Step 2 of 2 · Recovery
                        </AuthEyebrow>

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

                        {/* Concrete save-education: where to put them and where not. Screenshots
                            of recovery codes end up in iCloud/Google Photos and defeat the purpose;
                            teaching this out loud is senior-level defensive UX. */}
                        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-200/80">
                                <p className="font-medium text-amber-200 mb-1">Save these now</p>
                                <p>
                                    Password managers work best. Paper prints work too. Photos don&apos;t — they sync to places we don&apos;t control.
                                </p>
                            </div>
                        </div>

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
                                className={cn(
                                    'text-sm select-none',
                                    hasInteractedWithCodes
                                        ? 'text-slate-300 cursor-pointer'
                                        : 'text-slate-500 cursor-not-allowed'
                                )}
                            >
                                I&apos;ve saved my recovery codes — I understand they can&apos;t be regenerated
                            </label>
                        </div>

                        <AuthButton
                            onClick={handleComplete}
                            disabled={!savedConfirmed}
                            icon={<Check className="w-4 h-4" />}
                        >
                            Enter my vault
                        </AuthButton>
                    </div>
                )}

                {/* Step 3: Complete — one primary CTA, Shamir upsell as optional offer */}
                {step === 'complete' && (
                    <div className="space-y-6 mt-6">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15">
                                <ShieldCheck className="w-8 h-8 text-emerald-300" />
                            </div>
                        </div>

                        {/* Shamir upsell — violet subtle, not amber. The user just finished a
                            brand moment; a safety-net offer belongs in the invitation colour
                            (violet), not the irreversibility colour (amber). */}
                        <div className="flex items-start gap-3 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl text-left">
                            <Users className="w-5 h-5 text-violet-300 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-slate-300 space-y-2">
                                <p className="font-medium text-violet-200">Want a safety net?</p>
                                <p>Split your recovery among trusted contacts so no single person — including you — holds the full key.</p>
                                <button
                                    type="button"
                                    onClick={() => setLocation('/settings?tab=security')}
                                    className="inline-block origin-left text-[12px] font-bold text-violet-300 uppercase tracking-[0.2em] transition-[color,transform] duration-300 hover:text-violet-200 hover:scale-x-[1.03] mt-1"
                                >
                                    Set up Trusted Circle Recovery →
                                </button>
                            </div>
                        </div>

                        <AuthButton
                            onClick={handleFinish}
                            icon={<ArrowRight className="w-4 h-4" />}
                        >
                            Enter my vault
                        </AuthButton>
                    </div>
                )}
            </AuthCard>

            <AuthLastCheckDialog
                open={showLastCheck}
                onReview={() => setShowLastCheck(false)}
                onConfirm={() => {
                    setShowLastCheck(false);
                    handleSetup();
                }}
            />

            {/* Hybrid KEM Error Dialog — rare, kept as shared/ui Dialog */}
            <Dialog open={hybridKemError} onOpenChange={setHybridKemError}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            Setup Issue
                        </DialogTitle>
                        <DialogDescription>
                            We couldn&apos;t initialize your vault&apos;s encryption on this browser.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-400">This is usually a temporary issue. Try:</p>
                        <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300">
                            <li>Refresh the page and try again</li>
                            <li>Use a different browser (Chrome or Firefox)</li>
                            <li>Check your internet connection</li>
                        </ol>
                        <p className="text-xs text-slate-400">
                            Still not working? Contact support with code: HYBRID_KEM_UNAVAILABLE
                        </p>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Reload Page
                        </Button>
                        <Button onClick={() => setHybridKemError(false)}>
                            Try Again
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AuthLayout>
    );
}
