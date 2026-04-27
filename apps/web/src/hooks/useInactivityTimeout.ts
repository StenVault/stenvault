/**
 * Inactivity Timeout Hook
 *
 * Detects user inactivity and locks the vault (clears the in-memory master
 * key) after a timeout. Locking — not signing out — is the right primitive
 * for a zero-knowledge product:
 *  - the master key is the only secret that gates encrypted content,
 *  - it lives only in RAM, so clearing it is the meaningful security action;
 *  - the JWT alone unlocks no encrypted data (settings/billing aside),
 *    so revoking it on a timer adds friction without adding protection;
 *  - the device-wrapped MK is itself encrypted with a Device-KEK derived
 *    from password + UES, so leaving it in localStorage is no leak — and
 *    keeping it preserves the ~100ms fast-path unlock instead of forcing a
 *    full Argon2id (~500ms) re-derivation.
 *
 * Users who want a hard sign-out on inactive devices use the manual "Sign
 * out" action; this timer is the in-product lock screen.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { clearMasterKeyCache } from '@/hooks/useMasterKey';

// ============================================
// Configuration
// ============================================

export interface InactivityConfig {
    /** Inactivity timeout in milliseconds */
    timeoutMs: number;
    /** Time before timeout to show warning (ms) */
    warningMs: number;
    /** Events to track for activity */
    events: string[];
    /** Paths to exclude from timeout (e.g., login page) */
    excludePaths: string[];
    /**
     * Master switch. When false, no event listeners are attached, no timers
     * are scheduled, and any in-flight warning is dismissed. The intended
     * caller wires this to `isUnlocked` — there's nothing to lock when the
     * vault is already locked, so running the timer (and waking the user
     * with a warning) would be pure noise.
     */
    enabled: boolean;
}

const DEFAULT_CONFIG: InactivityConfig = {
    timeoutMs: 15 * 60 * 1000, // 15 minutes
    warningMs: 2 * 60 * 1000,  // 2 minutes before timeout
    events: ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'],
    excludePaths: ['/auth', '/login', '/register', '/share/'],
    enabled: true,
};

// ============================================
// Types
// ============================================

export interface InactivityState {
    /** Whether warning dialog should be shown */
    showWarning: boolean;
    /** Seconds remaining before logout */
    remainingSeconds: number;
    /** Whether user is currently active */
    isActive: boolean;
    /** Last activity timestamp */
    lastActivityAt: Date;
}

export interface UseInactivityTimeoutResult {
    state: InactivityState;
    /** Extend the session (reset timer) */
    extendSession: () => void;
    /** Manually trigger lock now */
    lockNow: () => void;
    /** Dismiss warning without extending */
    dismissWarning: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useInactivityTimeout(
    config: Partial<InactivityConfig> = {}
): UseInactivityTimeoutResult {
    const mergedConfig = useMemo(
        () => ({
            ...DEFAULT_CONFIG,
            ...config,
            // Explicit ?? so a caller passing `enabled: undefined` (e.g. while
            // a `vaultUnlocked` query is loading) doesn't undefined-spread over
            // the default `true` and end up disabling the timer accidentally.
            enabled: config.enabled ?? DEFAULT_CONFIG.enabled,
        }),
        // Only depend on the primitive values that actually change

        [config.timeoutMs, config.warningMs, config.enabled]
    );

    const { pathname: location } = useLocation();

    // State — lastActivityAt lives in a ref to avoid re-render cascades
    const [state, setState] = useState<InactivityState>({
        showWarning: false,
        remainingSeconds: 0,
        isActive: true,
        lastActivityAt: new Date(),
    });
    const lastActivityRef = useRef<number>(Date.now());

    // Refs for timers
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const warningRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    // Check if current path should be excluded
    const isExcludedPath = useCallback(() => {
        return mergedConfig.excludePaths.some(path =>
            location.startsWith(path) || location === path
        );
    }, [location, mergedConfig.excludePaths]);

    // Clear all timers
    const clearTimers = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (warningRef.current) {
            clearTimeout(warningRef.current);
            warningRef.current = null;
        }
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    }, []);

    // Lock the vault — clear master key from RAM only.
    // Deliberately keeps:
    //  - the device-wrapped MK in localStorage (encrypted with Device-KEK,
    //    not sensitive on its own; preserving it keeps the next unlock on
    //    the ~100ms fast-path instead of a full Argon2id re-derivation),
    //  - the JWT (the user is still signed in; encrypted content is the
    //    only thing gated, and that's gated on the master key being in RAM).
    // The MasterKeyGuard / VaultUnlockModal flow takes over the moment any
    // consumer reads `isUnlocked` — no redirect needed.
    const performLock = useCallback(() => {
        clearTimers();
        clearMasterKeyCache();
        setState(prev => ({
            ...prev,
            showWarning: false,
            remainingSeconds: 0,
        }));
    }, [clearTimers]);

    // Start countdown to logout
    const startCountdown = useCallback(() => {
        // Clamp warning duration to half the timeout for short timeouts (e.g. 1 min)
        const clampedWarningMs = Math.min(mergedConfig.warningMs, mergedConfig.timeoutMs * 0.5);
        const endTime = Date.now() + clampedWarningMs;

        setState(prev => ({
            ...prev,
            showWarning: true,
            remainingSeconds: Math.ceil(clampedWarningMs / 1000),
        }));

        countdownRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));

            setState(prev => ({
                ...prev,
                remainingSeconds: remaining,
            }));

            if (remaining <= 0) {
                clearInterval(countdownRef.current!);
                countdownRef.current = null;
                performLock();
            }
        }, 1000);
    }, [mergedConfig.warningMs, mergedConfig.timeoutMs, performLock]);

    // Reset timers (on activity)
    const resetTimers = useCallback(() => {
        if (isExcludedPath() || mergedConfig.timeoutMs <= 0) return;

        clearTimers();

        lastActivityRef.current = Date.now();
        setState(prev => ({
            ...prev,
            showWarning: false,
            remainingSeconds: 0,
            isActive: true,
            lastActivityAt: new Date(lastActivityRef.current),
        }));

        // Set warning timer (clamp warning to half the timeout for short durations)
        const effectiveWarningMs = Math.min(mergedConfig.warningMs, mergedConfig.timeoutMs * 0.5);
        const warningTime = Math.max(0, mergedConfig.timeoutMs - effectiveWarningMs);
        warningRef.current = setTimeout(() => {
            startCountdown();
        }, warningTime);

        // Set final timeout (backup in case countdown fails)
        timeoutRef.current = setTimeout(() => {
            performLock();
        }, mergedConfig.timeoutMs);
    }, [
        isExcludedPath,
        clearTimers,
        mergedConfig.timeoutMs,
        mergedConfig.warningMs,
        startCountdown,
        performLock,
    ]);

    // Extend session (called from warning dialog)
    const extendSession = useCallback(() => {
        resetTimers();
    }, [resetTimers]);

    // Dismiss warning without extending
    const dismissWarning = useCallback(() => {
        setState(prev => ({
            ...prev,
            showWarning: false,
        }));
        // Timer continues running - will logout when it expires
    }, []);

    // Manual lock-now (e.g. user clicks "Lock now" in the warning dialog)
    const lockNow = useCallback(() => {
        performLock();
    }, [performLock]);

    // Activity handler
    const handleActivity = useCallback(() => {
        // Throttle activity events
        const now = Date.now();

        // Only reset if more than 1 second has passed (ref avoids re-render dep)
        if (now - lastActivityRef.current > 1000) {
            resetTimers();
        }
    }, [resetTimers]);

    // Set up event listeners
    useEffect(() => {
        // Skip when caller disabled the timer (e.g. vault already locked),
        // when on an excluded path, or when timeout is set to "Never".
        // Also dismiss any in-flight warning so a vault that locks while
        // the dialog was already showing doesn't leave the dialog stuck.
        if (!mergedConfig.enabled || isExcludedPath() || mergedConfig.timeoutMs <= 0) {
            clearTimers();
            setState(prev => prev.showWarning
                ? { ...prev, showWarning: false, remainingSeconds: 0 }
                : prev);
            return;
        }

        // Add event listeners
        mergedConfig.events.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Initial timer setup
        resetTimers();

        // Cleanup
        return () => {
            mergedConfig.events.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            clearTimers();
        };
    }, [mergedConfig.enabled, isExcludedPath, handleActivity, resetTimers, clearTimers, mergedConfig.events, mergedConfig.timeoutMs]);

    // Handle visibility change (tab becomes visible again)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!mergedConfig.enabled || mergedConfig.timeoutMs <= 0) return;
            if (document.visibilityState === 'visible') {
                // Tab became visible — check if we should have locked
                const timeSinceLastActivity = Date.now() - lastActivityRef.current;

                if (timeSinceLastActivity >= mergedConfig.timeoutMs) {
                    // Should have locked while tab was hidden
                    performLock();
                } else if (timeSinceLastActivity >= mergedConfig.timeoutMs - Math.min(mergedConfig.warningMs, mergedConfig.timeoutMs * 0.5)) {
                    // Should be in warning state
                    startCountdown();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [mergedConfig.enabled, mergedConfig.timeoutMs, mergedConfig.warningMs, performLock, startCountdown]);

    return {
        state,
        extendSession,
        lockNow,
        dismissWarning,
    };
}

/**
 * Format remaining seconds as "X:XX" string
 */
export function formatRemainingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
