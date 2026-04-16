/**
 * Token Storage Tests (HttpOnly Cookie Migration)
 *
 * After migration to HttpOnly cookies, the only client-side operation
 * is clearTokens() which removes legacy storage keys on logout.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearTokens } from './tokenStorage';

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
});
