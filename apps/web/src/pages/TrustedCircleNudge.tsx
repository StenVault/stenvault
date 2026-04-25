/**
 * Post-EncryptionSetup nudge for Trusted Circle (Shamir). Shown once during
 * registration between the passkey screen (or encryption-setup on browsers
 * without WebAuthn) and the first `/home` visit.
 *
 * Recovery codes are already saved during EncryptionSetup, so this screen
 * only surfaces the Trusted Circle option — the recovery path that requires
 * 2+ trusted contacts to rebuild the vault. Picking it hands off to the
 * Settings > Encryption shell, which auto-opens the setup dialog via
 * `?setup=shamir`.
 *
 * Dismissal is local: a localStorage flag prevents re-entry if the URL is
 * ever visited directly. Server-side tracking would be nicer but this
 * nudge is a UI-only feature gate, and users who resolve it on one device
 * never come back through the registration funnel on another.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { AuthLayout, AuthCard, AuthButton, AuthSidePanel } from '@/components/auth';
import { RECOVERY_REMINDER_DISMISSED_AT_KEY } from '@/lib/recoveryStorageKeys';

const NUDGE_RESOLVED_KEY = 'stenvault-shamir-nudge-resolved';

function markResolved() {
    try {
        localStorage.setItem(NUDGE_RESOLVED_KEY, '1');
        // Seed the Home reminder's 7-day snooze so the user isn't pinged
        // again by RecoverySetupReminder on the very next /home visit.
        // The shared constant keeps this cross-surface contract honest.
        localStorage.setItem(RECOVERY_REMINDER_DISMISSED_AT_KEY, String(Date.now()));
    } catch {
        // Private mode or quota — losing the flag just means the user
        // might see the nudge again next time they visit this URL directly,
        // and the Home reminder may appear sooner than the 7-day snooze.
    }
}

function readResolved(): boolean {
    try {
        return localStorage.getItem(NUDGE_RESOLVED_KEY) === '1';
    } catch {
        return false;
    }
}

export default function TrustedCircleNudge() {
    const navigate = useNavigate();

    const { data: status, isLoading: statusLoading, isError: statusError } =
        trpc.shamirRecovery.getStatus.useQuery(undefined, {
            retry: false,
            refetchOnWindowFocus: false,
        });

    const [isNavigating, setIsNavigating] = useState(false);

    // Auto-bail if the user already configured Trusted Circle on another
    // device, or already resolved the nudge on this one. `replace: true`
    // keeps the Back button from trapping them here. A query failure also
    // bails out (fail-closed past the nudge) — rather than stranding the
    // user on a card that might render with stale / undefined status.
    useEffect(() => {
        if (statusLoading) return;
        if (statusError) {
            navigate('/', { replace: true });
            return;
        }
        const alreadyConfigured = status?.isConfigured === true;
        const alreadyResolved = readResolved();
        if (alreadyConfigured || alreadyResolved) {
            navigate('/', { replace: true });
        }
    }, [statusLoading, statusError, status?.isConfigured, navigate]);

    const handleSetUp = () => {
        markResolved();
        setIsNavigating(true);
        navigate('/settings/encryption?setup=shamir', { replace: true });
    };

    const handleSkip = () => {
        markResolved();
        setIsNavigating(true);
        navigate('/', { replace: true });
    };

    if (statusLoading) {
        return null;
    }

    const sidePanel = (
        <AuthSidePanel headline="A circle of trust is the quietest safety net." />
    );

    return (
        <AuthLayout showBackLink={false} sidePanel={sidePanel}>
            <AuthCard
                title="One last thing"
                description="Distribute your vault recovery across 3-5 trusted contacts. If you ever forget your Encryption Password, at least 2 of them can rebuild the vault with you."
            >
                <div className="space-y-4">
                    <AuthButton
                        onClick={handleSetUp}
                        isLoading={isNavigating}
                        icon={<Users className="w-4 h-4" />}
                    >
                        Set up Trusted Circle
                    </AuthButton>

                    <button
                        type="button"
                        onClick={handleSkip}
                        disabled={isNavigating}
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
