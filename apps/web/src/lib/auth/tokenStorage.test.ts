/**
 * Token Storage Tests
 *
 * Tests the low-level token storage layer:
 * - Access token in sessionStorage
 * - Refresh token in localStorage
 * - Expiry validation with 1-minute buffer
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

describe('Token Storage', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
    });

    // ============ saveTokens ============

    describe('saveTokens', () => {
        it('should store access token in sessionStorage', () => {
            saveTokens({ accessToken: 'at_123', refreshToken: 'rt_456', expiresIn: 900 });
            expect(sessionStorage.getItem('stenvault_access_token')).toBe('at_123');
        });

        it('should store refresh token in localStorage', () => {
            saveTokens({ accessToken: 'at_123', refreshToken: 'rt_456', expiresIn: 900 });
            expect(localStorage.getItem('stenvault_refresh_token')).toBe('rt_456');
        });

        it('should store correct expiry timestamp', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            saveTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });

            const stored = localStorage.getItem('stenvault_token_expires_at');
            expect(stored).toBe(String(now + 900_000));
        });

        it('should overwrite existing tokens', () => {
            saveTokens({ accessToken: 'old', refreshToken: 'old_rt', expiresIn: 100 });
            saveTokens({ accessToken: 'new', refreshToken: 'new_rt', expiresIn: 200 });

            expect(sessionStorage.getItem('stenvault_access_token')).toBe('new');
            expect(localStorage.getItem('stenvault_refresh_token')).toBe('new_rt');
        });

        it('should throw if sessionStorage fails', () => {
            const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
                throw new DOMException('QuotaExceededError');
            });

            expect(() => saveTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 }))
                .toThrow('Failed to save authentication tokens');

            spy.mockRestore();
        });
    });

    // ============ getAccessToken ============

    describe('getAccessToken', () => {
        it('should return stored access token', () => {
            sessionStorage.setItem('stenvault_access_token', 'my_token');
            expect(getAccessToken()).toBe('my_token');
        });

        it('should return null when no token stored', () => {
            expect(getAccessToken()).toBeNull();
        });

        it('should return null if sessionStorage throws', () => {
            const spy = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
                throw new DOMException('SecurityError');
            });
            expect(getAccessToken()).toBeNull();
            spy.mockRestore();
        });
    });

    // ============ getRefreshToken ============

    describe('getRefreshToken', () => {
        it('should return stored refresh token', () => {
            localStorage.setItem('stenvault_refresh_token', 'rt_token');
            expect(getRefreshToken()).toBe('rt_token');
        });

        it('should return null when no token stored', () => {
            expect(getRefreshToken()).toBeNull();
        });

        it('should return null if localStorage throws', () => {
            const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
                throw new DOMException('SecurityError');
            });
            expect(getRefreshToken()).toBeNull();
            spy.mockRestore();
        });
    });

    // ============ getTokenExpiresAt ============

    describe('getTokenExpiresAt', () => {
        it('should return stored timestamp as number', () => {
            localStorage.setItem('stenvault_token_expires_at', '1700000000000');
            expect(getTokenExpiresAt()).toBe(1700000000000);
        });

        it('should return null when no expiry stored', () => {
            expect(getTokenExpiresAt()).toBeNull();
        });

        it('should parse integer correctly', () => {
            localStorage.setItem('stenvault_token_expires_at', '12345');
            expect(getTokenExpiresAt()).toBe(12345);
        });
    });

    // ============ clearTokens ============

    describe('clearTokens', () => {
        it('should remove all token keys', () => {
            saveTokens({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
            clearTokens();

            expect(sessionStorage.getItem('stenvault_access_token')).toBeNull();
            expect(localStorage.getItem('stenvault_refresh_token')).toBeNull();
            expect(localStorage.getItem('stenvault_token_expires_at')).toBeNull();
        });

        it('should remove legacy authToken key', () => {
            localStorage.setItem('authToken', 'legacy_token');
            clearTokens();
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

    // ============ isAccessTokenValid ============

    describe('isAccessTokenValid', () => {
        it('should return false when no token exists', () => {
            expect(isAccessTokenValid()).toBe(false);
        });

        it('should return false when no expiry exists', () => {
            sessionStorage.setItem('stenvault_access_token', 'token');
            expect(isAccessTokenValid()).toBe(false);
        });

        it('should return true for non-expired token', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            sessionStorage.setItem('stenvault_access_token', 'token');
            localStorage.setItem('stenvault_token_expires_at', String(now + 900_000));

            expect(isAccessTokenValid()).toBe(true);
        });

        it('should return false for expired token', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            sessionStorage.setItem('stenvault_access_token', 'token');
            localStorage.setItem('stenvault_token_expires_at', String(now - 1000));

            expect(isAccessTokenValid()).toBe(false);
        });

        it('should return false within 1-minute buffer', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            sessionStorage.setItem('stenvault_access_token', 'token');
            // Expires in 30 seconds (within 60s buffer)
            localStorage.setItem('stenvault_token_expires_at', String(now + 30_000));

            expect(isAccessTokenValid()).toBe(false);
        });

        it('should return true at exactly buffer boundary + 1ms', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            sessionStorage.setItem('stenvault_access_token', 'token');
            localStorage.setItem('stenvault_token_expires_at', String(now + 60_001));

            expect(isAccessTokenValid()).toBe(true);
        });

        it('should return false at exactly buffer boundary', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            sessionStorage.setItem('stenvault_access_token', 'token');
            // now < (now + 60000) - 60000 → now < now → false
            localStorage.setItem('stenvault_token_expires_at', String(now + 60_000));

            expect(isAccessTokenValid()).toBe(false);
        });
    });

    // ============ hasRefreshToken ============

    describe('hasRefreshToken', () => {
        it('should return true when refresh token exists', () => {
            localStorage.setItem('stenvault_refresh_token', 'rt');
            expect(hasRefreshToken()).toBe(true);
        });

        it('should return false when no refresh token', () => {
            expect(hasRefreshToken()).toBe(false);
        });
    });
});
