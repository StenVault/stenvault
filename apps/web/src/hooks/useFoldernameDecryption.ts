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
    /** Get the display name for a folder (decrypted if possible, fallback otherwise) */
    getDisplayName: (folder: FolderItem) => string;
    /** Decrypt all folder names in a list of folders */
    decryptFoldernames: (folders: FolderItem[]) => Promise<void>;
    /** Whether decryption is currently in progress */
    isDecrypting: boolean;
    /** Clear the decryption cache */
    clearCache: () => void;
}

export function useFoldernameDecryption(): UseFoldernameDecryptionReturn {
    const { deriveFoldernameKey, isUnlocked, isConfigured } = useMasterKey();
    const { unlockOrgVault, deriveOrgFoldernameKey } = useOrgMasterKey();

    // Cache for decrypted folder names
    const cacheRef = useRef<DecryptedFoldernameCache>({});
    const [isDecrypting, setIsDecrypting] = useState(false);

    // Force re-render after cache updates
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    /**
     * Get display name for a folder
     * Returns cached decrypted name, or fallback if not decrypted yet
     */
    const getDisplayName = useCallback((folder: FolderItem): string => {
        // If we have a cached decrypted name, use it
        const cached = cacheRef.current[folder.id];
        if (cached !== undefined) {
            return cached;
        }

        // If folder has no encrypted name, use the plaintext name
        if (!folder.encryptedName || !folder.nameIv) {
            return folder.name;
        }

        // Not yet decrypted — show encrypted indicator
        return '[Encrypted]';
    }, []);

    /**
     * Decrypt all folder names in a list of folders
     * Updates the cache and triggers re-render
     */
    const decryptFoldernames = useCallback(async (folders: FolderItem[]): Promise<void> => {
        if (!isConfigured || !isUnlocked) {
            return;
        }

        // Filter folders that need decryption (have encrypted name and not cached)
        const needsDecryption = folders.filter(
            f => f.encryptedName && f.nameIv && cacheRef.current[f.id] === undefined
        );

        if (needsDecryption.length === 0) {
            return;
        }

        setIsDecrypting(true);

        try {
            // Group folders by organizationId to derive correct key per context
            const personalFolders = needsDecryption.filter(f => !f.organizationId);
            const orgFoldersByOrgId = new Map<number, FolderItem[]>();
            for (const f of needsDecryption) {
                if (f.organizationId) {
                    const existing = orgFoldersByOrgId.get(f.organizationId) ?? [];
                    existing.push(f);
                    orgFoldersByOrgId.set(f.organizationId, existing);
                }
            }

            debugLog('🔓', `Decrypting ${needsDecryption.length} folder names (personal: ${personalFolders.length}, orgs: ${orgFoldersByOrgId.size})...`);

            // Helper to decrypt a batch of folders with a given key
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
                        debugWarn('🔓', `Failed to decrypt folder name for folder ${folder.id}`, error);
                        cacheRef.current[folder.id] = '[Encrypted]';
                    }
                }));
            };

            // Decrypt personal folders
            if (personalFolders.length > 0) {
                const foldernameKey = await deriveFoldernameKey();
                await decryptBatch(personalFolders, foldernameKey);
            }

            // Decrypt org folders (per-org key derivation)
            for (const [orgId, orgFolders] of orgFoldersByOrgId) {
                try {
                    await unlockOrgVault(orgId);
                    const orgFoldernameKey = await deriveOrgFoldernameKey(orgId);
                    await decryptBatch(orgFolders, orgFoldernameKey);
                } catch (error) {
                    debugWarn('🔓', `Failed to derive org ${orgId} foldername key`, error);
                    for (const folder of orgFolders) {
                        if (cacheRef.current[folder.id] === undefined) {
                            cacheRef.current[folder.id] = '[Encrypted]';
                        }
                    }
                }
            }

            debugLog('🔓', 'Folder name decryption complete');

            // Force re-render to show decrypted names
            forceUpdate();

        } catch (error) {
            debugWarn('🔓', 'Failed to derive foldername key', error);
        } finally {
            setIsDecrypting(false);
        }
    }, [isConfigured, isUnlocked, deriveFoldernameKey, unlockOrgVault, deriveOrgFoldernameKey]);

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
        decryptFoldernames,
        isDecrypting,
        clearCache,
    };
}
