/**
 * MobileTrash - Mobile-optimized Trash Page
 *
 * Displays soft-deleted files with restore and permanent delete options.
 * Uses pull-to-refresh, long-press action sheet, and confirmation dialogs.
 *
 * Logic extracted to useMobileTrash hook for maintainability.
 */

import { Trash2, AlertTriangle, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { formatBytes } from "@stenvault/shared";
import {
    PageTransition,
    PullToRefresh,
    EmptyState,
    LoadingState,
    FileCard,
} from "@/components/mobile-v2";
import {
    TrashActionSheet,
    type TrashAction,
} from "../TrashActionSheet";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@stenvault/shared/ui/alert-dialog";
import { useTheme } from "@/contexts/ThemeContext";
import { useMobileTrash, type TrashFileInfo } from "./hooks/useMobileTrash";
import type { FileType } from "@stenvault/shared";

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export function MobileTrash() {
    const { theme } = useTheme();
    const {
        selectedFile,
        actionSheetOpen,
        setActionSheetOpen,
        confirmEmpty,
        setConfirmEmpty,
        deleteTarget,
        files,
        getDisplayName,
        isLoading,
        isEmpty,
        totalSize,
        isDeleting,
        isEmptying,
        handleRefresh,
        handleFileLongPress,
        handleRestore,
        handlePermanentDelete,
        handleEmptyTrash,
        closeDeleteDialog,
        setDeleteTarget,
    } = useMobileTrash();

    const handleAction = (action: TrashAction, file: TrashFileInfo) => {
        switch (action) {
            case "restore":
                handleRestore(file.id);
                break;
            case "permanentDelete":
                setDeleteTarget(file.id);
                break;
            case "info":
                // Info is shown in the action sheet header itself
                break;
        }
    };

    return (
        <PageTransition>
            <PullToRefresh onRefresh={handleRefresh}>
                <div style={{ minHeight: "100%" }}>
                    {/* Trash Header */}
                    <TrashHeader
                        fileCount={files.length}
                        totalSize={totalSize}
                        isEmpty={isEmpty}
                        isLoading={isLoading}
                        isEmptying={isEmptying}
                        onEmptyTrash={() => setConfirmEmpty(true)}
                        theme={theme}
                    />

                    {/* Content */}
                    {isLoading ? (
                        <LoadingState skeleton skeletonCount={6} />
                    ) : isEmpty ? (
                        <EmptyState
                            icon={Trash2}
                            title="Trash is empty"
                            description="Files you delete will appear here for 30 days before being permanently removed."
                        />
                    ) : (
                        <TrashFilesSection
                            files={files}
                            getDisplayName={getDisplayName}
                            onFileLongPress={handleFileLongPress}
                            theme={theme}
                        />
                    )}
                </div>

                {/* Trash Action Sheet */}
                <TrashActionSheet
                    file={selectedFile}
                    open={actionSheetOpen}
                    onOpenChange={setActionSheetOpen}
                    onAction={handleAction}
                />

                {/* Empty Trash Confirmation */}
                <AlertDialog
                    open={confirmEmpty}
                    onOpenChange={(open) => !open && setConfirmEmpty(false)}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete {files.length} file
                                {files.length !== 1 ? "s" : ""} (
                                {formatBytes(totalSize)}). This action cannot be
                                undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isEmptying}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleEmptyTrash}
                                disabled={isEmptying}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {isEmptying ? "Deleting..." : "Empty Trash"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Permanent Delete Confirmation */}
                <AlertDialog
                    open={deleteTarget !== null}
                    onOpenChange={(open) => !open && closeDeleteDialog()}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Permanently delete?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                This file will be permanently deleted and cannot
                                be recovered.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handlePermanentDelete}
                                disabled={isDeleting}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {isDeleting ? "Deleting..." : "Delete Forever"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </PullToRefresh>
        </PageTransition>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

interface TrashHeaderProps {
    fileCount: number;
    totalSize: number;
    isEmpty: boolean;
    isLoading: boolean;
    isEmptying: boolean;
    onEmptyTrash: () => void;
    theme: any;
}

function TrashHeader({
    fileCount,
    totalSize,
    isEmpty,
    isLoading,
    isEmptying,
    onEmptyTrash,
    theme,
}: TrashHeaderProps) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                borderBottom: "1px solid var(--border)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: `${theme.brand.primary}15`,
                    }}
                >
                    <Trash2
                        size={20}
                        style={{ color: theme.brand.primary }}
                    />
                </div>
                <div>
                    <p
                        style={{
                            fontSize: 18,
                            fontWeight: 600,
                            color: "var(--foreground)",
                            margin: 0,
                        }}
                    >
                        Trash
                    </p>
                    {!isEmpty && !isLoading && (
                        <p
                            style={{
                                fontSize: 12,
                                color: "var(--muted-foreground)",
                                margin: "2px 0 0",
                            }}
                        >
                            {fileCount} file{fileCount !== 1 ? "s" : ""} &middot;{" "}
                            {formatBytes(totalSize)}
                        </p>
                    )}
                </div>
            </div>

            {!isEmpty && !isLoading && (
                <motion.button
                    onClick={onEmptyTrash}
                    disabled={isEmptying}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: 500,
                        color: theme.semantic.error,
                        backgroundColor: `${theme.semantic.error}10`,
                        border: "none",
                        borderRadius: 10,
                        cursor: "pointer",
                        opacity: isEmptying ? 0.5 : 1,
                    }}
                >
                    <Trash2 size={14} />
                    Empty
                </motion.button>
            )}
        </div>
    );
}

interface TrashFilesSectionProps {
    files: Array<{
        id: number;
        fileType: string;
        filename: string;
        size: number;
        deletedAt?: Date | string;
        daysUntilPermanentDeletion?: number;
        [key: string]: any;
    }>;
    getDisplayName: (file: any) => string;
    onFileLongPress: (file: TrashFileInfo) => void;
    theme: any;
}

function TrashFilesSection({
    files,
    getDisplayName,
    onFileLongPress,
    theme,
}: TrashFilesSectionProps) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                padding: "16px",
            }}
        >
            {files.map((file) => {
                const displayName = getDisplayName(file);
                const daysLeft = file.daysUntilPermanentDeletion ?? 30;
                const isUrgent = daysLeft <= 7;

                const fileInfo: TrashFileInfo = {
                    id: file.id,
                    name: displayName,
                    type: file.fileType as FileType,
                    size: file.size,
                    deletedAt: file.deletedAt,
                    daysLeft,
                };

                return (
                    <div key={file.id}>
                        <FileCard
                            name={displayName}
                            type={file.fileType as FileType}
                            size={file.size}
                            onLongPress={() => onFileLongPress(fileInfo)}
                            onMenuClick={() => onFileLongPress(fileInfo)}
                        />
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 3,
                                marginTop: 4,
                                fontSize: 11,
                                color: isUrgent
                                    ? theme.semantic.error
                                    : "var(--muted-foreground)",
                            }}
                        >
                            {isUrgent ? (
                                <AlertTriangle size={10} />
                            ) : (
                                <Clock size={10} />
                            )}
                            <span>{daysLeft}d left</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default MobileTrash;
