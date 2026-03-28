import { useState, useCallback, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Cooldown duration in seconds before user can resend verification email */
const EMAIL_VERIFICATION_COOLDOWN_SECONDS = 60;

/** Interval tick rate in milliseconds */
const COOLDOWN_TICK_MS = 1000;

/** localStorage key for banner dismissal */
const BANNER_DISMISS_KEY = 'email-verification-banner-dismissed';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useEmailVerification() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // CRITICAL: Store interval ref to prevent memory leak on unmount
    const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const utils = trpc.useUtils();

    // Listen for global email-not-verified events
    useEffect(() => {
        const handleEmailNotVerified = () => {
            setIsModalOpen(true);
        };

        window.addEventListener('email-not-verified', handleEmailNotVerified);
        return () => {
            window.removeEventListener('email-not-verified', handleEmailNotVerified);
        };
    }, []);

    // CRITICAL: Cleanup interval on unmount to prevent memory leak
    useEffect(() => {
        return () => {
            if (cooldownIntervalRef.current) {
                clearInterval(cooldownIntervalRef.current);
                cooldownIntervalRef.current = null;
            }
        };
    }, []);

    // Verify with OTP
    const verifyWithOTP = trpc.auth.verifyEmailOTP.useMutation({
        onSuccess: () => {
            toast.success('Email verified successfully!');
            setIsModalOpen(false);

            // Clear banner dismissal from localStorage
            localStorage.removeItem(BANNER_DISMISS_KEY);

            // Refresh user data
            utils.auth.me.invalidate();

            // Invalidate ALL queries to retry previously failed ones
            // This ensures files.list, files.getStorageStats, etc. that returned 403
            // will be automatically refetched now that email is verified
            setTimeout(() => {
                utils.invalidate();
            }, 100);
        },
        onError: (error) => {
            toast.error(error.message || 'Invalid or expired code');
        },
    });

    // Resend email
    const resendEmail = trpc.auth.sendVerificationEmail.useMutation({
        onSuccess: () => {
            toast.success('Verification email sent!');
            startCooldown();
        },
        onError: (error) => {
            if (error.message.includes('Too many') || error.message.includes('rate')) {
                toast.error('Please wait before resending');
            } else {
                toast.error(error.message || 'Failed to resend email');
            }
        },
    });

    // Start cooldown timer with proper cleanup
    const startCooldown = useCallback(() => {
        // Clear any existing interval first
        if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
        }

        setCooldown(EMAIL_VERIFICATION_COOLDOWN_SECONDS);

        cooldownIntervalRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    // Cooldown complete - clear interval
                    if (cooldownIntervalRef.current) {
                        clearInterval(cooldownIntervalRef.current);
                        cooldownIntervalRef.current = null;
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, COOLDOWN_TICK_MS);
    }, []);

    // Verificar se erro é de email não verificado
    const isEmailNotVerifiedError = useCallback((error: unknown): boolean => {
        if (!error) return false;
        const message = (error as { message?: string })?.message ||
            (error as { data?: { message?: string } })?.data?.message || '';
        return message === 'EMAIL_NOT_VERIFIED' || message.includes('EMAIL_NOT_VERIFIED');
    }, []);

    // Handler para interceptar erros
    const handleError = useCallback((error: unknown) => {
        if (isEmailNotVerifiedError(error)) {
            setIsModalOpen(true);
            return true; // Error was handled
        }
        return false; // Error was not handled
    }, [isEmailNotVerifiedError]);

    const openModal = useCallback(() => setIsModalOpen(true), []);
    const closeModal = useCallback(() => setIsModalOpen(false), []);

    return {
        isModalOpen,
        setIsModalOpen,
        openModal,
        closeModal,
        isLoading: verifyWithOTP.isPending || resendEmail.isPending,
        cooldown,
        verifyWithOTP: verifyWithOTP.mutate,
        resendEmail: resendEmail.mutate,
        handleError,
        isEmailNotVerifiedError,
    };
}
