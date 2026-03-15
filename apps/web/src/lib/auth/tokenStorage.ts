/**
 * Token Storage - Web
 * 
 * Storage abstraction for authentication tokens.
 * 
 * Strategy:
 * - Access token: sessionStorage (cleared on tab close, more secure)
 * - Refresh token: localStorage (persists across sessions for auto-login)
 * - Expiry: localStorage (for checking validity on app load)
 * 
 * @version 1.12.0
 */

// ============ Storage Keys ============

const STORAGE_KEYS = {
    ACCESS_TOKEN: 'stenvault_access_token',
    REFRESH_TOKEN: 'stenvault_refresh_token',
    EXPIRES_AT: 'stenvault_token_expires_at',
} as const;

// ============ Types ============

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds until access token expires
}

// ============ Storage Functions ============

/**
 * Save token pair to storage
 * Access token → sessionStorage (more secure, cleared on tab close)
 * Refresh token → localStorage (persists for auto-login)
 */
export function saveTokens(tokens: TokenPair): void {
    try {
        const expiresAt = Date.now() + (tokens.expiresIn * 1000);

        // Access token in sessionStorage (memory-like, per-tab)
        sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);

        // Refresh token in localStorage (persists across sessions)
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
        localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, String(expiresAt));
    } catch (error) {
        console.error('[TokenStorage] Failed to save tokens:', error);
        throw new Error('Failed to save authentication tokens');
    }
}

/**
 * Get access token from sessionStorage
 */
export function getAccessToken(): string | null {
    try {
        return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    } catch (error) {
        console.error('[TokenStorage] Failed to get access token:', error);
        return null;
    }
}

/**
 * Get refresh token from localStorage
 */
export function getRefreshToken(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    } catch (error) {
        console.error('[TokenStorage] Failed to get refresh token:', error);
        return null;
    }
}

/**
 * Get token expiry timestamp
 */
export function getTokenExpiresAt(): number | null {
    try {
        const value = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
        return value ? parseInt(value, 10) : null;
    } catch (error) {
        console.error('[TokenStorage] Failed to get token expiry:', error);
        return null;
    }
}

/**
 * Clear all auth tokens from storage
 */
export function clearTokens(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);

        // Also clear legacy token for cleanup
        localStorage.removeItem('authToken');
    } catch (error) {
        console.error('[TokenStorage] Failed to clear tokens:', error);
        // Don't throw - logout should always succeed
    }
}

/**
 * Check if access token exists and is not expired
 * Uses 1 minute buffer to account for clock skew
 */
export function isAccessTokenValid(): boolean {
    const accessToken = getAccessToken();
    const expiresAt = getTokenExpiresAt();

    if (!accessToken || !expiresAt) {
        return false;
    }

    const bufferMs = 60 * 1000; // 1 minute
    return Date.now() < (expiresAt - bufferMs);
}

/**
 * Check if refresh token exists (user might be auto-loginable)
 */
export function hasRefreshToken(): boolean {
    return getRefreshToken() !== null;
}
