/**
 * Tests for the thumbnail LRU cache: add/get, TTL expiry, max-size
 * eviction, and blob URL revocation on clear.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    thumbnailCache,
    CACHE_MAX_SIZE,
    CACHE_TTL_MS,
    addToCache,
    getCached,
    cleanupCache,
    clearThumbnailCache,
} from './useThumbnailDecryption';

// Mock URL.revokeObjectURL and URL.createObjectURL
const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn((blob: Blob) => `blob:mock-${Math.random()}`);

vi.stubGlobal('URL', {
    ...URL,
    revokeObjectURL,
    createObjectURL,
});

// Mock debug logger to avoid side effects
vi.mock('@/lib/debugLogger', () => ({
    debugLog: vi.fn(),
    debugWarn: vi.fn(),
}));

describe('Thumbnail Cache', () => {
    beforeEach(() => {
        // Clear cache and mocks before each test
        thumbnailCache.clear();
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        thumbnailCache.clear();
    });

    describe('constants', () => {
        it('should have max size of 100', () => {
            expect(CACHE_MAX_SIZE).toBe(100);
        });

        it('should have TTL of 30 minutes', () => {
            expect(CACHE_TTL_MS).toBe(30 * 60 * 1000);
        });
    });

    describe('addToCache', () => {
        it('should add an entry to the cache', () => {
            addToCache(1, 'blob:url-1');
            expect(thumbnailCache.size).toBe(1);
            expect(thumbnailCache.get(1)?.blobUrl).toBe('blob:url-1');
        });

        it('should set createdAt to current time', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            addToCache(1, 'blob:url-1');
            expect(thumbnailCache.get(1)?.createdAt).toBe(now);
        });

        it('should overwrite existing entry for same fileId', () => {
            addToCache(1, 'blob:url-1');
            addToCache(1, 'blob:url-2');

            expect(thumbnailCache.size).toBe(1);
            expect(thumbnailCache.get(1)?.blobUrl).toBe('blob:url-2');
        });

        it('should store multiple entries', () => {
            addToCache(1, 'blob:url-1');
            addToCache(2, 'blob:url-2');
            addToCache(3, 'blob:url-3');

            expect(thumbnailCache.size).toBe(3);
        });
    });

    describe('getCached', () => {
        it('should return null for non-existent entry', () => {
            expect(getCached(999)).toBeNull();
        });

        it('should return blob URL for cached entry', () => {
            addToCache(1, 'blob:url-1');
            expect(getCached(1)).toBe('blob:url-1');
        });

        it('should return null and clean up expired entry', () => {
            const pastTime = Date.now() - CACHE_TTL_MS - 1;

            // Manually insert expired entry
            thumbnailCache.set(1, { blobUrl: 'blob:expired', createdAt: pastTime });

            const result = getCached(1);
            expect(result).toBeNull();
            expect(thumbnailCache.has(1)).toBe(false);
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:expired');
        });

        it('should return valid entry that is not expired', () => {
            const recentTime = Date.now() - 1000; // 1 second ago

            thumbnailCache.set(1, { blobUrl: 'blob:recent', createdAt: recentTime });

            expect(getCached(1)).toBe('blob:recent');
            expect(revokeObjectURL).not.toHaveBeenCalled();
        });
    });

    describe('TTL expiry', () => {
        it('should expire entries after CACHE_TTL_MS', () => {
            const now = Date.now();

            // Add entry at a time that will be expired
            thumbnailCache.set(1, {
                blobUrl: 'blob:old',
                createdAt: now - CACHE_TTL_MS - 1,
            });

            // Add fresh entry
            thumbnailCache.set(2, {
                blobUrl: 'blob:fresh',
                createdAt: now,
            });

            expect(getCached(1)).toBeNull();
            expect(getCached(2)).toBe('blob:fresh');
        });

        it('should keep entries exactly at TTL boundary', () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            // Entry created exactly CACHE_TTL_MS ago is expired (> check)
            thumbnailCache.set(1, {
                blobUrl: 'blob:boundary',
                createdAt: now - CACHE_TTL_MS,
            });

            // Exactly at boundary: Date.now() - createdAt === CACHE_TTL_MS, not > CACHE_TTL_MS
            expect(getCached(1)).toBe('blob:boundary');
        });
    });

    describe('LRU eviction (max size)', () => {
        it('should evict oldest entry when cache reaches max size', () => {
            const baseTime = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);

            // Fill cache to max
            for (let i = 0; i < CACHE_MAX_SIZE; i++) {
                thumbnailCache.set(i, {
                    blobUrl: `blob:url-${i}`,
                    createdAt: baseTime + i, // each entry 1ms newer
                });
            }

            expect(thumbnailCache.size).toBe(CACHE_MAX_SIZE);

            // Adding one more should evict the oldest (id=0, createdAt=baseTime)
            addToCache(CACHE_MAX_SIZE, `blob:url-${CACHE_MAX_SIZE}`);

            expect(thumbnailCache.size).toBe(CACHE_MAX_SIZE);
            expect(thumbnailCache.has(0)).toBe(false); // Oldest evicted
            expect(thumbnailCache.has(CACHE_MAX_SIZE)).toBe(true); // New entry added
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:url-0');
        });

        it('should not evict when under max size', () => {
            addToCache(1, 'blob:url-1');
            addToCache(2, 'blob:url-2');

            expect(thumbnailCache.size).toBe(2);
            expect(revokeObjectURL).not.toHaveBeenCalled();
        });
    });

    describe('cleanupCache', () => {
        it('should remove all expired entries', () => {
            const now = Date.now();

            // 2 expired, 1 fresh
            thumbnailCache.set(1, { blobUrl: 'blob:exp-1', createdAt: now - CACHE_TTL_MS - 1000 });
            thumbnailCache.set(2, { blobUrl: 'blob:exp-2', createdAt: now - CACHE_TTL_MS - 2000 });
            thumbnailCache.set(3, { blobUrl: 'blob:fresh', createdAt: now });

            cleanupCache();

            expect(thumbnailCache.size).toBe(1);
            expect(thumbnailCache.has(3)).toBe(true);
            expect(revokeObjectURL).toHaveBeenCalledTimes(2);
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:exp-1');
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:exp-2');
        });

        it('should handle empty cache', () => {
            cleanupCache();
            expect(thumbnailCache.size).toBe(0);
        });

        it('should not remove any entries if none are expired', () => {
            const now = Date.now();
            thumbnailCache.set(1, { blobUrl: 'blob:fresh-1', createdAt: now });
            thumbnailCache.set(2, { blobUrl: 'blob:fresh-2', createdAt: now - 1000 });

            cleanupCache();

            expect(thumbnailCache.size).toBe(2);
            expect(revokeObjectURL).not.toHaveBeenCalled();
        });
    });

    describe('clearThumbnailCache', () => {
        it('should clear all entries', () => {
            addToCache(1, 'blob:url-1');
            addToCache(2, 'blob:url-2');
            addToCache(3, 'blob:url-3');

            clearThumbnailCache();

            expect(thumbnailCache.size).toBe(0);
        });

        it('should revoke all blob URLs', () => {
            addToCache(1, 'blob:url-1');
            addToCache(2, 'blob:url-2');

            clearThumbnailCache();

            expect(revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:url-2');
        });

        it('should handle empty cache', () => {
            clearThumbnailCache();
            expect(thumbnailCache.size).toBe(0);
            expect(revokeObjectURL).not.toHaveBeenCalled();
        });
    });

    describe('blob URL revocation', () => {
        it('should revoke blob URL when entry is evicted by LRU', () => {
            const baseTime = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);

            for (let i = 0; i < CACHE_MAX_SIZE; i++) {
                thumbnailCache.set(i, {
                    blobUrl: `blob:url-${i}`,
                    createdAt: baseTime + i,
                });
            }

            addToCache(CACHE_MAX_SIZE, 'blob:new');

            expect(revokeObjectURL).toHaveBeenCalledWith('blob:url-0');
        });

        it('should revoke blob URL when expired entry is accessed', () => {
            thumbnailCache.set(1, {
                blobUrl: 'blob:expired',
                createdAt: Date.now() - CACHE_TTL_MS - 1,
            });

            getCached(1);

            expect(revokeObjectURL).toHaveBeenCalledWith('blob:expired');
        });

        it('should revoke blob URL when expired entry is cleaned up', () => {
            thumbnailCache.set(1, {
                blobUrl: 'blob:expired',
                createdAt: Date.now() - CACHE_TTL_MS - 1,
            });

            cleanupCache();

            expect(revokeObjectURL).toHaveBeenCalledWith('blob:expired');
        });

        it('should revoke all blob URLs on full cache clear', () => {
            addToCache(1, 'blob:a');
            addToCache(2, 'blob:b');
            addToCache(3, 'blob:c');

            clearThumbnailCache();

            expect(revokeObjectURL).toHaveBeenCalledTimes(3);
        });
    });
});
