/**
 * Token Manager Tests (HttpOnly Cookie Migration)
 *
 * After migration:
 * - storeTokenPair is a no-op (server sets cookies)
 * - getValidAccessToken always returns null (token in HttpOnly cookie)
 * - hasValidSession always returns false (can't read HttpOnly cookies)
 * - refreshSession calls the refresh endpoint via cookie-based auth
 * - clearAllTokens cleans up legacy storage keys
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock tokenStorage
vi.mock('./tokenStorage', () => ({
    clearTokens: vi.fn(),
}));

import {
    storeTokenPair,
    getValidAccessToken,
    clearAllTokens,
    hasValidSession,
    refreshSession,
} from './tokenManager';
import { clearTokens } from './tokenStorage';

// Helper to mock fetch for refresh endpoint
function mockFetchRefresh(response: { ok: boolean; status?: number; body?: any }) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 401),
        json: async () => response.body ?? {},
    } as Response);
}

describe('Token Manager (HttpOnly cookies)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ============ storeTokenPair (no-op) ============

    describe('storeTokenPair', () => {
        it('should be a no-op (server sets HttpOnly cookies)', () => {
            const pair = { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 };
            storeTokenPair(pair);
            // Does not throw, no side effects
        });
    });

    // ============ clearAllTokens ============

    describe('clearAllTokens', () => {
        it('should delegate to clearTokens for legacy cleanup', () => {
            clearAllTokens();
            expect(clearTokens).toHaveBeenCalled();
        });
    });

    // ============ hasValidSession ============

    describe('hasValidSession', () => {
        it('should return false (cannot read HttpOnly cookies)', () => {
            expect(hasValidSession()).toBe(false);
        });
    });

    // ============ getValidAccessToken ============

    describe('getValidAccessToken', () => {
        it('should always return null (token in HttpOnly cookie)', async () => {
            const token = await getValidAccessToken();
            expect(token).toBeNull();
        });
    });

    // ============ refreshSession ============

    describe('refreshSession', () => {
        it('should call refresh endpoint with credentials: include', async () => {
            const fetchSpy = mockFetchRefresh({
                ok: true,
                body: { result: { data: { json: { success: true } } } },
            });

            const success = await refreshSession();

            expect(success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith('/api/trpc/auth.refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ json: {} }),
            });
        });

        it('should return false and clear legacy tokens on HTTP failure', async () => {
            mockFetchRefresh({ ok: false, status: 401 });

            const success = await refreshSession();

            expect(success).toBe(false);
            expect(clearTokens).toHaveBeenCalled();
        });

        it('should return false and clear legacy tokens on invalid response', async () => {
            mockFetchRefresh({
                ok: true,
                body: { result: { data: { json: { success: false } } } },
            });

            const success = await refreshSession();

            expect(success).toBe(false);
            expect(clearTokens).toHaveBeenCalled();
        });

        it('should return false on network error', async () => {
            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

            const success = await refreshSession();

            expect(success).toBe(false);
            expect(clearTokens).toHaveBeenCalled();
        });

        it('should deduplicate concurrent refresh calls', async () => {
            let resolveRefresh!: (value: Response) => void;
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
                new Promise(resolve => { resolveRefresh = resolve; })
            );

            const p1 = refreshSession();
            const p2 = refreshSession();
            const p3 = refreshSession();

            expect(fetchSpy).toHaveBeenCalledTimes(1);

            resolveRefresh({
                ok: true,
                json: async () => ({ result: { data: { json: { success: true } } } }),
            } as Response);

            const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
            expect(r1).toBe(true);
            expect(r2).toBe(true);
            expect(r3).toBe(true);
        });

        it('should reset lock after refresh completes', async () => {
            const fetchSpy = mockFetchRefresh({
                ok: true,
                body: { result: { data: { json: { success: true } } } },
            });

            await refreshSession();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            // Second call should make a new fetch
            await refreshSession();
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });
    });
});
