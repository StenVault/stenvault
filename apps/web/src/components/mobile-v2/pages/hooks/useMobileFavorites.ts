/**
 * useMobileFavorites - Custom hook for MobileFavorites state and logic
 *
 * Extracts all state management and handlers from MobileFavorites component.
 * Follows the same pattern as useMobileTrash.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { hapticMedium } from "@/lib/haptics";
import { useFilenameDecryption } from "@/hooks/useFilenameDecryption";
import { useFavoriteToggle } from "@/hooks/useFavoriteToggle";
import type { FileItem } from "@/components/files/types";
import type { FileType } from "@cloudvault/shared";

export interface FavoriteFileInfo {
    id: number;
    name: string;
    type: FileType;
    size: number;
}

export function useMobileFavorites() {
    // Action sheet state
    const [selectedFile, setSelectedFile] = useState<FavoriteFileInfo | null>(null);
    const [actionSheetOpen, setActionSheetOpen] = useState(false);

    // Queries
    const {
        data: favoriteFiles,
        isLoading,
        refetch,
    } = trpc.files.listFavorites.useQuery({ limit: 100 });

    // Filename decryption
    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const [decryptedFiles, setDecryptedFiles] = useState<FileItem[]>([]);

    const rawFiles = useMemo(() => favoriteFiles ?? [], [favoriteFiles]);

    useEffect(() => {
        if (rawFiles.length > 0) {
            decryptFilenames(rawFiles as FileItem[]).then((result) =>
                setDecryptedFiles(result as FileItem[])
            );
        } else {
            setDecryptedFiles((prev) => (prev.length === 0 ? prev : []));
        }
    }, [rawFiles, decryptFilenames]);

    // Favorites
    const { toggleFavorite } = useFavoriteToggle();

    // Handlers
    const handleRefresh = useCallback(async () => {
        await refetch();
    }, [refetch]);

    const handleFileLongPress = useCallback(
        (file: FavoriteFileInfo) => {
            hapticMedium();
            setSelectedFile(file);
            setActionSheetOpen(true);
        },
        []
    );

    const handleUnfavorite = useCallback(
        (fileId: number) => {
            toggleFavorite(fileId);
        },
        [toggleFavorite]
    );

    // Derived state
    const files = decryptedFiles.length > 0 ? decryptedFiles : (rawFiles as FileItem[]);
    const isEmpty = !isLoading && files.length === 0;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    return {
        // State
        selectedFile,
        actionSheetOpen,
        setActionSheetOpen,

        // Data
        files,
        getDisplayName,

        // Derived
        isLoading,
        isEmpty,
        totalSize,

        // Handlers
        handleRefresh,
        handleFileLongPress,
        handleUnfavorite,
    };
}

export type UseMobileFavoritesReturn = ReturnType<typeof useMobileFavorites>;
