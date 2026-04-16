/**
 * Inactivity Timeout Hook
 *
 * Detects user inactivity and triggers logout after a timeout period.
 *
 * Features:
 * - Tracks mouse, keyboard, touch, and scroll events
 * - Shows warning dialog before logout
 * - Allows user to extend session
 * - Resets timer on any activity
 *
 * Security (Issue #34):
 * - Prevents unattended sessions from staying logged in
 * - Reduces risk of session hijacking on shared devices
 *
 * @version 1.0.0
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { clearMasterKeyCache, clearDeviceWrappedMK } from '@/hooks/useMasterKey';

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
}

const DEFAULT_CONFIG: InactivityConfig = {
    timeoutMs: 15 * 60 * 1000, // 15 minutes
    warningMs: 2 * 60 * 1000,  // 2 minutes before timeout
    events: ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'],
    excludePaths: ['/auth', '/login', '/register', '/share/'],
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
    /** Manually trigger logout */
    logout: () => void;
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
        () => ({ ...DEFAULT_CONFIG, ...config }),
        // Only depend on the primitive value that actually changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [config.timeoutMs, config.warningMs]
    );

    const { pathname: location } = useLocation();
    const setLocation = useNavigate();
    const logoutMutation = trpc.auth.logout.useMutation();
    const utils = trpc.useUtils();

    // Stable refs for values that change identity each render but we only call imperatively
    const logoutRef = useRef(logoutMutation.mutateAsync);
    logoutRef.current = logoutMutation.mutateAsync;
    const utilsRef = useRef(utils);
    utilsRef.current = utils;

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

    // Perform logout
    const performLogout = useCallback(async () => {
        clearTimers();

        // Security: clear crypto material FIRST before any async operations
        clearMasterKeyCache();
        clearDeviceWrappedMK();

        try {
            await logoutRef.current();
        } catch (error) {
            // Logout failed, but we already cleared local crypto state
            console.error('Logout failed:', error);
        }

        // Clear auth cache and redirect
        utilsRef.current.auth.me.invalidate();
        setLocation('/auth/login?reason=inactivity');
    }, [clearTimers, setLocation]);

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
                performLogout();
            }
        }, 1000);
    }, [mergedConfig.warningMs, mergedConfig.timeoutMs, performLogout]);

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
            performLogout();
        }, mergedConfig.timeoutMs);
    }, [
        isExcludedPath,
        clearTimers,
        mergedConfig.timeoutMs,
        mergedConfig.warningMs,
        startCountdown,
        performLogout,
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

    // Manual logout
    const logout = useCallback(() => {
        performLogout();
    }, [performLogout]);

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
        // Don't set up listeners on excluded paths or when timeout is disabled
        if (isExcludedPath() || mergedConfig.timeoutMs <= 0) {
            clearTimers();
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
    }, [isExcludedPath, handleActivity, resetTimers, clearTimers, mergedConfig.events]);

    // Handle visibility change (tab becomes visible again)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (mergedConfig.timeoutMs <= 0) return;
            if (document.visibilityState === 'visible') {
                // Tab became visible - check if we should have logged out
                const timeSinceLastActivity = Date.now() - lastActivityRef.current;

                if (timeSinceLastActivity >= mergedConfig.timeoutMs) {
                    // Should have logged out while tab was hidden
                    performLogout();
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
    }, [mergedConfig.timeoutMs, mergedConfig.warningMs, performLogout, startCountdown]);

    return {
        state,
        extendSession,
        logout,
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
