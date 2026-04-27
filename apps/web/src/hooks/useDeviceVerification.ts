import { useState, useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { devWarn } from '@/lib/debugLogger';

const COOLDOWN_SECONDS = 60;
const COOLDOWN_TICK_MS = 1000;

function getWsUrl(): string {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    return import.meta.env.VITE_WS_URL || apiUrl.replace('/api', '').replace('http:', 'ws:').replace('https:', 'wss:') || '';
}

/**
 * Hook for new-device verification flow (Bitwarden-style).
 * Listens for `device:verified` WebSocket event and provides OTP verification + resend.
 */
export function useDeviceVerification(deviceFingerprint: string | null, active: boolean) {
    const [cooldown, setCooldown] = useState(0);
    const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const socketRef = useRef<Socket | null>(null);
    // Origin Socket.IO ID — sent with the OTP mutation so the backend
    // excludes this tab from the `device:verified` broadcast. Backend
    // exclusion is the structural fix; verifiedRef below is the
    // defense-in-depth for cases where socket.id isn't yet available
    // (race against connect) or the WS layer is disabled.
    const originSocketIdRef = useRef<string | null>(null);
    // First-writer-wins dedup: kept as a safety net if the backend
    // exclude-self path didn't fire (no socket.id captured, server-side
    // change rolled back, etc.). Both the WS handler and the mutation
    // onSuccess consult and set this — only the winner emits the toast.
    const verifiedRef = useRef(false);

    const utils = trpc.useUtils();
    // tRPC's useUtils proxy is referentially stable, but we keep it in a ref
    // to satisfy the "no useUtils in deps" rule (incidents 2026-04-15) — that
    // way the WS-setup effect can depend on the primitive `active` alone and
    // not tear the socket down on unrelated re-renders.
    const utilsRef = useRef(utils);
    utilsRef.current = utils;

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (cooldownIntervalRef.current) {
                clearInterval(cooldownIntervalRef.current);
                cooldownIntervalRef.current = null;
            }
        };
    }, []);

    // WebSocket listener for device:verified event (click-to-verify from email)
    useEffect(() => {
        if (!active) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        // New verification flow — allow toast to fire again. Tied to this
        // effect so the reset only happens on the active transition, not on
        // every parent re-render.
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
            devWarn('[DeviceVerification] WebSocket connection failed:', err.message);
        });

        socket.on('device:verified', () => {
            if (verifiedRef.current) return;
            verifiedRef.current = true;
            toast.success('Device verified!');
            socket.disconnect();
            socketRef.current = null;
            // Refetch encryption config — masterKeyEncrypted will now be returned
            utilsRef.current.encryption.getEncryptionConfig.invalidate();
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [active]);

    // Verify with OTP
    const verifyOTPMutation = trpc.auth.verifyDeviceOTP.useMutation({
        onSuccess: () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            // WS handler may have already fired the toast — don't double-emit
            if (!verifiedRef.current) {
                verifiedRef.current = true;
                toast.success('Device verified!');
            }
            utilsRef.current.encryption.getEncryptionConfig.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || 'Invalid or expired code');
        },
    });

    // Resend verification email
    const resendEmailMutation = trpc.auth.resendDeviceVerification.useMutation({
        onSuccess: (data) => {
            if ('alreadyVerified' in data && data.alreadyVerified) {
                toast.success('Device already verified!');
                utilsRef.current.encryption.getEncryptionConfig.invalidate();
                return;
            }
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

    // Stable handles so handlers below can have minimal deps (Golden Rule 3).
    const verifyOTPMutateRef = useRef(verifyOTPMutation.mutate);
    verifyOTPMutateRef.current = verifyOTPMutation.mutate;
    const resendEmailMutateRef = useRef(resendEmailMutation.mutate);
    resendEmailMutateRef.current = resendEmailMutation.mutate;

    const startCooldown = useCallback(() => {
        if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
        }

        setCooldown(COOLDOWN_SECONDS);

        cooldownIntervalRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
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

    const handleVerify = useCallback((otp: string) => {
        if (!deviceFingerprint) return;
        verifyOTPMutateRef.current({
            otp,
            deviceFingerprint,
            originSocketId: originSocketIdRef.current ?? undefined,
        });
    }, [deviceFingerprint]);

    const handleResend = useCallback(() => {
        if (!deviceFingerprint) return;
        resendEmailMutateRef.current({ deviceFingerprint });
    }, [deviceFingerprint]);

    return {
        isLoading: verifyOTPMutation.isPending || resendEmailMutation.isPending,
        cooldown,
        verifyWithOTP: handleVerify,
        resendEmail: handleResend,
    };
}
