/**
 * Home reminder card for users who have not configured Trusted Circle
 * (Shamir) recovery. Recovery codes are already printed during
 * EncryptionSetup, so "no recovery" here means "no multi-party recovery".
 *
 * Dismissal snoozes the card for 7 days via localStorage. Once Shamir is
 * configured the card disappears permanently.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { AuroraCard, AuroraCardContent } from '@stenvault/shared/ui/aurora-card';
import { Button } from '@stenvault/shared/ui/button';
import { trpc } from '@/lib/trpc';
import {
    RECOVERY_REMINDER_DISMISSED_AT_KEY,
    RECOVERY_REMINDER_SNOOZE_MS,
} from '@/lib/recoveryStorageKeys';

function readDismissedAt(): number | null {
    try {
        const raw = localStorage.getItem(RECOVERY_REMINDER_DISMISSED_AT_KEY);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function writeDismissedAt(ts: number): void {
    try {
        localStorage.setItem(RECOVERY_REMINDER_DISMISSED_AT_KEY, String(ts));
    } catch {
        // Private mode — reminder will reappear next render, acceptable.
    }
}

export function RecoverySetupReminder() {
    const navigate = useNavigate();
    const { data: status, isLoading } = trpc.shamirRecovery.getStatus.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });

    const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() => readDismissedAt());

    // Re-read on mount so an adjacent tab dismissal is reflected immediately.
    useEffect(() => {
        setSnoozedUntil(readDismissedAt());
    }, []);

    if (isLoading) return null;
    if (status?.isConfigured) return null;

    const now = Date.now();
    if (snoozedUntil && now - snoozedUntil < RECOVERY_REMINDER_SNOOZE_MS) return null;

    const handleSetUp = () => {
        navigate('/settings/encryption?setup=shamir');
    };

    const handleDismiss = () => {
        const ts = Date.now();
        writeDismissedAt(ts);
        setSnoozedUntil(ts);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
            >
                <AuroraCard
                    variant="default"
                    className="border-[var(--theme-warning)]/30"
                >
                    <AuroraCardContent className="p-5">
                        <div className="flex items-start gap-4">
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-warning)]/10"
                                aria-hidden="true"
                            >
                                <AlertTriangle className="h-5 w-5 text-[var(--theme-warning)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[15px] font-medium text-[var(--theme-fg-primary)]">
                                    Set up recovery to protect your vault.
                                </h3>
                                <p className="mt-1 text-sm text-[var(--theme-fg-muted)]">
                                    Distribute your recovery across trusted contacts. Without it, a forgotten Encryption Password means your vault cannot be restored.
                                </p>
                                <div className="mt-4 flex items-center gap-3">
                                    <Button
                                        size="sm"
                                        onClick={handleSetUp}
                                        className="gap-1.5"
                                    >
                                        Set up now
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={handleDismiss}
                                        className="text-xs text-[var(--theme-fg-muted)] hover:text-[var(--theme-fg-secondary)] transition-colors"
                                    >
                                        Remind me later
                                    </button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleDismiss}
                                aria-label="Dismiss for 7 days"
                                className="shrink-0 text-[var(--theme-fg-subtle)] hover:text-[var(--theme-fg-muted)] transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </motion.div>
        </AnimatePresence>
    );
}
