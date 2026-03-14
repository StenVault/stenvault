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

import { useEffect, useRef, useCallback, useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { clearMasterKeyCache, clearDeviceWrappedMK } from '@/hooks/useMasterKey';

// Configuration

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
    excludePaths: ['/auth', '/login', '/register', '/landing', '/share/'],
};

// Types

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

// Hook Implementation

export function useInactivityTimeout(
    config: Partial<InactivityConfig> = {}
): UseInactivityTimeoutResult {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    const [location, setLocation] = useLocation();
    const logoutMutation = trpc.auth.logout.useMutation();
    const utils = trpc.useUtils();

    // State
    const [state, setState] = useState<InactivityState>({
        showWarning: false,
        remainingSeconds: 0,
        isActive: true,
        lastActivityAt: new Date(),
    });

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
            await logoutMutation.mutateAsync();
        } catch (error) {
            // Logout failed, but we already cleared local crypto state
            console.error('Logout failed:', error);
        }

        // Clear auth cache and redirect
        utils.auth.me.invalidate();
        setLocation('/auth/login?reason=inactivity');
    }, [clearTimers, logoutMutation, utils.auth.me, setLocation]);

    // Start countdown to logout
    const startCountdown = useCallback(() => {
        const endTime = Date.now() + mergedConfig.warningMs;

        setState(prev => ({
            ...prev,
            showWarning: true,
            remainingSeconds: Math.ceil(mergedConfig.warningMs / 1000),
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
    }, [mergedConfig.warningMs, performLogout]);

    // Reset timers (on activity)
    const resetTimers = useCallback(() => {
        if (isExcludedPath()) return;

        clearTimers();

        setState(prev => ({
            ...prev,
            showWarning: false,
            remainingSeconds: 0,
            isActive: true,
            lastActivityAt: new Date(),
        }));

        // Set warning timer
        const warningTime = mergedConfig.timeoutMs - mergedConfig.warningMs;
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
        const lastActivity = state.lastActivityAt.getTime();

        // Only reset if more than 1 second has passed
        if (now - lastActivity > 1000) {
            resetTimers();
        }
    }, [state.lastActivityAt, resetTimers]);

    // Set up event listeners
    useEffect(() => {
        // Don't set up listeners on excluded paths
        if (isExcludedPath()) {
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
            if (document.visibilityState === 'visible') {
                // Tab became visible - check if we should have logged out
                const timeSinceLastActivity = Date.now() - state.lastActivityAt.getTime();

                if (timeSinceLastActivity >= mergedConfig.timeoutMs) {
                    // Should have logged out while tab was hidden
                    performLogout();
                } else if (timeSinceLastActivity >= mergedConfig.timeoutMs - mergedConfig.warningMs) {
                    // Should be in warning state
                    startCountdown();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [state.lastActivityAt, mergedConfig.timeoutMs, mergedConfig.warningMs, performLogout, startCountdown]);

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
