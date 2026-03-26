/**
 * useFoldernameDecryption Hook
 *
 * Phase C Zero-Knowledge: Decrypts encrypted folder names for display.
 * Caches decrypted folder names to avoid re-decryption on each render.
 * Mirrors useFilenameDecryption pattern.
 */

import { useReducer, useState, useCallback, useRef, useEffect } from 'react';
import { useMasterKey } from './useMasterKey';
import { useOrgMasterKey } from './useOrgMasterKey';
import { decryptFilename } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import type { FolderItem } from '@/components/files/types';

interface DecryptedFoldernameCache {
    [folderId: number]: string;
}

interface UseFoldernameDecryptionReturn {
    getDisplayName: (folder: FolderItem) => string;
    decryptFoldernames: (folders: FolderItem[]) => Promise<void>;
    isDecrypting: boolean;
    clearCache: () => void;
}

export function useFoldernameDecryption(): UseFoldernameDecryptionReturn {
    const { deriveFoldernameKey, isUnlocked, isConfigured } = useMasterKey();
    const { unlockOrgVault, deriveOrgFoldernameKey } = useOrgMasterKey();

    const cacheRef = useRef<DecryptedFoldernameCache>({});
    const [isDecrypting, setIsDecrypting] = useState(false);

    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    const getDisplayName = useCallback((folder: FolderItem): string => {
        const cached = cacheRef.current[folder.id];
        if (cached !== undefined) {
            return cached;
        }

        if (!folder.encryptedName || !folder.nameIv) {
            return folder.name;
        }

        return '[Encrypted]';
    }, []);

    const decryptFoldernames = useCallback(async (folders: FolderItem[]): Promise<void> => {
        if (!isConfigured || !isUnlocked) {
            return;
        }

        const needsDecryption = folders.filter(
            f => f.encryptedName && f.nameIv && cacheRef.current[f.id] === undefined
        );

        if (needsDecryption.length === 0) {
            return;
        }

        setIsDecrypting(true);

        try {
            const personalFolders = needsDecryption.filter(f => !f.organizationId);
            const orgFoldersByOrgId = new Map<number, FolderItem[]>();
            for (const f of needsDecryption) {
                if (f.organizationId) {
                    const existing = orgFoldersByOrgId.get(f.organizationId) ?? [];
                    existing.push(f);
                    orgFoldersByOrgId.set(f.organizationId, existing);
                }
            }

            debugLog('[DECRYPT]', `Decrypting ${needsDecryption.length} folder names (personal: ${personalFolders.length}, orgs: ${orgFoldersByOrgId.size})...`);

            const decryptBatch = async (batch: FolderItem[], key: CryptoKey) => {
                await Promise.all(batch.map(async (folder) => {
                    try {
                        const decrypted = await decryptFilename(
                            folder.encryptedName!,
                            key,
                            folder.nameIv!
                        );
                        cacheRef.current[folder.id] = decrypted;
                    } catch (error) {
                        debugWarn('[DECRYPT]', `Failed to decrypt folder name for folder ${folder.id}`, error);
                        cacheRef.current[folder.id] = '[Encrypted]';
                    }
                }));
            };

            if (personalFolders.length > 0) {
                const foldernameKey = await deriveFoldernameKey();
                await decryptBatch(personalFolders, foldernameKey);
            }

            for (const [orgId, orgFolders] of orgFoldersByOrgId) {
                try {
                    await unlockOrgVault(orgId);
                    const orgFoldernameKey = await deriveOrgFoldernameKey(orgId);
                    await decryptBatch(orgFolders, orgFoldernameKey);
                } catch (error) {
                    debugWarn('[DECRYPT]', `Failed to derive org ${orgId} foldername key`, error);
                    for (const folder of orgFolders) {
                        if (cacheRef.current[folder.id] === undefined) {
                            cacheRef.current[folder.id] = '[Encrypted]';
                        }
                    }
                }
            }

            debugLog('[DECRYPT]', 'Folder name decryption complete');

            forceUpdate();
        } catch (error) {
            debugWarn('[DECRYPT]', 'Failed to derive foldername key', error);
        } finally {
            setIsDecrypting(false);
        }
    }, [isConfigured, isUnlocked, deriveFoldernameKey, unlockOrgVault, deriveOrgFoldernameKey]);

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
        decryptFoldernames,
        isDecrypting,
        clearCache,
    };
}
