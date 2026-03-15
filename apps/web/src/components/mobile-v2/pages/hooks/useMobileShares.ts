/**
 * useMobileShares - Custom hook for MobileShares state and logic
 *
 * Extracts all state management and handlers from MobileShares component.
 * Follows the same pattern as useMobileTrash.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { hapticMedium } from "@/lib/haptics";
import { useFilenameDecryption } from "@/hooks/useFilenameDecryption";
import type { FileItem } from "@/components/files/types";
import type { FileType } from "@stenvault/shared";

export interface ShareFileInfo {
    id: number;
    shareCode: string;
    name: string;
    type: FileType;
    size?: number;
    recipientEmail: string | null;
    downloadCount: number;
    maxDownloads: number | null;
    expiresAt: string | Date | null;
    isRevoked: boolean;
    isExpired: boolean;
    isLimitReached: boolean;
    isActive: boolean;
    downloadLink: string;
}

export function useMobileShares() {
    // Action sheet state
    const [selectedShare, setSelectedShare] = useState<ShareFileInfo | null>(null);
    const [actionSheetOpen, setActionSheetOpen] = useState(false);

    // Confirmation dialogs
    const [revokeTarget, setRevokeTarget] = useState<number | null>(null);
    const [extendTarget, setExtendTarget] = useState<number | null>(null);

    const utils = trpc.useUtils();

    // Queries
    const {
        data: shares = [],
        isLoading,
        refetch,
    } = trpc.shares.listMyShares.useQuery({
        includeExpired: true,
        includeRevoked: true,
    });

    const { data: stats } = trpc.shares.getShareStats.useQuery();

    // Filename decryption
    const { getDisplayName, decryptFilenames } = useFilenameDecryption();

    const shareFiles = useMemo(
        () =>
            shares
                .map((s) => s.file as unknown as FileItem)
                .filter((f) => f.encryptedFilename),
        [shares]
    );

    useEffect(() => {
        if (shareFiles.length > 0) {
            decryptFilenames(shareFiles);
        }
    }, [shareFiles, decryptFilenames]);

    // Mutations
    const revokeMutation = trpc.shares.revokeShare.useMutation({
        onSuccess: () => {
            toast.success("Share revoked");
            setRevokeTarget(null);
            utils.shares.listMyShares.invalidate();
            utils.shares.getShareStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const updateMutation = trpc.shares.updateShare.useMutation({
        onSuccess: () => {
            toast.success("Share updated");
            setExtendTarget(null);
            utils.shares.listMyShares.invalidate();
            utils.shares.getShareStats.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    // Handlers
    const handleRefresh = useCallback(async () => {
        await refetch();
    }, [refetch]);

    const handleShareLongPress = useCallback((share: ShareFileInfo) => {
        hapticMedium();
        setSelectedShare(share);
        setActionSheetOpen(true);
    }, []);

    const handleCopyLink = useCallback((link: string) => {
        navigator.clipboard.writeText(link);
        toast.success("Link copied!");
    }, []);

    const handleRevoke = useCallback(() => {
        if (revokeTarget !== null) {
            revokeMutation.mutate({ shareId: revokeTarget });
        }
    }, [revokeTarget, revokeMutation]);

    const handleExtend = useCallback(
        (expiration: string) => {
            if (extendTarget !== null) {
                updateMutation.mutate({
                    shareId: extendTarget,
                    expiration: expiration as any,
                });
            }
        },
        [extendTarget, updateMutation]
    );

    const closeRevokeDialog = useCallback(() => {
        setRevokeTarget(null);
    }, []);

    const closeExtendDialog = useCallback(() => {
        setExtendTarget(null);
    }, []);

    // Build share info list with display names
    const shareInfoList: ShareFileInfo[] = useMemo(
        () =>
            shares.map((share) => {
                const isActive =
                    !share.isRevoked && !share.isExpired && !share.isLimitReached;
                return {
                    id: share.id,
                    shareCode: share.shareCode,
                    name: getDisplayName(share.file as unknown as FileItem),
                    type: (share.file.fileType as FileType) || "other",
                    size: share.file.size,
                    recipientEmail: share.recipientEmail,
                    downloadCount: share.downloadCount,
                    maxDownloads: share.maxDownloads,
                    expiresAt: share.expiresAt,
                    isRevoked: share.isRevoked,
                    isExpired: share.isExpired,
                    isLimitReached: share.isLimitReached,
                    isActive,
                    downloadLink: share.downloadLink,
                };
            }),
        [shares, getDisplayName]
    );

    // Derived state
    const isEmpty = !isLoading && shareInfoList.length === 0;

    return {
        // State
        selectedShare,
        actionSheetOpen,
        setActionSheetOpen,
        revokeTarget,
        setRevokeTarget,
        extendTarget,
        setExtendTarget,

        // Data
        shares: shareInfoList,
        stats,

        // Derived
        isLoading,
        isEmpty,
        isRevoking: revokeMutation.isPending,
        isUpdating: updateMutation.isPending,

        // Handlers
        handleRefresh,
        handleShareLongPress,
        handleCopyLink,
        handleRevoke,
        handleExtend,
        closeRevokeDialog,
        closeExtendDialog,
    };
}

export type UseMobileSharesReturn = ReturnType<typeof useMobileShares>;
