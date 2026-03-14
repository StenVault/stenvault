/**
 * useFolderUpload Hook
 *
 * Orchestrates folder upload:
 * 1. Parse folder structure from webkitdirectory input or drag-and-drop
 * 2. Check for conflicts with existing folders
 * 3. Encrypt folder names
 * 4. Create folders via batch API
 * 5. Upload files to correct folders using existing pipeline
 */

import { useState, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useFoldernameDecryption } from '@/hooks/useFoldernameDecryption';
import { encryptFilename } from '@/lib/fileCrypto';
import { readDroppedEntries } from '@/lib/directoryReader';
import { useFolderConflictDialog, type FolderConflictAction } from '../components/FolderConflictDialog';
import type { FolderItem } from '@/components/files/types';

export type FolderUploadPhase = 'idle' | 'parsing' | 'checking-conflicts' | 'creating-folders' | 'uploading-files';

interface UseFolderUploadParams {
    folderId?: number | null;
    folderUploadMaxFiles: number;
    handleFilesToFolder: (files: File[], targetFolderId: number | null) => Promise<void>;
}

interface UseFolderUploadReturn {
    processFolderFiles: (fileList: FileList) => Promise<void>;
    processDroppedFolder: (dataTransfer: DataTransfer) => Promise<void>;
    isFolderUploading: boolean;
    folderUploadPhase: FolderUploadPhase;
    folderInputRef: React.RefObject<HTMLInputElement | null>;
    FolderConflictDialogPortal: React.FC;
}

interface ParsedFolder {
    /** Relative path used as tempId (e.g. "Photos", "Photos/Vacation") */
    relativePath: string;
    /** Display name (last segment) */
    name: string;
    /** Parent relative path, null for top-level */
    parentPath: string | null;
}

/**
 * Parse file list from webkitdirectory input into folder structure + file groups.
 */
export function parseFolderStructure(files: File[]): { folders: ParsedFolder[]; filesByFolder: Map<string, File[]> } {
    const folderPaths = new Set<string>();
    const filesByFolder = new Map<string, File[]>();

    for (const file of files) {
        // webkitRelativePath: "FolderName/subfolder/file.txt"
        // For drag-and-drop with readDroppedEntries, the path is in file.name
        const path = file.webkitRelativePath || file.name;
        // Sanitize: remove '.', '..', and empty segments to prevent path traversal
        const segments = path.split('/').filter(s => s !== '..' && s !== '.' && s !== '');

        if (segments.length < 2) {
            // File at root level (no folder), group under empty key
            const rootFiles = filesByFolder.get('') ?? [];
            rootFiles.push(file);
            filesByFolder.set('', rootFiles);
            continue;
        }

        // Extract folder path (all segments except last = filename)
        const folderSegments = segments.slice(0, -1);
        const folderPath = folderSegments.join('/');

        // Register all ancestor folders
        for (let i = 1; i <= folderSegments.length; i++) {
            folderPaths.add(folderSegments.slice(0, i).join('/'));
        }

        // Group file by its immediate folder path
        const group = filesByFolder.get(folderPath) ?? [];
        group.push(file);
        filesByFolder.set(folderPath, group);
    }

    // Build folder objects sorted by depth (ascending)
    const sortedPaths = Array.from(folderPaths).sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        return depthA - depthB;
    });

    const folders: ParsedFolder[] = sortedPaths.map((path) => {
        const segments = path.split('/');
        const name = segments[segments.length - 1]!;
        const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null;
        return { relativePath: path, name, parentPath };
    });

    return { folders, filesByFolder };
}

/**
 * Check if any DataTransfer items contain a directory.
 */
export function hasDirectoryInDataTransfer(dataTransfer: DataTransfer): boolean {
    if (!dataTransfer.items) return false;
    for (let i = 0; i < dataTransfer.items.length; i++) {
        const entry = dataTransfer.items[i]?.webkitGetAsEntry?.();
        if (entry?.isDirectory) return true;
    }
    return false;
}

/**
 * Given a folder's relativePath, check if any of its ancestors were merged.
 * Returns the merged ancestor's server folder ID, or null if no ancestor was merged.
 */
function findMergedAncestorId(folderPath: string, mergedFolderMap: Record<string, number>): number | null {
    const segments = folderPath.split('/');
    // Walk up from direct parent to root
    for (let i = segments.length - 1; i >= 1; i--) {
        const ancestorPath = segments.slice(0, i).join('/');
        if (mergedFolderMap[ancestorPath] !== undefined) {
            return mergedFolderMap[ancestorPath]!;
        }
    }
    return null;
}

export function useFolderUpload({
    folderId,
    folderUploadMaxFiles,
    handleFilesToFolder,
}: UseFolderUploadParams): UseFolderUploadReturn {
    const [phase, setPhase] = useState<FolderUploadPhase>('idle');
    const isProcessingRef = useRef(false); // ref-based guard (no stale closure)
    const folderInputRef = useRef<HTMLInputElement>(null);
    const { isUnlocked, deriveFoldernameKey } = useMasterKey();
    const { getDisplayName: getFolderDisplayName, decryptFoldernames } = useFoldernameDecryption();
    const { showConflictDialog, FolderConflictDialogPortal } = useFolderConflictDialog();

    const createBatch = trpc.folders.createBatch.useMutation();
    const trpcUtils = trpc.useUtils();

    const processFolder = useCallback(async (files: File[]) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        try {
            setPhase('parsing');

            const { folders, filesByFolder } = parseFolderStructure(files);

            const totalFiles = files.length;

            if (totalFiles === 0) {
                toast.error('No files found in the selected folder.');
                return;
            }

            // Validate file count
            if (folderUploadMaxFiles !== -1 && totalFiles > folderUploadMaxFiles) {
                toast.error(`Too many files: ${totalFiles} files found, but your plan allows ${folderUploadMaxFiles} per folder upload.`);
                return;
            }

            if (folders.length === 0) {
                // No subfolders — just files. Upload them directly.
                setPhase('uploading-files');
                const rootFiles = filesByFolder.get('') ?? files;
                await handleFilesToFolder(rootFiles, folderId ?? null);
                return;
            }

            // Validate depth
            const maxDepth = Math.max(...folders.map(f => f.relativePath.split('/').length));
            if (maxDepth > 20) {
                toast.error(`Folder structure too deep (${maxDepth} levels). Maximum allowed is 20.`);
                return;
            }

            if (!isUnlocked) {
                toast.error('Vault is locked. Please unlock your vault to upload folders.');
                return;
            }

            setPhase('checking-conflicts');

            const topLevelFolders = folders.filter(f => f.parentPath === null);
            const existingFolders = await trpcUtils.folders.list.fetch({ parentId: folderId ?? undefined });

            // Decrypt existing folder names for comparison
            if (existingFolders.length > 0) {
                await decryptFoldernames(existingFolders as FolderItem[]);
            }

            // mergedFolderMap: relativePath → existing server folder ID (for merged top-level folders)
            const mergedFolderMap: Record<string, number> = {};
            // Track renames: relativePath → new display name
            const renames: Record<string, string> = {};

            for (const topFolder of topLevelFolders) {
                const existingMatch = existingFolders.find(
                    (ef) => getFolderDisplayName(ef as FolderItem).toLowerCase() === topFolder.name.toLowerCase()
                );

                if (existingMatch) {
                    const action: FolderConflictAction = await showConflictDialog({
                        folderName: topFolder.name,
                        existingFolderId: existingMatch.id,
                    });

                    if (action === 'cancel') {
                        return;
                    }

                    if (action === 'merge') {
                        mergedFolderMap[topFolder.relativePath] = existingMatch.id;
                    } else if (action === 'rename') {
                        let suffix = 2;
                        let newName = `${topFolder.name} (${suffix})`;
                        while (existingFolders.some(ef =>
                            getFolderDisplayName(ef as FolderItem).toLowerCase() === newName.toLowerCase()
                        )) {
                            suffix++;
                            newName = `${topFolder.name} (${suffix})`;
                            if (suffix > 100) break; // safety valve
                        }
                        renames[topFolder.relativePath] = newName;
                    }
                }
            }

            const foldernameKey = await deriveFoldernameKey();

            // Filter out merged top-level folders from batch creation (their children still need creation)
            const foldersToCreate = folders.filter(f => !mergedFolderMap[f.relativePath]);

            setPhase('creating-folders');

            let serverFolderMap: Record<string, number> = { ...mergedFolderMap };

            if (foldersToCreate.length > 0) {
                // Group folders by their effective root parentId.
                // If a folder's ancestor was merged, it goes into that merged folder's batch.
                // Otherwise, it goes into the main batch under `folderId`.
                const groups = new Map<number | null, { folder: ParsedFolder; index: number }[]>();

                for (let i = 0; i < foldersToCreate.length; i++) {
                    const folder = foldersToCreate[i]!;
                    const mergedAncestorId = findMergedAncestorId(folder.relativePath, mergedFolderMap);
                    const effectiveParentId = mergedAncestorId !== null ? mergedAncestorId : (folderId ?? null);

                    const group = groups.get(effectiveParentId) ?? [];
                    group.push({ folder, index: i });
                    groups.set(effectiveParentId, group);
                }

                // Encrypt all folder names first
                const allEncrypted = await Promise.all(foldersToCreate.map(async (folder) => {
                    const displayName = renames[folder.relativePath] ?? folder.name;
                    const { encryptedFilename, iv } = await encryptFilename(displayName, foldernameKey);
                    return { encryptedFilename, iv };
                }));

                // Create each group as a separate batch call
                for (const [parentId, entries] of groups) {
                    // Build batch input for this group
                    // We need to remap parentTempId: if a folder's parent is in a DIFFERENT group
                    // (i.e., the parent was merged), set parentTempId to null (root of this batch)
                    const groupTempIds = new Set(entries.map(e => e.folder.relativePath));

                    const batchInput = entries.map(({ folder, index }) => {
                        let parentTempId: string | null = folder.parentPath;
                        // If parent is not in this group (it was merged or is in another group),
                        // make this folder a root of its batch
                        if (parentTempId !== null && !groupTempIds.has(parentTempId)) {
                            parentTempId = null;
                        }

                        return {
                            tempId: folder.relativePath,
                            parentTempId,
                            name: renames[folder.relativePath] ?? folder.name,
                            encryptedName: allEncrypted[index]!.encryptedFilename,
                            nameIv: allEncrypted[index]!.iv,
                        };
                    });

                    const result = await createBatch.mutateAsync({
                        parentId,
                        folders: batchInput,
                    });
                    Object.assign(serverFolderMap, result.folderMap);
                }
            }

            // Invalidate folder cache after creation
            trpcUtils.folders.list.invalidate();

            setPhase('uploading-files');

            const uploadPromises: Promise<void>[] = [];
            const unmappedPaths: string[] = [];

            for (const [folderPath, folderFiles] of filesByFolder) {
                if (folderPath === '') {
                    // Root-level files go to the current folder
                    uploadPromises.push(handleFilesToFolder(folderFiles, folderId ?? null));
                } else {
                    const targetFolderId = serverFolderMap[folderPath];
                    if (targetFolderId !== undefined) {
                        uploadPromises.push(handleFilesToFolder(folderFiles, targetFolderId));
                    } else {
                        // Do NOT silently upload to wrong folder — track as error
                        console.error(`[FolderUpload] No server folder ID for path: ${folderPath}. ${folderFiles.length} files skipped.`);
                        unmappedPaths.push(folderPath);
                    }
                }
            }

            await Promise.all(uploadPromises);

            if (unmappedPaths.length > 0) {
                toast.warning(`Folders created, but ${unmappedPaths.length} subfolder(s) could not be mapped. Some files were not uploaded.`);
            } else {
                toast.success(`Folder uploaded: ${folders.length} folders, ${totalFiles} files`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Folder upload failed';
            // Provide actionable messages for common errors
            if (message.includes('depth')) {
                toast.error('Folder structure is too deep (max 20 levels).');
            } else if (message.includes('OperationError') || message.includes('encrypt')) {
                toast.error('Encryption failed. Please unlock your vault and try again.');
            } else {
                toast.error(`Folder upload failed: ${message}`);
            }
            console.error('[FolderUpload] Error:', error);
        } finally {
            setPhase('idle');
            isProcessingRef.current = false;
        }
    }, [
        folderId, folderUploadMaxFiles, isUnlocked,
        deriveFoldernameKey, trpcUtils, createBatch,
        handleFilesToFolder, showConflictDialog,
        decryptFoldernames, getFolderDisplayName,
    ]);

    const processFolderFiles = useCallback(async (fileList: FileList) => {
        const files = Array.from(fileList);
        await processFolder(files);
    }, [processFolder]);

    const processDroppedFolder = useCallback(async (dataTransfer: DataTransfer) => {
        const files = await readDroppedEntries(dataTransfer);
        if (files.length === 0 && dataTransfer.items && dataTransfer.items.length > 0) {
            toast.error('Could not read folder contents. Your browser may not support folder drag-and-drop. Try clicking "upload a folder" instead.');
            return;
        }
        await processFolder(files);
    }, [processFolder]);

    return {
        processFolderFiles,
        processDroppedFolder,
        isFolderUploading: phase !== 'idle',
        folderUploadPhase: phase,
        folderInputRef,
        FolderConflictDialogPortal,
    };
}
