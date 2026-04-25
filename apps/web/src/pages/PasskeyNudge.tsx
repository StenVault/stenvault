/**
 * Post-Encryption-Setup passkey invitation. Shown once per account between
 * the sealed-vault moment and the first `/home` visit. The registration flow
 * mirrors Settings > PasskeysSection — same router procedures, same
 * @simplewebauthn/browser client — but stripped of the dialog chrome so it
 * reads as a single-purpose screen.
 *
 * The nudge is one-shot: whether the user enables a passkey or clicks
 * "Not now", the server flips `users.passkeyNudgeDismissed` to true and the
 * page auto-redirects on any future visit.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { AuthLayout, AuthCard, AuthButton, AuthSidePanel } from '@/components/auth';

export default function PasskeyNudge() {
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const { data: user, isLoading: userLoading } = trpc.auth.me.useQuery();
    const { data: passkeys, isLoading: passkeysLoading } = trpc.passkeys.list.useQuery();
    const generateRegOptionsMutation = trpc.passkeys.generateRegistrationOptions.useMutation();
    const verifyRegMutation = trpc.passkeys.verifyRegistration.useMutation();
    const dismissNudgeMutation = trpc.passkeys.dismissNudge.useMutation();

    const [isEnabling, setIsEnabling] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    // Bail out silently on any signal that the nudge is unwanted:
    // no WebAuthn support, already resolved on a prior visit, or the account
    // already owns at least one passkey (e.g. registered from Settings earlier).
    // `replace: true` keeps Back from bouncing the user back into the nudge.
    useEffect(() => {
        if (userLoading || passkeysLoading) return;
        const noWebAuthn = typeof window === 'undefined' || !browserSupportsWebAuthn();
        const alreadyDismissed = user?.passkeyNudgeDismissed === true;
        const alreadyHasPasskey = Array.isArray(passkeys) && passkeys.length > 0;
        if (noWebAuthn || alreadyDismissed || alreadyHasPasskey) {
            navigate('/', { replace: true });
        }
    }, [userLoading, passkeysLoading, user?.passkeyNudgeDismissed, passkeys, navigate]);

    const handleEnable = async () => {
        try {
            setIsEnabling(true);
            const { options, challengeId } = await generateRegOptionsMutation.mutateAsync({
                friendlyName: 'StenVault Passkey',
            });
            const credential = await startRegistration({ optionsJSON: options });
            await verifyRegMutation.mutateAsync({ challengeId, credential: credential as any });
        } catch (error: any) {
            // Cancelling the native WebAuthn sheet is not a failure — keep the
            // flag untouched so the user can try again without losing the nudge.
            if (error?.name === 'NotAllowedError') return;

            // Accounts with MFA enabled would need a TOTP code before registering;
            // this screen deliberately stays single-purpose, so forward them to
            // Settings where the full dialog prompts for the code.
            if (error?.data?.code === 'PRECONDITION_FAILED' && error?.message === 'MFA_REQUIRED') {
                toast.error('Enable passkey from Settings — two-factor is required.');
                navigate('/', { replace: true });
                return;
            }

            toast.error(error?.message || 'Could not enable passkey. Try again.');
            return;
        } finally {
            setIsEnabling(false);
        }

        // Post-registration cleanup is best-effort: the passkey itself is now
        // the strongest source of truth for "nudge resolved" (the page's own
        // `alreadyHasPasskey` gate will auto-redirect on any future visit), so
        // a failure here shouldn't strand the user on the nudge screen or
        // surface as an error. The flag and cache freshness are nice-to-haves
        // at this point, not preconditions for UX correctness.
        try {
            await dismissNudgeMutation.mutateAsync();
        } catch {
            // Flag will get set next time something touches it; the passkey
            // already gates the screen out.
        }
        await Promise.allSettled([
            utils.auth.me.invalidate(),
            utils.passkeys.list.invalidate(),
        ]);
        toast.success('Passkey enabled');
        navigate('/', { replace: true });
    };

    const handleSkip = async () => {
        try {
            setIsDismissing(true);
            await dismissNudgeMutation.mutateAsync();
            await Promise.allSettled([
                utils.auth.me.invalidate(),
                utils.passkeys.list.invalidate(),
            ]);
            navigate('/', { replace: true });
        } catch (error: any) {
            toast.error(error?.message || 'Could not save preference.');
            setIsDismissing(false);
        }
    };

    // Don't flash an empty card while the gating queries resolve — the effect
    // above will redirect if any gate trips.
    if (userLoading || passkeysLoading) {
        return null;
    }

    const sidePanel = <AuthSidePanel headline="One tap to sign in next time." />;

    return (
        <AuthLayout showBackLink={false} sidePanel={sidePanel}>
            <AuthCard
                title="One more thing"
                description="Skip sign-in next time? Use your device's Face ID, Touch ID, or Windows Hello instead of typing your Sign-in Password."
            >
                <div className="space-y-4">
                    <AuthButton
                        onClick={handleEnable}
                        isLoading={isEnabling}
                        disabled={isDismissing}
                        icon={<Fingerprint className="w-4 h-4" />}
                    >
                        Enable Passkey
                    </AuthButton>

                    <button
                        type="button"
                        onClick={handleSkip}
                        disabled={isEnabling || isDismissing}
                        className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>Not now</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}
