/**
 * Token Manager - Web
 *
 * With HttpOnly cookies, the browser handles token lifecycle automatically.
 * The server sets/clears cookies; the frontend just needs to call the
 * refresh endpoint when a 401 occurs.
 *
 * @version 2.0.0
 */

import { clearTokens, type TokenPair } from './tokenStorage';

// ============ State ============

/** Lock to prevent concurrent refresh attempts */
let isRefreshing = false;

/** Queue of callbacks waiting for refresh to complete */
let refreshSubscribers: Array<(success: boolean) => void> = [];

// ============ Internal Functions ============

function notifySubscribers(success: boolean): void {
    refreshSubscribers.forEach(callback => callback(success));
    refreshSubscribers = [];
}

function subscribeToRefresh(): Promise<boolean> {
    return new Promise(resolve => {
        refreshSubscribers.push(resolve);
    });
}

/**
 * Call the refresh endpoint. The refresh token is sent automatically
 * via HttpOnly cookie (credentials: 'include').
 */
async function callRefreshEndpoint(): Promise<boolean> {
    try {
        const response = await fetch('/api/trpc/auth.refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ json: {} }),
        });

        if (!response.ok) {
            console.warn('[TokenManager] Refresh failed:', response.status);
            return false;
        }

        const data = await response.json();
        const result = data?.result?.data?.json ?? data?.result?.data ?? data;
        return result?.success === true;
    } catch (error) {
        console.error('[TokenManager] Refresh error:', error);
        return false;
    }
}

// ============ Public Functions ============

/**
 * No-op: tokens are set as HttpOnly cookies by the server response.
 * Kept for API compatibility during migration.
 */
export function storeTokenPair(_credentials: TokenPair): void {
    // Server sets HttpOnly cookies — nothing to store client-side
}

/**
 * Attempt to refresh the session via HttpOnly cookie.
 * Returns null since access token is not readable from JS.
 *
 * This is called by the tRPC error handler on 401 responses.
 */
export async function getValidAccessToken(): Promise<string | null> {
    // With HttpOnly cookies, we can't read the token.
    // The cookie is sent automatically with credentials: 'include'.
    // This function now only handles refresh logic for 401 recovery.
    return null;
}

/**
 * Attempt to refresh the session. Returns true if refresh succeeded.
 * The server sets new HttpOnly cookies in the response.
 */
export async function refreshSession(): Promise<boolean> {
    if (isRefreshing) {
        return subscribeToRefresh();
    }

    isRefreshing = true;

    try {
        const success = await callRefreshEndpoint();

        if (!success) {
            clearTokens(); // Clear legacy keys
        }

        notifySubscribers(success);
        return success;
    } catch (error) {
        console.error('[TokenManager] Refresh error:', error);
        clearTokens();
        notifySubscribers(false);
        return false;
    } finally {
        isRefreshing = false;
    }
}

/**
 * Clear legacy tokens from storage.
 * HttpOnly cookies are cleared by the server on logout.
 */
export function clearAllTokens(): void {
    clearTokens();
}

/**
 * Cannot determine session validity from JS (HttpOnly cookies).
 * Auth state is managed by the auth.me tRPC query.
 */
export function hasValidSession(): boolean {
    return false;
}

export type { TokenPair } from './tokenStorage';
