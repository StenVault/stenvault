/**
 * Token Manager Tests
 *
 * Tests the high-level token lifecycle:
 * - Auto-refresh when access token expires
 * - Concurrent refresh lock (prevents duplicate refresh calls)
 * - Token rotation (single-use refresh tokens)
 * - Graceful failure and token cleanup
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock tokenStorage — must be before import
vi.mock('./tokenStorage', () => ({
    saveTokens: vi.fn(),
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    isAccessTokenValid: vi.fn(),
    clearTokens: vi.fn(),
    hasRefreshToken: vi.fn(),
}));

import {
    storeTokenPair,
    getValidAccessToken,
    clearAllTokens,
    hasValidSession,
} from './tokenManager';
import {
    saveTokens,
    getAccessToken,
    getRefreshToken,
    isAccessTokenValid,
    clearTokens,
    hasRefreshToken,
} from './tokenStorage';

// Helper to mock fetch for refresh endpoint
function mockFetchRefresh(response: { ok: boolean; status?: number; body?: any }) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 401),
        json: async () => response.body ?? {},
    } as Response);
}

describe('Token Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ============ storeTokenPair ============

    describe('storeTokenPair', () => {
        it('should delegate to saveTokens', () => {
            const pair = { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 };
            storeTokenPair(pair);
            expect(saveTokens).toHaveBeenCalledWith(pair);
        });
    });

    // ============ clearAllTokens ============

    describe('clearAllTokens', () => {
        it('should delegate to clearTokens', () => {
            clearAllTokens();
            expect(clearTokens).toHaveBeenCalled();
        });
    });

    // ============ hasValidSession ============

    describe('hasValidSession', () => {
        it('should return true when refresh token exists', () => {
            vi.mocked(hasRefreshToken).mockReturnValue(true);
            expect(hasValidSession()).toBe(true);
        });

        it('should return false when no refresh token', () => {
            vi.mocked(hasRefreshToken).mockReturnValue(false);
            expect(hasValidSession()).toBe(false);
        });
    });

    // ============ getValidAccessToken ============

    describe('getValidAccessToken', () => {
        it('should return access token when still valid (fast path)', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(true);
            vi.mocked(getAccessToken).mockReturnValue('valid_token');

            const token = await getValidAccessToken();
            expect(token).toBe('valid_token');
        });

        it('should not call fetch when token is valid', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(true);
            vi.mocked(getAccessToken).mockReturnValue('valid_token');
            const fetchSpy = vi.spyOn(globalThis, 'fetch');

            await getValidAccessToken();
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('should return null when no refresh token available', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue(null);

            const token = await getValidAccessToken();
            expect(token).toBeNull();
        });

        it('should refresh and return new token when expired', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('old_rt');

            mockFetchRefresh({
                ok: true,
                body: {
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'new_at',
                                refreshToken: 'new_rt',
                                expiresIn: 900,
                            },
                        },
                    },
                },
            });

            const token = await getValidAccessToken();
            expect(token).toBe('new_at');
            expect(saveTokens).toHaveBeenCalledWith({
                accessToken: 'new_at',
                refreshToken: 'new_rt',
                expiresIn: 900,
            });
        });

        it('should use default expiresIn of 900 when not provided', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('old_rt');

            mockFetchRefresh({
                ok: true,
                body: {
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'at',
                                refreshToken: 'rt',
                                // No expiresIn
                            },
                        },
                    },
                },
            });

            await getValidAccessToken();
            expect(saveTokens).toHaveBeenCalledWith(
                expect.objectContaining({ expiresIn: 900 })
            );
        });

        it('should clear tokens on refresh failure (HTTP error)', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('old_rt');

            mockFetchRefresh({ ok: false, status: 401 });

            const token = await getValidAccessToken();
            expect(token).toBeNull();
            expect(clearTokens).toHaveBeenCalled();
        });

        it('should clear tokens on refresh failure (invalid response)', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('old_rt');

            mockFetchRefresh({
                ok: true,
                body: { result: { data: { json: { success: false } } } },
            });

            const token = await getValidAccessToken();
            expect(token).toBeNull();
            expect(clearTokens).toHaveBeenCalled();
        });

        it('should clear tokens on network error', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('old_rt');

            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

            const token = await getValidAccessToken();
            expect(token).toBeNull();
            expect(clearTokens).toHaveBeenCalled();
        });

        it('should handle superjson wrapper format', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('rt');

            mockFetchRefresh({
                ok: true,
                body: {
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'superjson_at',
                                refreshToken: 'superjson_rt',
                                expiresIn: 600,
                            },
                        },
                    },
                },
            });

            const token = await getValidAccessToken();
            expect(token).toBe('superjson_at');
        });

        it('should handle flat response format (fallback)', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('rt');

            mockFetchRefresh({
                ok: true,
                body: {
                    success: true,
                    accessToken: 'flat_at',
                    refreshToken: 'flat_rt',
                    expiresIn: 300,
                },
            });

            const token = await getValidAccessToken();
            expect(token).toBe('flat_at');
        });

        // ---- Concurrent refresh lock ----

        it('should deduplicate concurrent refresh calls', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('rt');

            let resolveRefresh!: (value: Response) => void;
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
                new Promise(resolve => { resolveRefresh = resolve; })
            );

            // Fire 3 concurrent calls
            const p1 = getValidAccessToken();
            const p2 = getValidAccessToken();
            const p3 = getValidAccessToken();

            // Only 1 fetch should have been made
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            // Resolve the single refresh
            resolveRefresh({
                ok: true,
                json: async () => ({
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'shared_at',
                                refreshToken: 'shared_rt',
                                expiresIn: 900,
                            },
                        },
                    },
                }),
            } as Response);

            const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
            expect(t1).toBe('shared_at');
            expect(t2).toBe('shared_at');
            expect(t3).toBe('shared_at');
        });

        it('should notify subscribers with null on refresh failure', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('rt');

            let resolveRefresh!: (value: Response) => void;
            vi.spyOn(globalThis, 'fetch').mockReturnValue(
                new Promise(resolve => { resolveRefresh = resolve; })
            );

            const p1 = getValidAccessToken();
            const p2 = getValidAccessToken();

            resolveRefresh({
                ok: false,
                status: 401,
                json: async () => ({}),
            } as Response);

            const [t1, t2] = await Promise.all([p1, p2]);
            expect(t1).toBeNull();
            expect(t2).toBeNull();
        });

        it('should reset lock after refresh completes (allow subsequent refreshes)', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('rt');

            // First refresh succeeds
            const fetchSpy = mockFetchRefresh({
                ok: true,
                body: {
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'at1',
                                refreshToken: 'rt1',
                                expiresIn: 900,
                            },
                        },
                    },
                },
            });

            await getValidAccessToken();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            // Second refresh should make new fetch (lock released)
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'at2',
                                refreshToken: 'rt2',
                                expiresIn: 900,
                            },
                        },
                    },
                }),
            } as Response);

            const token = await getValidAccessToken();
            expect(token).toBe('at2');
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('should send correct request body', async () => {
            vi.mocked(isAccessTokenValid).mockReturnValue(false);
            vi.mocked(getRefreshToken).mockReturnValue('my_refresh_token');

            const fetchSpy = mockFetchRefresh({
                ok: true,
                body: {
                    result: {
                        data: {
                            json: {
                                success: true,
                                accessToken: 'at',
                                refreshToken: 'rt',
                                expiresIn: 900,
                            },
                        },
                    },
                },
            });

            await getValidAccessToken();

            expect(fetchSpy).toHaveBeenCalledWith('/api/trpc/auth.refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ json: { refreshToken: 'my_refresh_token' } }),
            });
        });
    });
});
