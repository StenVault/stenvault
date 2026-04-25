import { AlertTriangle, Lock } from 'lucide-react';
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

interface AuthLastCheckDialogProps {
    open: boolean;
    onReview: () => void;
    onConfirm: () => void;
}

/**
 * One-touch interrupt for Fair-strength Encryption Passwords at the moment of
 * Seal. Weaker passwords are already blocked by the submit gate and stronger
 * ones pass through silently — this dialog exists only for the Fair tier,
 * where the user is confident enough to submit but not yet strong enough to
 * earn the no-recovery contract without a second of doubt.
 */
export function AuthLastCheckDialog({
    open,
    onReview,
    onConfirm,
}: AuthLastCheckDialogProps) {
    return (
        <AlertDialog open={open}>
            <AlertDialogContent className="max-w-sm">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-400" />
                        Last check
                    </AlertDialogTitle>
                    <AlertDialogDescription className="leading-relaxed">
                        We can&apos;t reset this password. If you forget it, your recovery codes (next step) are the only way back.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onReview}>
                        Let me review
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="gap-2">
                        <Lock className="h-4 w-4" />
                        Seal my files
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default AuthLastCheckDialog;
