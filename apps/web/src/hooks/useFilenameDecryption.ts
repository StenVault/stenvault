/**
 * useFilenameDecryption Hook
 * 
 * Phase 5 Zero-Knowledge: Decrypts encrypted filenames for display.
 * Caches decrypted filenames to avoid re-decryption on each render.
 */

import { useReducer, useState, useCallback, useRef, useEffect } from 'react';
import { useMasterKey } from './useMasterKey';
import { useOrgMasterKey } from './useOrgMasterKey';
import { decryptFilename } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import type { FileItem } from '@/components/files/types';

interface DecryptedFilenameCache {
    [fileId: number]: string;
}

interface UseFilenameDecryptionReturn {
    /** Get the display name for a file (decrypted if possible, fallback otherwise) */
    getDisplayName: (file: FileItem) => string;
    /** Decrypt all filenames in a list of files */
    decryptFilenames: (files: FileItem[]) => Promise<FileItem[]>;
    /** Whether decryption is currently in progress */
    isDecrypting: boolean;
    /** Clear the decryption cache */
    clearCache: () => void;
}

/**
 * Hook to decrypt encrypted filenames with caching
 * 
 * @example
 * ```tsx
 * const { getDisplayName, decryptFilenames, isDecrypting } = useFilenameDecryption();
 * 
 * // In effect to decrypt all files when data changes:
 * useEffect(() => {
 *   if (files) decryptFilenames(files);
 * }, [files]);
 * 
 * // In render:
 * <span>{getDisplayName(file)}</span>
 * ```
 */
export function useFilenameDecryption(): UseFilenameDecryptionReturn {
    const { deriveFilenameKey, isUnlocked, isConfigured } = useMasterKey();
    const { unlockOrgVault, deriveOrgFilenameKey } = useOrgMasterKey();

    // Cache for decrypted filenames
    const cacheRef = useRef<DecryptedFilenameCache>({});
    const [isDecrypting, setIsDecrypting] = useState(false);

    // Force re-render after cache updates
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    /**
     * Get display name for a file
     * Returns cached decrypted name, or fallback if not decrypted yet
     */
    const getDisplayName = useCallback((file: FileItem): string => {
        // If we have a cached decrypted name, use it
        const cached = cacheRef.current[file.id];
        if (cached !== undefined) {
            return cached;
        }

        // If file has a decryptedFilename already set, use it
        if (file.decryptedFilename) {
            return file.decryptedFilename;
        }

        // Not yet decrypted — show extension if available, otherwise encrypted indicator
        if (file.plaintextExtension) {
            return `[Encrypted]${file.plaintextExtension}`;
        }

        return '[Encrypted]';
    }, []);

    /**
     * Decrypt all filenames in a list of files
     * Updates the cache and returns files with decryptedFilename populated
     */
    const decryptFilenames = useCallback(async (files: FileItem[]): Promise<FileItem[]> => {
        if (!isConfigured || !isUnlocked) {
            // Can't decrypt without Master Key
            return files;
        }

        // Filter files that need decryption (have encrypted filename and not cached)
        const needsDecryption = files.filter(
            f => f.encryptedFilename && f.filenameIv && !cacheRef.current[f.id]
        );

        if (needsDecryption.length === 0) {
            // All files already cached or don't need decryption
            return files.map(f => ({
                ...f,
                decryptedFilename: cacheRef.current[f.id] || undefined,
            }));
        }

        setIsDecrypting(true);

        try {
            // Group files by organizationId to derive correct key per context
            const personalFiles = needsDecryption.filter(f => !f.organizationId);
            const orgFilesByOrgId = new Map<number, FileItem[]>();
            for (const f of needsDecryption) {
                if (f.organizationId) {
                    const existing = orgFilesByOrgId.get(f.organizationId) ?? [];
                    existing.push(f);
                    orgFilesByOrgId.set(f.organizationId, existing);
                }
            }

            debugLog('[DECRYPT]', `Decrypting ${needsDecryption.length} filenames (personal: ${personalFiles.length}, orgs: ${orgFilesByOrgId.size})...`);

            // Helper to decrypt a batch of files with a given key
            const decryptBatch = async (batch: FileItem[], key: CryptoKey) => {
                await Promise.all(batch.map(async (file) => {
                    try {
                        const decrypted = await decryptFilename(
                            file.encryptedFilename!,
                            key,
                            file.filenameIv!
                        );
                        cacheRef.current[file.id] = decrypted;
                    } catch (error) {
                        debugWarn('[DECRYPT]', `Failed to decrypt filename for file ${file.id}`, error);
                        const fallback = file.plaintextExtension
                            ? `[Encrypted]${file.plaintextExtension}`
                            : '[Encrypted]';
                        cacheRef.current[file.id] = fallback;
                    }
                }));
            };

            // Decrypt personal files
            if (personalFiles.length > 0) {
                const filenameKey = await deriveFilenameKey();
                await decryptBatch(personalFiles, filenameKey);
            }

            // Decrypt org files (per-org key derivation)
            for (const [orgId, orgFiles] of orgFilesByOrgId) {
                try {
                    await unlockOrgVault(orgId);
                    const orgFilenameKey = await deriveOrgFilenameKey(orgId);
                    await decryptBatch(orgFiles, orgFilenameKey);
                } catch (error) {
                    debugWarn('[DECRYPT]', `Failed to derive org ${orgId} filename key`, error);
                    // Fallback for all files in this org
                    for (const file of orgFiles) {
                        if (!cacheRef.current[file.id]) {
                            cacheRef.current[file.id] = file.plaintextExtension
                                ? `[Encrypted]${file.plaintextExtension}`
                                : '[Encrypted]';
                        }
                    }
                }
            }

            debugLog('[DECRYPT]', 'Filename decryption complete');

            // Force re-render to show decrypted names
            forceUpdate();

        } catch (error) {
            debugWarn('[DECRYPT]', 'Failed to derive filename key', error);
        } finally {
            setIsDecrypting(false);
        }

        // Return files with decrypted names
        return files.map(f => ({
            ...f,
            decryptedFilename: cacheRef.current[f.id] || undefined,
        }));
    }, [isConfigured, isUnlocked, deriveFilenameKey, unlockOrgVault, deriveOrgFilenameKey]);

    /**
     * Clear the decryption cache
     */
    const clearCache = useCallback(() => {
        cacheRef.current = {};
        forceUpdate();
    }, []);

    // Clear cache when vault is locked
    useEffect(() => {
        if (!isUnlocked) {
            clearCache();
        }
    }, [isUnlocked, clearCache]);

    return {
        getDisplayName,
        decryptFilenames,
        isDecrypting,
        clearCache,
    };
}
