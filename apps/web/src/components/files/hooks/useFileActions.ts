/**
 * useFileActions Hook
 * 
 * Manages file and folder CRUD operations with tRPC.
 */

import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { useMasterKey } from '@/hooks/useMasterKey';
import { encryptFilename } from '@/lib/fileCrypto';
import type { FileItem, FolderItem } from '../types';
import type { FileAction, FileInfo } from '@/components/mobile-v2/FileActionSheet';
import { devWarn } from '@/lib/debugLogger';

interface UseFileActionsOptions {
    onFilePreview?: (file: FileItem) => void;
    onFileDownload?: (file: FileItem) => void;
    setRenameDialog: (state: { open: boolean; item: FileItem | FolderItem | null; type: 'file' | 'folder' }) => void;
    setDeleteDialog: (state: { open: boolean; item: FileItem | FolderItem | null; type: 'file' | 'folder' }) => void;
    setShareDialog: (state: { open: boolean; file: FileItem | null }) => void;
    setNewName: (name: string) => void;
}

interface UseFileActionsReturn {
    // Mutations
    deleteFile: ReturnType<typeof trpc.files.delete.useMutation>;
    deleteFolder: ReturnType<typeof trpc.folders.delete.useMutation>;
    renameFile: ReturnType<typeof trpc.files.rename.useMutation>;
    renameFolder: ReturnType<typeof trpc.folders.rename.useMutation>;

    // Handlers
    handleDownload: (file: FileItem) => Promise<void>;
    handleRename: (item: FileItem | FolderItem | null, type: 'file' | 'folder', newName: string) => void;
    handleDelete: (item: FileItem | FolderItem | null, type: 'file' | 'folder') => void;
    handleFileAction: (action: FileAction, fileInfo: FileInfo, files: FileItem[], folders: FolderItem[]) => void;
}

export function useFileActions({
    onFilePreview,
    onFileDownload,
    setRenameDialog,
    setDeleteDialog,
    setShareDialog,
    setNewName,
}: UseFileActionsOptions): UseFileActionsReturn {
    const utils = trpc.useUtils();
    const { isUnlocked, deriveFoldernameKey } = useMasterKey();

    // Mutations
    const deleteFile = trpc.files.delete.useMutation({
        onSuccess: () => {
            toast.success('File deleted');
            utils.files.list.invalidate();
            utils.files.getStorageStats.invalidate();
            setDeleteDialog({ open: false, item: null, type: 'file' });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const deleteFolder = trpc.folders.delete.useMutation({
        onSuccess: () => {
            toast.success('Folder deleted');
            utils.folders.list.invalidate();
            setDeleteDialog({ open: false, item: null, type: 'folder' });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const renameFile = trpc.files.rename.useMutation({
        onSuccess: () => {
            toast.success('File renamed');
            utils.files.list.invalidate();
            setRenameDialog({ open: false, item: null, type: 'file' });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const renameFolder = trpc.folders.rename.useMutation({
        onSuccess: () => {
            toast.success('Folder renamed');
            utils.folders.list.invalidate();
            setRenameDialog({ open: false, item: null, type: 'folder' });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const handleDownload = useCallback(async (file: FileItem) => {
        try {
            if (onFileDownload) {
                onFileDownload(file);
            } else {
                // Fallback: open preview (legacy behavior)
                onFilePreview?.(file);
            }
        } catch (error) {
            toast.error('Failed to download file');
        }
    }, [onFileDownload, onFilePreview]);

    const handleRename = useCallback(async (
        item: FileItem | FolderItem | null,
        type: 'file' | 'folder',
        newName: string
    ) => {
        if (!item || !newName.trim()) return;
        const trimmedName = newName.trim();

        if (type === 'file') {
            renameFile.mutate({ fileId: item.id, newName: trimmedName });
        } else {
            // Encrypt folder name if vault is unlocked
            if (isUnlocked) {
                try {
                    const foldernameKey = await deriveFoldernameKey();
                    const { encryptedFilename: encryptedName, iv: nameIv } = await encryptFilename(trimmedName, foldernameKey);
                    renameFolder.mutate({ folderId: item.id, newName: "Folder", encryptedName, nameIv });
                    return;
                } catch (error) {
                    devWarn('[FileActions] Failed to encrypt folder name, falling back to plaintext', error);
                }
            }
            renameFolder.mutate({ folderId: item.id, newName: trimmedName });
        }
    }, [renameFile, renameFolder, isUnlocked, deriveFoldernameKey]);

    const handleDelete = useCallback((
        item: FileItem | FolderItem | null,
        type: 'file' | 'folder'
    ) => {
        if (!item) return;

        if (type === 'file') {
            deleteFile.mutate({ fileId: item.id });
        } else {
            deleteFolder.mutate({ folderId: item.id, recursive: true });
        }
    }, [deleteFile, deleteFolder]);

    const handleFileAction = useCallback((
        action: FileAction,
        fileInfo: FileInfo,
        files: FileItem[],
        folders: FolderItem[]
    ) => {
        // Find the original file or folder
        const file = files.find(f => f.id === fileInfo.id);
        const folder = folders.find(f => f.id === fileInfo.id);

        switch (action) {
            case 'preview':
                if (file) onFilePreview?.(file);
                break;
            case 'download':
                if (file) handleDownload(file);
                break;
            case 'share':
                if (file) setShareDialog({ open: true, file });
                break;
            case 'rename':
                if (file) {
                    setNewName(file.filename);
                    setRenameDialog({ open: true, item: file, type: 'file' });
                } else if (folder) {
                    setNewName(folder.name);
                    setRenameDialog({ open: true, item: folder, type: 'folder' });
                }
                break;
            case 'delete':
                if (file) {
                    setDeleteDialog({ open: true, item: file, type: 'file' });
                } else if (folder) {
                    setDeleteDialog({ open: true, item: folder, type: 'folder' });
                }
                break;
            case 'info':
                toast.info(`File: ${fileInfo.name}`);
                break;
            default:
                toast.info(`Action: ${action}`);
        }
    }, [onFilePreview, handleDownload, setShareDialog, setNewName, setRenameDialog, setDeleteDialog]);

    return {
        deleteFile,
        deleteFolder,
        renameFile,
        renameFolder,
        handleDownload,
        handleRename,
        handleDelete,
        handleFileAction,
    };
}
