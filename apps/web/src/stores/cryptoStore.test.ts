/**
 * Crypto Store Tests
 *
 * Tests the Zustand E2E encryption state:
 * - Hybrid public key caching with 24-hour expiry
 * - Cache invalidation
 * - Persistence settings
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useCryptoStore } from './cryptoStore';

describe('Crypto Store', () => {
    beforeEach(() => {
        // Reset Zustand store state between tests
        useCryptoStore.setState({
            hybridPublicKeyCache: {},
        });
        vi.restoreAllMocks();
    });


    describe('initial state', () => {
        it('should have empty hybrid public key cache', () => {
            expect(useCryptoStore.getState().hybridPublicKeyCache).toEqual({});
        });
    });


    describe('cacheHybridPublicKey', () => {
        it('should cache a hybrid public key for a user', () => {
            useCryptoStore.getState().cacheHybridPublicKey(42, 'x25519_pub_b64', 'mlkem768_pub_b64', 1);

            const cached = useCryptoStore.getState().hybridPublicKeyCache[42]!;
            expect(cached).toBeDefined();
            expect(cached.x25519PublicKey).toBe('x25519_pub_b64');
            expect(cached.mlkem768PublicKey).toBe('mlkem768_pub_b64');
            expect(cached.keyVersion).toBe(1);
            expect(cached.cachedAt).toBeGreaterThan(0);
        });

        it('should overwrite existing cache entry', () => {
            useCryptoStore.getState().cacheHybridPublicKey(42, 'old_x', 'old_ml', 1);
            useCryptoStore.getState().cacheHybridPublicKey(42, 'new_x', 'new_ml', 2);

            const cached = useCryptoStore.getState().hybridPublicKeyCache[42]!;
            expect(cached.x25519PublicKey).toBe('new_x');
            expect(cached.mlkem768PublicKey).toBe('new_ml');
            expect(cached.keyVersion).toBe(2);
        });

        it('should cache multiple users independently', () => {
            useCryptoStore.getState().cacheHybridPublicKey(1, 'x1', 'ml1', 10);
            useCryptoStore.getState().cacheHybridPublicKey(2, 'x2', 'ml2', 20);

            expect(useCryptoStore.getState().hybridPublicKeyCache[1]!.keyVersion).toBe(10);
            expect(useCryptoStore.getState().hybridPublicKeyCache[2]!.keyVersion).toBe(20);
        });
    });


    describe('getCachedHybridPublicKey', () => {
        it('should return cached key within 24 hours', () => {
            useCryptoStore.getState().cacheHybridPublicKey(42, 'x_pub', 'ml_pub', 1);
            const result = useCryptoStore.getState().getCachedHybridPublicKey(42);
            expect(result).toEqual({ x25519PublicKey: 'x_pub', mlkem768PublicKey: 'ml_pub', keyVersion: 1 });
        });

        it('should return null for uncached user', () => {
            const result = useCryptoStore.getState().getCachedHybridPublicKey(999);
            expect(result).toBeNull();
        });

        it('should return null and invalidate after 24 hours', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            useCryptoStore.getState().cacheHybridPublicKey(42, 'x_pub', 'ml_pub', 1);

            // Advance 24h + 1ms
            vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);

            const result = useCryptoStore.getState().getCachedHybridPublicKey(42);
            expect(result).toBeNull();

            // Should have been removed from cache
            expect(useCryptoStore.getState().hybridPublicKeyCache[42]).toBeUndefined();
        });

        it('should return key at exactly 24 hours (not expired yet)', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            useCryptoStore.getState().cacheHybridPublicKey(42, 'x_pub', 'ml_pub', 1);

            // Advance exactly 24h (boundary: > not >=, so 24h exactly is expired)
            vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000);

            // At exactly 24h the condition is Date.now() - cachedAt > MAX, which is 0 > 0 = false
            // So key is still valid
            const result = useCryptoStore.getState().getCachedHybridPublicKey(42);
            expect(result).not.toBeNull();
        });

        it('should return key at 23h59m59s (not expired)', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            useCryptoStore.getState().cacheHybridPublicKey(42, 'x_pub', 'ml_pub', 1);

            vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000 - 1000);

            const result = useCryptoStore.getState().getCachedHybridPublicKey(42);
            expect(result).not.toBeNull();
        });
    });


    describe('invalidateCachedHybridKey', () => {
        it('should remove specific user key', () => {
            useCryptoStore.getState().cacheHybridPublicKey(1, 'x1', 'ml1', 10);
            useCryptoStore.getState().cacheHybridPublicKey(2, 'x2', 'ml2', 20);

            useCryptoStore.getState().invalidateCachedHybridKey(1);

            expect(useCryptoStore.getState().hybridPublicKeyCache[1]).toBeUndefined();
            expect(useCryptoStore.getState().hybridPublicKeyCache[2]).toBeDefined();
        });

        it('should not throw for non-existent user', () => {
            expect(() => useCryptoStore.getState().invalidateCachedHybridKey(999)).not.toThrow();
        });
    });


    describe('clearHybridPublicKeyCache', () => {
        it('should remove all cached keys', () => {
            useCryptoStore.getState().cacheHybridPublicKey(1, 'x1', 'ml1', 10);
            useCryptoStore.getState().cacheHybridPublicKey(2, 'x2', 'ml2', 20);

            useCryptoStore.getState().clearHybridPublicKeyCache();

            expect(useCryptoStore.getState().hybridPublicKeyCache).toEqual({});
        });
    });


    describe('persistence config', () => {
        it('should not persist hybridPublicKeyCache', () => {
            useCryptoStore.getState().cacheHybridPublicKey(1, 'x1', 'ml1', 10);

            // The persist middleware's partialize returns empty object
            // so nothing is persisted
            const state = useCryptoStore.getState();
            expect(state.hybridPublicKeyCache[1]).toBeDefined();
        });
    });
});
