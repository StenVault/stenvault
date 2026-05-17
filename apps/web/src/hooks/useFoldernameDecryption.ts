/**
 * Decrypts encrypted folder names for display and caches the results —
 * mirrors useFilenameDecryption for files.
 */

import { useReducer, useState, useCallback, useRef, useEffect } from 'react';
import { useMasterKey } from './useMasterKey';
import { decryptFilename } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import type { FolderItem } from '@/components/files/types';

interface DecryptedFoldernameCache {
    [folderId: number]: string;
}

interface UseFoldernameDecryptionReturn {
    /** Get the display name for a folder (decrypted if possible, fallback otherwise) */
    getDisplayName: (folder: FolderItem) => string;
    /** Decrypt all folder names in a list of folders. Pass `signal` to abort
     *  when the caller's effect re-runs — symmetric with decryptFilenames. */
    decryptFoldernames: (folders: FolderItem[], signal?: AbortSignal) => Promise<void>;
    /** Whether decryption is currently in progress */
    isDecrypting: boolean;
    /** Clear the decryption cache */
    clearCache: () => void;
}

export function useFoldernameDecryption(): UseFoldernameDecryptionReturn {
    const { deriveFoldernameKey, isUnlocked, isConfigured } = useMasterKey();

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
    const decryptFoldernames = useCallback(async (
        folders: FolderItem[],
        signal?: AbortSignal,
    ): Promise<void> => {
        if (signal?.aborted) return;
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
            debugLog('[decrypt]', `Decrypting ${needsDecryption.length} folder names...`);

            const foldernameKey = await deriveFoldernameKey();
            if (signal?.aborted) return;

            await Promise.all(needsDecryption.map(async (folder) => {
                try {
                    const decrypted = await decryptFilename(
                        folder.encryptedName!,
                        foldernameKey,
                        folder.nameIv!
                    );
                    if (signal?.aborted) return;
                    cacheRef.current[folder.id] = decrypted;
                } catch (error) {
                    if (signal?.aborted) return;
                    debugWarn('[decrypt]', `Failed to decrypt folder name for folder ${folder.id}`, error);
                    cacheRef.current[folder.id] = '[Encrypted]';
                }
            }));

            if (signal?.aborted) return;

            debugLog('[decrypt]', 'Folder name decryption complete');

            // Force re-render to show decrypted names
            forceUpdate();

        } catch (error) {
            debugWarn('[decrypt]', 'Failed to derive foldername key', error);
        } finally {
            setIsDecrypting(false);
        }
    }, [isConfigured, isUnlocked, deriveFoldernameKey]);

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
