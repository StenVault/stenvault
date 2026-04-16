/**
 * Token Storage - Web
 *
 * Tokens are stored as HttpOnly cookies (set by the server).
 * JavaScript cannot read them — this is the security benefit.
 *
 * This module handles cleanup of legacy storage keys from the
 * previous sessionStorage/localStorage approach on logout.
 */

// ============ Types ============

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds until access token expires
}

// ============ Legacy Storage Keys (for cleanup on logout) ============

const LEGACY_KEYS = {
    ACCESS_TOKEN: 'stenvault_access_token',
    REFRESH_TOKEN: 'stenvault_refresh_token',
    EXPIRES_AT: 'stenvault_token_expires_at',
    AUTH_TOKEN: 'authToken',
} as const;

// ============ Functions ============

/**
 * Clear all legacy auth tokens from storage.
 * HttpOnly cookies are cleared by the server on logout.
 */
export function clearTokens(): void {
    try {
        sessionStorage.removeItem(LEGACY_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(LEGACY_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(LEGACY_KEYS.EXPIRES_AT);
        localStorage.removeItem(LEGACY_KEYS.AUTH_TOKEN);
    } catch {
        // Don't throw - logout should always succeed
    }
}
