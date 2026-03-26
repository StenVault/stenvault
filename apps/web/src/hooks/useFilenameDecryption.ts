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
    getDisplayName: (file: FileItem) => string;
    decryptFilenames: (files: FileItem[]) => Promise<FileItem[]>;
    isDecrypting: boolean;
    clearCache: () => void;
}

/**
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

    const cacheRef = useRef<DecryptedFilenameCache>({});
    const [isDecrypting, setIsDecrypting] = useState(false);

    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    const getDisplayName = useCallback((file: FileItem): string => {
        const cached = cacheRef.current[file.id];
        if (cached !== undefined) {
            return cached;
        }

        if (file.decryptedFilename) {
            return file.decryptedFilename;
        }

        if (file.plaintextExtension) {
            return `[Encrypted]${file.plaintextExtension}`;
        }

        return '[Encrypted]';
    }, []);

    const decryptFilenames = useCallback(async (files: FileItem[]): Promise<FileItem[]> => {
        if (!isConfigured || !isUnlocked) {
            return files;
        }

        const needsDecryption = files.filter(
            f => f.encryptedFilename && f.filenameIv && !cacheRef.current[f.id]
        );

        if (needsDecryption.length === 0) {
            return files.map(f => ({
                ...f,
                decryptedFilename: cacheRef.current[f.id] || undefined,
            }));
        }

        setIsDecrypting(true);

        try {
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

            if (personalFiles.length > 0) {
                const filenameKey = await deriveFilenameKey();
                await decryptBatch(personalFiles, filenameKey);
            }

            for (const [orgId, orgFiles] of orgFilesByOrgId) {
                try {
                    await unlockOrgVault(orgId);
                    const orgFilenameKey = await deriveOrgFilenameKey(orgId);
                    await decryptBatch(orgFiles, orgFilenameKey);
                } catch (error) {
                    debugWarn('[DECRYPT]', `Failed to derive org ${orgId} filename key`, error);
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

            forceUpdate();
        } catch (error) {
            debugWarn('[DECRYPT]', 'Failed to derive filename key', error);
        } finally {
            setIsDecrypting(false);
        }

        return files.map(f => ({
            ...f,
            decryptedFilename: cacheRef.current[f.id] || undefined,
        }));
    }, [isConfigured, isUnlocked, deriveFilenameKey, unlockOrgVault, deriveOrgFilenameKey]);

    const clearCache = useCallback(() => {
        cacheRef.current = {};
        forceUpdate();
    }, []);

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
