/**
 * Soft-gate modal that fires on the 3rd upload of an account that still
 * has no Trusted Circle (Shamir) recovery configured. The primary CTA
 * routes the user into the setup flow; the secondary CTA marks the gate
 * as permanently dismissed for this account on this device.
 *
 * This is not a typed-confirm destructive dialog — it's a friction-ful
 * Apple-HIG alert where Cancel-is-default. The user always has a way
 * through; we just make sure they notice the missing safety net.
 */

import { AlertTriangle } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@stenvault/shared/ui/alert-dialog';

interface UploadRecoveryGateProps {
    open: boolean;
    /** Called when the user chose "Set up recovery". Parent should navigate. */
    onSetupRecovery: () => void;
    /** Called when the user chose "I understand, continue anyway". */
    onContinue: () => void;
    /** Called when the overlay / Esc closes the dialog without a choice. */
    onDismiss: () => void;
}

export function UploadRecoveryGate({
    open,
    onSetupRecovery,
    onContinue,
    onDismiss,
}: UploadRecoveryGateProps) {
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onDismiss();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex items-start gap-3">
                        <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-warning)]/10"
                            aria-hidden="true"
                        >
                            <AlertTriangle className="h-5 w-5 text-[var(--theme-warning)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <AlertDialogTitle className="font-display text-[22px] leading-tight">
                                Protect your vault before going further.
                            </AlertDialogTitle>
                            <AlertDialogDescription className="mt-2 text-sm text-[var(--theme-fg-muted)]">
                                You're adding files that only you can decrypt. If you lose your Encryption Password without a Trusted Circle set up, these files become unrecoverable.
                            </AlertDialogDescription>
                        </div>
                    </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onContinue}>
                        I understand, continue anyway
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onSetupRecovery}>
                        Set up recovery
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
