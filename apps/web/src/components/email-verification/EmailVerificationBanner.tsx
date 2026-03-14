import { AlertTriangle, X, Mail, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface Props {
    email: string;
    onVerifyClick: () => void;
}

const DISMISS_KEY = 'email-verification-banner-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function EmailVerificationBanner({ email, onVerifyClick }: Props) {
    const [isDismissed, setIsDismissed] = useState(() => {
        // Check localStorage on initial render
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt) {
            const dismissTime = parseInt(dismissedAt, 10);
            // Show banner again after 24 hours
            if (Date.now() - dismissTime < DISMISS_DURATION_MS) {
                return true;
            }
            // Expired, clear it
            localStorage.removeItem(DISMISS_KEY);
        }
        return false;
    });

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        setIsDismissed(true);
    };

    // Clear dismissal when email is verified (component won't render anyway)
    useEffect(() => {
        return () => {
            // Cleanup not needed since parent controls rendering
        };
    }, []);

    if (isDismissed) return null;

    return (
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-b border-amber-300/30 dark:border-amber-700/30 backdrop-blur-sm">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 shrink-0">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 truncate">
                            Email not verified
                        </p>
                        <p className="text-xs text-amber-700/70 dark:text-amber-300/70 hidden sm:block truncate">
                            Verify <span className="font-medium">{email}</span> to unlock all features
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm gap-1.5"
                        onClick={onVerifyClick}
                    >
                        <Mail className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Verify now</span>
                        <span className="sm:hidden">Verify</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-amber-700 hover:text-amber-800 hover:bg-amber-500/20 dark:text-amber-300 dark:hover:text-amber-200"
                        onClick={handleDismiss}
                        title="Dismiss for 24 hours"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
