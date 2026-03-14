/**
 * Auth Module - Web
 * 
 * Centralized exports for authentication utilities.
 * 
 * @version 1.12.0
 */

// Token Manager - High-level API
export {
    storeTokenPair,
    getValidAccessToken,
    clearAllTokens,
    hasValidSession,
    type TokenPair,
} from './tokenManager';

// Token Storage - Low-level API (for advanced use cases)
export {
    saveTokens,
    getAccessToken,
    getRefreshToken,
    getTokenExpiresAt,
    clearTokens,
    isAccessTokenValid,
    hasRefreshToken,
} from './tokenStorage';
