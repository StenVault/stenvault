import { useState, useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { devWarn } from '@/lib/debugLogger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Cooldown duration in seconds before user can resend verification email */
const EMAIL_VERIFICATION_COOLDOWN_SECONDS = 60;

/** Interval tick rate in milliseconds */
const COOLDOWN_TICK_MS = 1000;

/** localStorage key for banner dismissal */
const BANNER_DISMISS_KEY = 'email-verification-banner-dismissed';

/** Build WebSocket URL from API URL */
function getWsUrl(): string {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    return import.meta.env.VITE_WS_URL || apiUrl.replace('/api', '').replace('http:', 'ws:').replace('https:', 'wss:') || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useEmailVerification(emailVerified?: boolean) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // CRITICAL: Store interval ref to prevent memory leak on unmount
    const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const socketRef = useRef<Socket | null>(null);
    // Captured socket.id sent with the OTP mutation so the server can
    // exclude this tab from the email:verified broadcast — the mutation
    // response is the authoritative signal here, the WS echo would
    // double-emit the toast. Mirrors the verifyDeviceOTP pattern.
    const originSocketIdRef = useRef<string | null>(null);
    // First-writer-wins dedup. Defense-in-depth against the WS-vs-HTTP
    // race even when the backend exclude-self path didn't fire (no
    // socket.id captured yet, server-side change rolled back, etc.).
    // Both the WS handler and the OTP onSuccess consult and set this —
    // only the winner emits the toast.
    const verifiedRef = useRef(false);

    const utils = trpc.useUtils();
    // tRPC's useUtils proxy is referentially stable, but we keep it in a ref
    // to satisfy the "no useUtils in deps" rule (incidents 2026-04-15) — that
    // way the WS-setup effect can depend on the primitive `emailVerified`
    // alone and not tear the socket down on unrelated re-renders.
    const utilsRef = useRef(utils);
    utilsRef.current = utils;

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

    // Connect WebSocket to listen for email:verified when user needs verification
    useEffect(() => {
        // Only connect when we know the user exists and email is NOT verified
        if (emailVerified !== false) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        // New verification flow — allow toast to fire again. Tied to this
        // effect so the reset only happens on the emailVerified transition,
        // not on every parent re-render (would re-open the WS-vs-HTTP race
        // window if a late broadcast arrived after onSuccess already toasted).
        verifiedRef.current = false;
        originSocketIdRef.current = null;

        const socket = io(getWsUrl(), {
            path: '/socket.io',
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

        socket.on('connect', () => {
            originSocketIdRef.current = socket.id ?? null;
        });

        socket.on('connect_error', (err) => {
            devWarn('[EmailVerification] WebSocket connection failed:', err.message);
        });

        socket.on('email:verified', () => {
            // First-writer-wins: if the OTP onSuccess already toasted, skip.
            if (verifiedRef.current) return;
            verifiedRef.current = true;
            setIsModalOpen(false);
            localStorage.removeItem(BANNER_DISMISS_KEY);
            toast.success('Email verified!');
            socket.disconnect();
            socketRef.current = null;
            utilsRef.current.auth.me.invalidate();
            setTimeout(() => utilsRef.current.invalidate(), 100);
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [emailVerified]);

    // Verify with OTP. Backend exclusion (originSocketId -> excludeSocketId)
    // keeps the WS broadcast off this tab; verifiedRef is the second layer.
    const verifyOTPMutation = trpc.auth.verifyEmailOTP.useMutation({
        onSuccess: () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            // First-writer-wins: WS handler may have already fired the toast
            // (the server emit lands before the HTTP response on the same
            // request). Only the winner emits.
            if (!verifiedRef.current) {
                verifiedRef.current = true;
                toast.success('Email verified successfully!');
            }

            setIsModalOpen(false);
            localStorage.removeItem(BANNER_DISMISS_KEY);
            utilsRef.current.auth.me.invalidate();
            setTimeout(() => {
                utilsRef.current.invalidate();
            }, 100);
        },
        onError: (error) => {
            toast.error(error.message || 'Invalid or expired code');
        },
    });

    // Stable handle so verifyWithOTP can have empty deps (Golden Rule 3 —
    // useMutation returns new objects each render).
    const verifyOTPMutateRef = useRef(verifyOTPMutation.mutate);
    verifyOTPMutateRef.current = verifyOTPMutation.mutate;

    const verifyWithOTP = useCallback((params: { email: string; otp: string }) => {
        verifyOTPMutateRef.current({
            ...params,
            originSocketId: originSocketIdRef.current ?? undefined,
        });
    }, []);

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
        isLoading: verifyOTPMutation.isPending || resendEmail.isPending,
        cooldown,
        verifyWithOTP,
        resendEmail: resendEmail.mutate,
        handleError,
        isEmailNotVerifiedError,
    };
}
