/**
 * useThumbnailDecryption Hook (Phase 7.2)
 *
 * Provides decryption and caching of encrypted thumbnails for display.
 * Fetches encrypted thumbnails from R2, decrypts with Master Key, and
 * caches blob URLs in memory for performance.
 *
 * @module useThumbnailDecryption
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMasterKey } from './useMasterKey';
import { decryptThumbnailFromUrl } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';

interface CacheEntry {
    blobUrl: string;
    createdAt: number;
}

export const thumbnailCache = new Map<number, CacheEntry>();
export const CACHE_MAX_SIZE = 100;
export const CACHE_TTL_MS = 30 * 60 * 1000;

export function cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: number[] = [];

    thumbnailCache.forEach((entry, key) => {
        if (now - entry.createdAt > CACHE_TTL_MS) {
            URL.revokeObjectURL(entry.blobUrl);
            expiredKeys.push(key);
        }
    });

    expiredKeys.forEach((key) => thumbnailCache.delete(key));
}

export function addToCache(fileId: number, blobUrl: string): void {
    cleanupCache();

    if (thumbnailCache.size >= CACHE_MAX_SIZE) {
        let oldestKey: number | null = null;
        let oldestTime = Infinity;

        thumbnailCache.forEach((entry, key) => {
            if (entry.createdAt < oldestTime) {
                oldestTime = entry.createdAt;
                oldestKey = key;
            }
        });

        if (oldestKey !== null) {
            const oldEntry = thumbnailCache.get(oldestKey);
            if (oldEntry) URL.revokeObjectURL(oldEntry.blobUrl);
            thumbnailCache.delete(oldestKey);
        }
    }

    thumbnailCache.set(fileId, {
        blobUrl,
        createdAt: Date.now(),
    });
}

export function getCached(fileId: number): string | null {
    const entry = thumbnailCache.get(fileId);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
        URL.revokeObjectURL(entry.blobUrl);
        thumbnailCache.delete(fileId);
        return null;
    }

    return entry.blobUrl;
}

export interface ThumbnailDecryptionState {
    url: string | null;
    isLoading: boolean;
    error: string | null;
}

export interface UseThumbnailDecryptionParams {
    fileId: number;
    thumbnailUrl: string | null;
    thumbnailIv: string | null;
    /** Override fileId for HKDF key derivation (for duplicated files that share the original's thumbnail key) */
    keyDerivationFileId?: number;
    autoFetch?: boolean;
}

export interface UseThumbnailDecryptionReturn extends ThumbnailDecryptionState {
    decrypt: () => Promise<void>;
    clear: () => void;
}

/**
 * @example
 * ```tsx
 * const { url, isLoading, error } = useThumbnailDecryption({
 *   fileId: file.id,
 *   thumbnailUrl: file.thumbnailUrl,
 *   thumbnailIv: file.thumbnailIv,
 * });
 *
 * if (isLoading) return <Skeleton />;
 * if (url) return <img src={url} alt="thumbnail" />;
 * return <FallbackIcon />;
 * ```
 */
export function useThumbnailDecryption({
    fileId,
    thumbnailUrl,
    thumbnailIv,
    keyDerivationFileId,
    autoFetch = true,
}: UseThumbnailDecryptionParams): UseThumbnailDecryptionReturn {
    const [url, setUrl] = useState<string | null>(() => getCached(fileId));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { deriveThumbnailKey, isUnlocked } = useMasterKey();
    const decryptionInProgress = useRef(false);

    const decrypt = useCallback(async () => {
        if (!thumbnailUrl || !thumbnailIv) {
            return;
        }

        const cached = getCached(fileId);
        if (cached) {
            setUrl(cached);
            return;
        }

        if (decryptionInProgress.current) {
            return;
        }

        if (!isUnlocked) {
            setError('Vault is locked');
            return;
        }

        decryptionInProgress.current = true;
        setIsLoading(true);
        setError(null);

        try {
            // Use original fileId for HKDF derivation so duplicated files share the same key
            const thumbnailKey = await deriveThumbnailKey((keyDerivationFileId ?? fileId).toString());

            const decryptedBlob = await decryptThumbnailFromUrl(
                thumbnailUrl,
                thumbnailKey,
                thumbnailIv
            );

            const blobUrl = URL.createObjectURL(decryptedBlob);
            addToCache(fileId, blobUrl);
            setUrl(blobUrl);

            debugLog('[THUMB]', 'Thumbnail decrypted and cached', { fileId });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Decryption failed';
            setError(message);
            debugWarn('[THUMB]', 'Thumbnail decryption failed', { fileId, error: message });
        } finally {
            setIsLoading(false);
            decryptionInProgress.current = false;
        }
    }, [fileId, thumbnailUrl, thumbnailIv, keyDerivationFileId, isUnlocked, deriveThumbnailKey]);

    const clear = useCallback(() => {
        const cached = getCached(fileId);
        if (cached) {
            URL.revokeObjectURL(cached);
            thumbnailCache.delete(fileId);
        }
        setUrl(null);
        setError(null);
    }, [fileId]);

    useEffect(() => {
        if (autoFetch && thumbnailUrl && thumbnailIv && isUnlocked && !url && !isLoading && !error) {
            decrypt();
        }
    }, [autoFetch, thumbnailUrl, thumbnailIv, isUnlocked, url, isLoading, error, decrypt]);

    // Note: Don't revoke cached blob URLs on unmount - they're shared via module-level cache.
    // Cache cleanup happens via clearThumbnailCache() when vault is locked.

    return {
        url,
        isLoading,
        error,
        decrypt,
        clear,
    };
}

/** Call this when user locks vault or logs out */
export function clearThumbnailCache(): void {
    thumbnailCache.forEach((entry) => {
        URL.revokeObjectURL(entry.blobUrl);
    });
    thumbnailCache.clear();
    debugLog('[THUMB]', 'Thumbnail cache cleared');
}
