/**
 * Token Manager - Web
 * 
 * Handles token lifecycle with auto-refresh capability.
 * Mirrors mobile implementation pattern from cloudvault-mobile/src/api/tokenManager.ts
 * 
 * Features:
 * - Auto-refresh when access token expires
 * - Token rotation (single-use refresh tokens)
 * - Graceful fallback on refresh failure
 * 
 * @version 1.12.0
 */

import {
    saveTokens,
    getAccessToken,
    getRefreshToken,
    isAccessTokenValid,
    clearTokens,
    hasRefreshToken,
    type TokenPair,
} from './tokenStorage';


/** Lock to prevent concurrent refresh attempts */
let isRefreshing = false;

/** Queue of callbacks waiting for refresh to complete */
let refreshSubscribers: Array<(token: string | null) => void> = [];


/**
 * Notify all subscribers of refresh result
 */
function notifySubscribers(token: string | null): void {
    refreshSubscribers.forEach(callback => callback(token));
    refreshSubscribers = [];
}

/**
 * Add subscriber to wait for refresh completion
 */
function subscribeToRefresh(): Promise<string | null> {
    return new Promise(resolve => {
        refreshSubscribers.push(resolve);
    });
}

/**
 * Call the refresh endpoint directly (bypasses tRPC to avoid circular dependency)
 */
async function callRefreshEndpoint(refreshToken: string): Promise<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
} | null> {
    try {
        const response = await fetch('/api/trpc/auth.refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                json: { refreshToken }
            }),
        });

        if (!response.ok) {
            console.warn('[TokenManager] Refresh request failed:', response.status);
            return null;
        }

        const data = await response.json();

        // Extract from superjson wrapper
        const result = data?.result?.data?.json ?? data?.result?.data ?? data;

        if (!result?.success || !result?.accessToken || !result?.refreshToken) {
            console.warn('[TokenManager] Invalid refresh response');
            return null;
        }

        return {
            success: result.success,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresIn: result.expiresIn ?? 900,
        };
    } catch (error) {
        console.error('[TokenManager] Refresh endpoint error:', error);
        return null;
    }
}


/**
 * Store token pair from login/register response
 */
export function storeTokenPair(credentials: TokenPair): void {
    saveTokens(credentials);
}

/**
 * Get a valid access token (auto-refreshes if expired)
 * 
 * Flow:
 * 1. If access token valid → return it
 * 2. If expired but refresh token exists → refresh and return new token
 * 3. If refresh fails → clear tokens, return null
 */
export async function getValidAccessToken(): Promise<string | null> {
    // Fast path: token is still valid
    if (isAccessTokenValid()) {
        return getAccessToken();
    }

    // Check if we have a refresh token
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        return null;
    }

    // If already refreshing, wait for it to complete
    if (isRefreshing) {
        return subscribeToRefresh();
    }

    // Start refresh
    isRefreshing = true;

    try {
        const result = await callRefreshEndpoint(refreshToken);

        if (result) {
            // Store new tokens
            saveTokens({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
            });

            notifySubscribers(result.accessToken);
            return result.accessToken;
        }

        // Refresh failed - clear tokens
        console.warn('[TokenManager] Refresh failed, clearing tokens');
        clearTokens();
        notifySubscribers(null);
        return null;
    } catch (error) {
        console.error('[TokenManager] Refresh error:', error);
        clearTokens();
        notifySubscribers(null);
        return null;
    } finally {
        isRefreshing = false;
    }
}

/**
 * Clear all tokens (for logout)
 */
export function clearAllTokens(): void {
    clearTokens();
}

/**
 * Check if user has a valid session (refresh token exists)
 */
export function hasValidSession(): boolean {
    return hasRefreshToken();
}

/**
 * Re-export TokenPair type for convenience
 */
export type { TokenPair } from './tokenStorage';
