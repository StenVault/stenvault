/**
 * Token Storage - Web
 *
 * Tokens are now stored as HttpOnly cookies (set by the server).
 * JavaScript cannot read them — this is the security benefit.
 *
 * This module only handles cleanup of legacy storage keys
 * from the previous sessionStorage/localStorage approach.
 *
 * @version 2.0.0
 */

// ============ Types ============

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds until access token expires
}

// ============ Legacy Storage Keys (for cleanup) ============

const LEGACY_KEYS = {
    ACCESS_TOKEN: 'stenvault_access_token',
    REFRESH_TOKEN: 'stenvault_refresh_token',
    EXPIRES_AT: 'stenvault_token_expires_at',
    AUTH_TOKEN: 'authToken',
} as const;

// ============ Functions ============

/**
 * No-op: tokens are now set as HttpOnly cookies by the server.
 * Kept for API compatibility during migration.
 */
export function saveTokens(_tokens: TokenPair): void {
    // Server sets HttpOnly cookies — nothing to store client-side
}

/** No-op: token lives in HttpOnly cookie, not readable by JS. */
export function getAccessToken(): string | null {
    return null;
}

/** No-op: token lives in HttpOnly cookie, not readable by JS. */
export function getRefreshToken(): string | null {
    return null;
}

/** No-op: expiry is managed server-side via cookie maxAge. */
export function getTokenExpiresAt(): number | null {
    return null;
}

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

/** No-op: validity is determined by the server (cookie + JWT expiry). */
export function isAccessTokenValid(): boolean {
    return false;
}

/** No-op: cannot check HttpOnly cookies from JS. Auth state comes from auth.me query. */
export function hasRefreshToken(): boolean {
    return false;
}
