/**
 * FileList Component
 * 
 * Main container component for displaying and managing files and folders.
 * Supports grid, list, and gallery views with filtering, sorting, and mobile support.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2, FolderDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { applyFilters, type FileFilters } from '@/components/filters/FilterPanel';
import { useIsMobile } from '@/hooks/useMobile';
import { FileActionSheet, type FileAction, type FileInfo } from '@/components/mobile-v2/FileActionSheet';
import { useFolderDownload } from '@/hooks/useFolderDownload';
import { useBulkDownload } from '@/hooks/useBulkDownload';
import { formatBytes } from '@/utils/formatters';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Internal components
import { FileHeader } from './components/FileHeader';
import { FileEmptyState } from './components/FileEmptyState';
import { FileDialogs } from './components/FileDialogs';
import { FileGrid } from './views/FileGrid';
import { FileTable } from './views/FileTable';
import { FileGallery } from './views/FileGallery';
import { BatchRenameDialog } from './components/BatchRenameDialog';
import { SelectionToolbar } from './components/SelectionToolbar';
import { FileVersionHistory } from './components/FileVersionHistory';
import { TimestampProofModal } from './components/TimestampProofModal';

// Hooks
import { useLongPress } from '@/hooks/useLongPress';
import { hapticTap } from '@/lib/haptics';
import { useFileSelection } from './hooks/useFileSelection';
import { useBatchTimestampStatus } from '@/hooks/useTimestamp';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import { useFoldernameDecryption } from '@/hooks/useFoldernameDecryption';
import { useDebounce } from '@/hooks/useDebounce';
import { useFavoriteToggle } from '@/hooks/useFavoriteToggle';

// Types
import type {
    FileListProps,
    FileItem,
    FolderItem,
    ViewMode,
    RenameDialogState,
    DeleteDialogState,
    ShareDialogState,
} from './types';

export function FileList({
    folderId = null,
    organizationId,
    onFolderClick,
    onFilePreview,
    onFileDownload,
    onUploadRequest,
    className,
}: FileListProps) {
    const isMobile = useIsMobile();
    const utils = trpc.useUtils();

    // View state
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [filters, setFilters] = useState<FileFilters>({
        fileTypes: [],
        dateRange: 'all',
        sizeUnit: 'MB',
        tags: [],
        sortBy: 'date',
        sortOrder: 'desc',
    });

    // Dialog states
    const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
        open: false,
        item: null,
        type: 'file',
    });
    const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
        open: false,
        item: null,
        type: 'file',
    });
    const [shareDialog, setShareDialog] = useState<ShareDialogState>({
        open: false,
        file: null,
    });
    const [newName, setNewName] = useState('');

    // Mobile action sheet state
    const [actionSheetOpen, setActionSheetOpen] = useState(false);
    const [selectedFileInfo, setSelectedFileInfo] = useState<FileInfo | null>(null);

    // Batch rename state
    const [batchRenameDialog, setBatchRenameDialog] = useState(false);

    // Batch delete confirmation
    const [batchDeleteDialog, setBatchDeleteDialog] = useState(false);

    // File selection for batch operations
    const selection = useFileSelection();

    // Favorites
    const { toggleFavorite } = useFavoriteToggle();

    // Folder download
    const { downloadFolder, fetchFolderTree, isDownloading: isFolderDownloading } = useFolderDownload();
    const { downloadFiles: bulkDownloadFiles } = useBulkDownload();
    const [folderDownloadDialog, setFolderDownloadDialog] = useState<{
        open: boolean;
        folder: FolderItem | null;
        treeData: { totalFiles: number; totalSize: number } | null;
        cachedTree: Awaited<ReturnType<typeof fetchFolderTree>> | null;
        isLoading: boolean;
    }>({ open: false, folder: null, treeData: null, cachedTree: null, isLoading: false });

    // Version history state
    const [versionHistoryFile, setVersionHistoryFile] = useState<FileItem | null>(null);

    // Timestamp state
    const [timestampFile, setTimestampFile] = useState<FileItem | null>(null);

    // Queries
    const filesQuery = trpc.files.list.useQuery({
        folderId,
        organizationId,
        orderBy: 'date',
        order: 'desc',
    });
    // useMemo stabilizes the reference: when data?.files is undefined (loading),
    // it returns the same cached [] instead of a new literal each render.
    // Without this, the useEffect below enters an infinite re-render loop (OOM).
    const rawFiles = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data?.files]);

    // Phase 5 Zero-Knowledge: Decrypt filenames BEFORE filtering
    // This allows searchQuery to work with decrypted names
    const { getDisplayName, decryptFilenames, isDecrypting } = useFilenameDecryption();
    const [decryptedRawFiles, setDecryptedRawFiles] = useState<FileItem[]>([]);

    useEffect(() => {
        if (rawFiles.length > 0) {
            // Cast to FileItem[] since the API returns compatible structure
            decryptFilenames(rawFiles as FileItem[]).then(setDecryptedRawFiles);
        } else {
            // Use functional updater to bail out if already empty (avoids extra re-render)
            setDecryptedRawFiles(prev => prev.length === 0 ? prev : []);
        }
    }, [rawFiles, decryptFilenames]);

    // Debounce search query to avoid filtering on every keystroke
    const debouncedSearchQuery = useDebounce(filters.searchQuery, 250);

    // Apply filters AFTER decryption (so searchQuery works with decrypted names)
    const debouncedFilters = useMemo(() =>
        ({ ...filters, searchQuery: debouncedSearchQuery }),
        [filters, debouncedSearchQuery]
    );
    const files = useMemo(() =>
        applyFilters(decryptedRawFiles, debouncedFilters),
        [decryptedRawFiles, debouncedFilters]
    );

    const { data: folders = [], isLoading: foldersLoading } = trpc.folders.list.useQuery({
        parentId: folderId,
    });

    const { data: breadcrumbs = [] } = trpc.folders.getBreadcrumbs.useQuery({
        folderId,
    });

    // Phase C Zero-Knowledge: Decrypt folder names
    const { getDisplayName: getFolderDisplayName, decryptFoldernames } = useFoldernameDecryption();

    useEffect(() => {
        if (folders.length > 0) {
            decryptFoldernames(folders as FolderItem[]);
        }
    }, [folders, decryptFoldernames]);

    // Also decrypt breadcrumb folder names
    useEffect(() => {
        if (breadcrumbs.length > 0) {
            // Breadcrumbs have the same shape — decrypt any that have encryptedName
            const breadcrumbFolders = breadcrumbs
                .filter((b): b is typeof b & { id: number } => b.id !== null)
                .map(b => ({
                    id: b.id,
                    name: b.name,
                    encryptedName: (b as any).encryptedName ?? null,
                    nameIv: (b as any).nameIv ?? null,
                    parentId: null,
                    createdAt: new Date(),
                    organizationId: (b as any).organizationId ?? null,
                }));
            if (breadcrumbFolders.length > 0) {
                decryptFoldernames(breadcrumbFolders);
            }
        }
    }, [breadcrumbs, decryptFoldernames]);

    // Batch timestamp status for all files in view
    const fileIds = files.map(f => f.id);
    const { getStatus: getTimestampStatus, isEnabled: isTimestampEnabled } = useBatchTimestampStatus(fileIds);

    const restoreFile = trpc.files.restore.useMutation({
        onSuccess: () => {
            toast.success('File restored');
            utils.files.list.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (error: any) => {
            toast.error(error.message);
        }
    });

    // Mutations
    const deleteFile = trpc.files.delete.useMutation({
        onSuccess: (_data, variables) => {
            toast.success('File moved to trash', {
                action: {
                    label: 'Undo',
                    onClick: () => restoreFile.mutate({ fileId: variables.fileId })
                },
                duration: 5000,
            });
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

    const duplicateFile = trpc.files.duplicate.useMutation({
        onSuccess: () => {
            utils.files.list.invalidate();
            utils.files.getStorageStats.invalidate();
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
        onError: (error: any) => {
            toast.error(error.message);
        },
    });

    const moveFile = trpc.files.move.useMutation({
        onSuccess: () => {
            toast.success('File moved');
            utils.files.list.invalidate();
            utils.folders.list.invalidate();
        },
        onError: (error: any) => {
            toast.error(error.message);
        },
    });

    const renameManyFiles = trpc.files.renameMany.useMutation({
        onSuccess: (result) => {
            const { renamed, failed } = result;
            if (renamed.length > 0) {
                toast.success(`${renamed.length} file${renamed.length > 1 ? 's' : ''} renamed`);
            }
            if (failed.length > 0) {
                toast.error(`${failed.length} file${failed.length > 1 ? 's' : ''} failed to rename`);
            }
            utils.files.list.invalidate();
            setBatchRenameDialog(false);
            selection.clearSelection();
        },
        onError: (error: any) => {
            toast.error(error.message);
        },
    });

    const deleteManyFiles = trpc.files.deleteMany.useMutation({
        onSuccess: (result) => {
            const { deleted, failed } = result;
            if (deleted.length > 0) {
                toast.success(`${deleted.length} file${deleted.length > 1 ? 's' : ''} moved to trash`);
            }
            if (failed.length > 0) {
                toast.error(`${failed.length} file${failed.length > 1 ? 's' : ''} failed to delete`);
            }
            utils.files.list.invalidate();
            utils.files.getStorageStats.invalidate();
            selection.clearSelection();
        },
        onError: (error: any) => {
            toast.error(error.message);
        },
    });

    // Long press for mobile — wraps unified hook with file-specific item tracking
    const longPressOccurredRef = useRef(false);
    const pendingItemRef = useRef<{ file: FileItem | null; folder: FolderItem | null }>({ file: null, folder: null });

    const genericLongPress = useLongPress({
        onLongPress: () => {
            longPressOccurredRef.current = true;
            const { file, folder } = pendingItemRef.current;
            let fileInfo: FileInfo | null = null;
            if (file) {
                fileInfo = { id: file.id, name: file.filename, type: file.fileType as any, size: file.size, isFolder: false };
            } else if (folder) {
                fileInfo = { id: folder.id, name: folder.name, type: 'folder', isFolder: true };
            }
            if (fileInfo) {
                setSelectedFileInfo(fileInfo);
                setActionSheetOpen(true);
            }
        },
        disabled: !isMobile,
    });

    const longPressHandlers = useMemo(() => ({
        onTouchStart: (e: React.TouchEvent, file: FileItem | null, folder: FolderItem | null) => {
            longPressOccurredRef.current = false;
            pendingItemRef.current = { file, folder };
            genericLongPress.onTouchStart(e);
        },
        onTouchEnd: genericLongPress.onTouchEnd,
        onTouchMove: genericLongPress.onTouchMove,
    }), [genericLongPress]);

    const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent, callback: () => void) => {
        if (longPressOccurredRef.current) {
            longPressOccurredRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        hapticTap();
        callback();
    }, []);

    // Action handlers
    const handleDownload = useCallback(async (file: FileItem) => {
        try {
            // Use dedicated download callback (opens modal in download mode)
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

    const handleRename = useCallback(() => {
        if (!renameDialog.item || !newName.trim()) return;

        if (renameDialog.type === 'file') {
            renameFile.mutate({ fileId: renameDialog.item.id, newName: newName.trim() });
        } else {
            renameFolder.mutate({ folderId: renameDialog.item.id, newName: newName.trim() });
        }
    }, [renameDialog, newName, renameFile, renameFolder]);

    const handleMove = useCallback((fileId: number, targetFolderId: number) => {
        // Don't move if target is same as current (though UI prevents usually)
        moveFile.mutate({ fileId, targetFolderId });
    }, [moveFile]);

    const handleDelete = useCallback(() => {
        if (!deleteDialog.item) return;

        if (deleteDialog.type === 'file') {
            deleteFile.mutate({ fileId: deleteDialog.item.id });
        } else {
            deleteFolder.mutate({ folderId: deleteDialog.item.id, recursive: true });
        }
    }, [deleteDialog, deleteFile, deleteFolder]);

    const handleOpenRename = useCallback((item: FileItem | FolderItem, type: 'file' | 'folder') => {
        setNewName(type === 'file' ? getDisplayName(item as FileItem) : getFolderDisplayName(item as FolderItem));
        setRenameDialog({ open: true, item, type });
    }, [getDisplayName, getFolderDisplayName]);

    const handleOpenDelete = useCallback((item: FileItem | FolderItem, type: 'file' | 'folder') => {
        setDeleteDialog({ open: true, item, type });
    }, []);

    const handleDuplicate = useCallback(async (file: FileItem) => {
        const toastId = toast.loading('Duplicating file...');
        try {
            await duplicateFile.mutateAsync({ fileId: file.id });
            toast.success('File duplicated', { id: toastId });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to duplicate file', { id: toastId });
        }
    }, [duplicateFile]);

    const handleOpenShare = useCallback((file: FileItem) => {
        setShareDialog({ open: true, file });
    }, []);

    const handleFolderDownload = useCallback(async (folder: FolderItem) => {
        setFolderDownloadDialog({ open: true, folder, treeData: null, cachedTree: null, isLoading: true });
        try {
            const tree = await fetchFolderTree(folder.id);
            setFolderDownloadDialog(prev => ({
                ...prev,
                treeData: { totalFiles: tree.totalFiles, totalSize: tree.totalSize },
                cachedTree: tree,
                isLoading: false,
            }));
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load folder info';
            toast.error(msg);
            setFolderDownloadDialog({ open: false, folder: null, treeData: null, cachedTree: null, isLoading: false });
        }
    }, [fetchFolderTree]);

    const handleConfirmFolderDownload = useCallback(() => {
        if (!folderDownloadDialog.folder) return;
        const folder = folderDownloadDialog.folder;
        const displayName = getFolderDisplayName(folder);
        const cachedTree = folderDownloadDialog.cachedTree ?? undefined;
        setFolderDownloadDialog({ open: false, folder: null, treeData: null, cachedTree: null, isLoading: false });
        downloadFolder(folder.id, displayName, cachedTree);
    }, [folderDownloadDialog.folder, folderDownloadDialog.cachedTree, getFolderDisplayName, downloadFolder]);

    // Mobile action sheet handler
    const handleFileAction = useCallback((action: FileAction, fileInfo: FileInfo) => {
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
                if (file) handleOpenShare(file);
                break;
            case 'rename':
                if (file) {
                    handleOpenRename(file, 'file');
                } else if (folder) {
                    handleOpenRename(folder, 'folder');
                }
                break;
            case 'delete':
                if (file) {
                    handleOpenDelete(file, 'file');
                } else if (folder) {
                    handleOpenDelete(folder, 'folder');
                }
                break;
            case 'info':
                toast.info(`File: ${fileInfo.name}`);
                break;
            default:
                toast.info(`Action: ${action}`);
        }
    }, [files, folders, onFilePreview, handleDownload, handleOpenShare, handleOpenRename, handleOpenDelete]);

    const isLoading = filesQuery.isLoading || foldersLoading;

    return (
        <div className={cn('space-y-4', className)}>
            {/* Header with breadcrumbs and view toggle */}
            <FileHeader
                breadcrumbs={breadcrumbs}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                filters={filters}
                onFiltersChange={setFilters}
                onFolderClick={onFolderClick}
            />

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            )}

            {/* Empty state */}
            {!isLoading && files.length === 0 && folders.length === 0 && (
                <FileEmptyState onUploadRequest={onUploadRequest} />
            )}

            {/* Grid View */}
            {!isLoading && viewMode === 'grid' && (files.length > 0 || folders.length > 0) && (
                <FileGrid
                    files={files}
                    folders={folders}
                    onFolderClick={onFolderClick}
                    onFilePreview={onFilePreview}
                    onDownload={handleDownload}
                    onShare={handleOpenShare}
                    onRename={handleOpenRename}
                    onDelete={handleOpenDelete}
                    onFolderDownload={handleFolderDownload}
                    handleClick={handleClick}
                    longPressHandlers={longPressHandlers}
                    onMove={handleMove}
                    isSelected={selection.isSelected}
                    onToggleSelection={selection.toggleFile}
                    onVersionHistory={(file) => setVersionHistoryFile(file)}
                    timestamp={isTimestampEnabled ? {
                        getStatus: getTimestampStatus,
                        onClick: (file) => setTimestampFile(file),
                    } : undefined}
                    onToggleFavorite={toggleFavorite}
                    onDuplicate={handleDuplicate}
                    getFolderDisplayName={getFolderDisplayName}
                />
            )}

            {/* List View */}
            {!isLoading && viewMode === 'list' && (
                <FileTable
                    files={files}
                    folders={folders}
                    onFolderClick={onFolderClick}
                    onFilePreview={onFilePreview}
                    onDownload={handleDownload}
                    onShare={handleOpenShare}
                    onRename={handleOpenRename}
                    onDelete={handleOpenDelete}
                    onFolderDownload={handleFolderDownload}
                    timestamp={isTimestampEnabled ? {
                        getStatus: getTimestampStatus,
                        onClick: (file) => setTimestampFile(file),
                    } : undefined}
                    onToggleFavorite={toggleFavorite}
                    onDuplicate={handleDuplicate}
                    getFolderDisplayName={getFolderDisplayName}
                    isSelected={selection.isSelected}
                    onToggleSelection={selection.toggleFile}
                />
            )}

            {/* Gallery View */}
            {!isLoading && viewMode === 'gallery' && (
                <FileGallery
                    files={files}
                    folders={folders}
                    onFolderClick={onFolderClick}
                    onFilePreview={onFilePreview}
                    onDownload={handleDownload}
                    onShare={handleOpenShare}
                    onDelete={handleOpenDelete}
                    onFolderDownload={handleFolderDownload}
                    timestamp={isTimestampEnabled ? {
                        getStatus: getTimestampStatus,
                        onClick: (file) => setTimestampFile(file),
                    } : undefined}
                    onToggleFavorite={toggleFavorite}
                    getFolderDisplayName={getFolderDisplayName}
                    isSelected={selection.isSelected}
                    onToggleSelection={selection.toggleFile}
                />
            )}

            {/* Dialogs */}
            <FileDialogs
                renameDialog={renameDialog}
                deleteDialog={deleteDialog}
                shareDialog={shareDialog}
                newName={newName}
                onNewNameChange={setNewName}
                onRenameDialogChange={setRenameDialog}
                onDeleteDialogChange={setDeleteDialog}
                onShareDialogChange={setShareDialog}
                onRename={handleRename}
                onDelete={handleDelete}
                isDeletePending={deleteFile.isPending || deleteFolder.isPending}
            />

            {/* Folder Download Confirmation Dialog */}
            <Dialog
                open={folderDownloadDialog.open}
                onOpenChange={(open) => {
                    if (!open) setFolderDownloadDialog({ open: false, folder: null, treeData: null, cachedTree: null, isLoading: false });
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderDown className="w-5 h-5" />
                            Download as ZIP
                        </DialogTitle>
                        <DialogDescription>
                            {folderDownloadDialog.isLoading
                                ? 'Loading folder info...'
                                : folderDownloadDialog.treeData
                                    ? `${folderDownloadDialog.treeData.totalFiles} file(s) — ${formatBytes(folderDownloadDialog.treeData.totalSize)}`
                                    : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {!folderDownloadDialog.isLoading && folderDownloadDialog.treeData && (
                        <p className="text-sm text-muted-foreground">
                            Files will be decrypted on your device and packaged into a ZIP archive.
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setFolderDownloadDialog({ open: false, folder: null, treeData: null, cachedTree: null, isLoading: false })}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmFolderDownload}
                            disabled={folderDownloadDialog.isLoading || !folderDownloadDialog.treeData || isFolderDownloading}
                        >
                            {folderDownloadDialog.isLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : null}
                            Download
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mobile Long Press Action Sheet */}
            {isMobile && (
                <FileActionSheet
                    file={selectedFileInfo}
                    open={actionSheetOpen}
                    onOpenChange={setActionSheetOpen}
                    onAction={handleFileAction}
                />
            )}

            {/* Batch Rename Dialog */}
            <BatchRenameDialog
                open={batchRenameDialog}
                files={files.filter(f => selection.isSelected(f.id))}
                onClose={() => setBatchRenameDialog(false)}
                onRename={(renames) => renameManyFiles.mutate({ renames })}
                isPending={renameManyFiles.isPending}
            />

            {/* Batch Delete Confirmation */}
            <Dialog open={batchDeleteDialog} onOpenChange={setBatchDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {selection.selectionCount} files</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {selection.selectionCount} file{selection.selectionCount > 1 ? 's' : ''}? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBatchDeleteDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={deleteManyFiles.isPending}
                            onClick={() => {
                                const selectedFiles = files.filter(f => selection.isSelected(f.id));
                                deleteManyFiles.mutate({ fileIds: selectedFiles.map(f => f.id) });
                                setBatchDeleteDialog(false);
                            }}
                        >
                            {deleteManyFiles.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Selection Toolbar */}
            <SelectionToolbar
                selectionCount={selection.selectionCount}
                onBatchRename={() => setBatchRenameDialog(true)}
                onBatchDelete={() => {
                    if (selection.selectionCount > 0) {
                        setBatchDeleteDialog(true);
                    }
                }}
                onBulkDownload={() => {
                    const selectedFiles = files.filter(f => selection.isSelected(f.id));
                    if (selectedFiles.length > 0) {
                        bulkDownloadFiles(selectedFiles);
                    }
                }}
                onClearSelection={selection.clearSelection}
            />

            {/* Version History Dialog */}
            {versionHistoryFile && (
                <FileVersionHistory
                    fileId={versionHistoryFile.id}
                    filename={versionHistoryFile.filename}
                    open={!!versionHistoryFile}
                    onClose={() => setVersionHistoryFile(null)}
                />
            )}

            {/* Timestamp Proof Modal */}
            {timestampFile && (
                <TimestampProofModal
                    fileId={timestampFile.id}
                    filename={timestampFile.filename}
                    open={!!timestampFile}
                    onClose={() => setTimestampFile(null)}
                />
            )}
        </div>
    );
}
