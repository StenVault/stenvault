/**
 * Inactivity Warning Dialog
 *
 * Displays a warning when the user is about to be logged out due to inactivity.
 * Allows the user to extend their session or logout immediately.
 *
 * @version 1.0.0
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
} from '@/components/ui/alert-dialog';
import { formatRemainingTime } from '@/hooks/useInactivityTimeout';

interface InactivityWarningDialogProps {
    open: boolean;
    remainingSeconds: number;
    onExtend: () => void;
    onLogout: () => void;
}

export function InactivityWarningDialog({
    open,
    remainingSeconds,
    onExtend,
    onLogout,
}: InactivityWarningDialogProps) {
    return (
        <AlertDialog open={open}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-yellow-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                        Session Expiring
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-base">
                        You will be logged out in{' '}
                        <span className="font-mono font-bold text-foreground">
                            {formatRemainingTime(remainingSeconds)}
                        </span>{' '}
                        due to inactivity.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                        For your security, sessions automatically end after a period of
                        inactivity. Click "Stay Logged In" to continue your session.
                    </p>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onLogout}>
                        Logout Now
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onExtend}>
                        Stay Logged In
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
