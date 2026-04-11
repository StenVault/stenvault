import { useState, useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
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

    const utils = trpc.useUtils();

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

        const socket = io(getWsUrl(), {
            path: '/socket.io',
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

        socket.on('connect_error', (err) => {
            devWarn('[DeviceVerification] WebSocket connection failed:', err.message);
        });

        socket.on('device:verified', () => {
            if (!socketRef.current) return;
            toast.success('Device verified!');
            socket.disconnect();
            socketRef.current = null;
            // Refetch encryption config — masterKeyEncrypted will now be returned
            utils.encryption.getEncryptionConfig.invalidate();
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [active, utils]);

    // Verify with OTP
    const verifyWithOTP = trpc.auth.verifyDeviceOTP.useMutation({
        onSuccess: () => {
            // Disconnect WS to prevent duplicate toast
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            toast.success('Device verified!');
            utils.encryption.getEncryptionConfig.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || 'Invalid or expired code');
        },
    });

    // Resend verification email
    const resendEmail = trpc.auth.resendDeviceVerification.useMutation({
        onSuccess: (data) => {
            if ('alreadyVerified' in data && data.alreadyVerified) {
                toast.success('Device already verified!');
                utils.encryption.getEncryptionConfig.invalidate();
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
        verifyWithOTP.mutate({ otp, deviceFingerprint });
    }, [deviceFingerprint, verifyWithOTP]);

    const handleResend = useCallback(() => {
        if (!deviceFingerprint) return;
        resendEmail.mutate({ deviceFingerprint });
    }, [deviceFingerprint, resendEmail]);

    return {
        isLoading: verifyWithOTP.isPending || resendEmail.isPending,
        cooldown,
        verifyWithOTP: handleVerify,
        resendEmail: handleResend,
    };
}
