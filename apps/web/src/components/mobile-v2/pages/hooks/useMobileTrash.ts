/**
 * useMobileTrash - Custom hook for MobileTrash state and logic
 *
 * Extracts all state management and handlers from MobileTrash component.
 * Follows the same pattern as useMobileDrive.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "@stenvault/shared/lib/toast";
import { hapticMedium } from "@/lib/haptics";
import { useFilenameDecryption } from "@/hooks/useFilenameDecryption";
import type { FileItem } from "@/components/files/types";
import type { FileType } from "@stenvault/shared";

export interface TrashFileInfo {
    id: number;
    name: string;
    type: FileType;
    size?: number;
    deletedAt?: Date | string;
    daysLeft?: number;
}

interface TrashFileItem extends FileItem {
    deletedAt: Date | string;
    daysUntilPermanentDeletion: number;
}

export function useMobileTrash() {
    // Action sheet state
    const [selectedFile, setSelectedFile] = useState<TrashFileInfo | null>(null);
    const [actionSheetOpen, setActionSheetOpen] = useState(false);

    // Confirmation dialogs
    const [confirmEmpty, setConfirmEmpty] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

    const utils = trpc.useUtils();

    // Query
    const {
        data: deletedFiles,
        isLoading,
        refetch,
    } = trpc.files.listDeleted.useQuery();

    // Filename decryption
    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const [decryptedFiles, setDecryptedFiles] = useState<TrashFileItem[]>([]);

    const rawFiles = useMemo(() => deletedFiles ?? [], [deletedFiles]);

    useEffect(() => {
        if (rawFiles.length > 0) {
            decryptFilenames(rawFiles as TrashFileItem[]).then((result) =>
                setDecryptedFiles(result as TrashFileItem[])
            );
        } else {
            setDecryptedFiles((prev) => (prev.length === 0 ? prev : []));
        }
    }, [rawFiles, decryptFilenames]);

    // Mutations
    const restoreMutation = trpc.files.restore.useMutation({
        onSuccess: () => {
            toast.success("File restored");
            utils.files.listDeleted.invalidate();
            utils.files.list.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const permanentDeleteMutation = trpc.files.permanentDelete.useMutation({
        onSuccess: () => {
            toast.success("File permanently deleted");
            setDeleteTarget(null);
            utils.files.listDeleted.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const emptyTrashMutation = trpc.files.emptyTrash.useMutation({
        onSuccess: (data) => {
            toast.success(`Permanently deleted ${data.deletedCount} file(s)`);
            setConfirmEmpty(false);
            utils.files.listDeleted.invalidate();
            utils.files.getStorageStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    // Handlers
    const handleRefresh = useCallback(async () => {
        await refetch();
    }, [refetch]);

    const handleFileLongPress = useCallback((file: TrashFileInfo) => {
        hapticMedium();
        setSelectedFile(file);
        setActionSheetOpen(true);
    }, []);

    const handleRestore = useCallback(
        (fileId: number) => {
            restoreMutation.mutate({ fileId });
        },
        [restoreMutation]
    );

    const handlePermanentDelete = useCallback(() => {
        if (deleteTarget !== null) {
            permanentDeleteMutation.mutate({ fileId: deleteTarget });
        }
    }, [deleteTarget, permanentDeleteMutation]);

    const handleEmptyTrash = useCallback(() => {
        emptyTrashMutation.mutate();
    }, [emptyTrashMutation]);

    const closeActionSheet = useCallback(() => {
        setActionSheetOpen(false);
        setSelectedFile(null);
    }, []);

    const closeEmptyDialog = useCallback(() => {
        setConfirmEmpty(false);
    }, []);

    const closeDeleteDialog = useCallback(() => {
        setDeleteTarget(null);
    }, []);

    // Derived state
    const files = decryptedFiles.length > 0 ? decryptedFiles : (rawFiles as TrashFileItem[]);
    const isEmpty = !isLoading && files.length === 0;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    return {
        // State
        selectedFile,
        actionSheetOpen,
        setActionSheetOpen,
        confirmEmpty,
        setConfirmEmpty,
        deleteTarget,
        setDeleteTarget,

        // Data
        files,
        getDisplayName,

        // Derived
        isLoading,
        isEmpty,
        totalSize,
        isRestoring: restoreMutation.isPending,
        isDeleting: permanentDeleteMutation.isPending,
        isEmptying: emptyTrashMutation.isPending,

        // Handlers
        handleRefresh,
        handleFileLongPress,
        handleRestore,
        handlePermanentDelete,
        handleEmptyTrash,
        closeActionSheet,
        closeEmptyDialog,
        closeDeleteDialog,
    };
}

export type UseMobileTrashReturn = ReturnType<typeof useMobileTrash>;
