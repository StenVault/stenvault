/**
 * Token Storage Tests (HttpOnly Cookie Migration)
 *
 * After migration to HttpOnly cookies:
 * - saveTokens is a no-op (server sets cookies)
 * - getAccessToken/getRefreshToken always return null (HttpOnly = not readable by JS)
 * - isAccessTokenValid/hasRefreshToken always return false
 * - clearTokens still cleans up legacy storage keys
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    saveTokens,
    getAccessToken,
    getRefreshToken,
    getTokenExpiresAt,
    clearTokens,
    isAccessTokenValid,
    hasRefreshToken,
} from './tokenStorage';

describe('Token Storage (HttpOnly cookies)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
    });

    // ============ saveTokens (no-op) ============

    describe('saveTokens', () => {
        it('should be a no-op (server sets HttpOnly cookies)', () => {
            saveTokens({ accessToken: 'at_123', refreshToken: 'rt_456', expiresIn: 900 });

            // Nothing stored client-side
            expect(sessionStorage.getItem('stenvault_access_token')).toBeNull();
            expect(localStorage.getItem('stenvault_refresh_token')).toBeNull();
            expect(localStorage.getItem('stenvault_token_expires_at')).toBeNull();
        });

        it('should not throw', () => {
            expect(() => saveTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 }))
                .not.toThrow();
        });
    });

    // ============ getAccessToken (always null) ============

    describe('getAccessToken', () => {
        it('should always return null (HttpOnly cookie not readable by JS)', () => {
            expect(getAccessToken()).toBeNull();
        });
    });

    // ============ getRefreshToken (always null) ============

    describe('getRefreshToken', () => {
        it('should always return null (HttpOnly cookie not readable by JS)', () => {
            expect(getRefreshToken()).toBeNull();
        });
    });

    // ============ getTokenExpiresAt (always null) ============

    describe('getTokenExpiresAt', () => {
        it('should always return null (managed by cookie maxAge)', () => {
            expect(getTokenExpiresAt()).toBeNull();
        });
    });

    // ============ clearTokens (legacy cleanup) ============

    describe('clearTokens', () => {
        it('should remove legacy token keys', () => {
            sessionStorage.setItem('stenvault_access_token', 'old');
            localStorage.setItem('stenvault_refresh_token', 'old');
            localStorage.setItem('stenvault_token_expires_at', '123');
            localStorage.setItem('authToken', 'legacy');

            clearTokens();

            expect(sessionStorage.getItem('stenvault_access_token')).toBeNull();
            expect(localStorage.getItem('stenvault_refresh_token')).toBeNull();
            expect(localStorage.getItem('stenvault_token_expires_at')).toBeNull();
            expect(localStorage.getItem('authToken')).toBeNull();
        });

        it('should not throw if storage fails', () => {
            const spy = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
                throw new DOMException('SecurityError');
            });
            expect(() => clearTokens()).not.toThrow();
            spy.mockRestore();
        });
    });

    // ============ isAccessTokenValid (always false) ============

    describe('isAccessTokenValid', () => {
        it('should always return false (validity determined by server)', () => {
            expect(isAccessTokenValid()).toBe(false);
        });
    });

    // ============ hasRefreshToken (always false) ============

    describe('hasRefreshToken', () => {
        it('should always return false (HttpOnly cookie not readable by JS)', () => {
            expect(hasRefreshToken()).toBe(false);
        });
    });
});
