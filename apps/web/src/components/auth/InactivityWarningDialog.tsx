/**
 * Inactivity Warning Dialog
 *
 * Warns the user that the vault is about to lock due to inactivity. The
 * user can extend the session or lock immediately. Locking clears the
 * master key from RAM but keeps the sign-in session and the device
 * fast-path; resuming costs only the Encryption Password.
 */

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
import { Lock } from 'lucide-react';
import { formatRemainingTime } from '@/hooks/useInactivityTimeout';

interface InactivityWarningDialogProps {
    open: boolean;
    remainingSeconds: number;
    onExtend: () => void;
    onLockNow: () => void;
}

export function InactivityWarningDialog({
    open,
    remainingSeconds,
    onExtend,
    onLockNow,
}: InactivityWarningDialogProps) {
    return (
        <AlertDialog open={open}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-[var(--theme-warning)]" aria-hidden="true" />
                        Vault about to lock
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-base">
                        Your vault will lock in{' '}
                        <span className="font-mono font-bold text-foreground">
                            {formatRemainingTime(remainingSeconds)}
                        </span>{' '}
                        due to inactivity.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                        Your sign-in stays active — only the encryption layer locks. Resume with your Encryption Password.
                    </p>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onLockNow}>
                        Lock now
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onExtend}>
                        Keep unlocked
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
