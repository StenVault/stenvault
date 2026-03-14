/**
 * TrashActionSheet - Bottom sheet with trash-specific actions
 *
 * Shows restore, permanent delete, and info actions for trashed files.
 * Follows the same pattern as FileActionSheet.
 */

import { Drawer } from "vaul";
import { motion } from "framer-motion";
import {
    RotateCcw,
    Trash2,
    Info,
    X,
    FileText,
    Image,
    Film,
    Music,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap } from "@/lib/haptics";
import { type FileType, FILE_TYPE_COLORS } from "@cloudvault/shared";
import { formatBytes } from "@/utils/formatters";
import type { TrashFileInfo } from "./pages/hooks/useMobileTrash";

export type TrashAction = "restore" | "permanentDelete" | "info";

interface TrashActionSheetProps {
    file: TrashFileInfo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAction: (action: TrashAction, file: TrashFileInfo) => void;
}

interface ActionItem {
    id: TrashAction;
    icon: React.ElementType;
    label: string;
    description?: string;
    danger?: boolean;
}

const fileIcons: Record<string, typeof FileText> = {
    image: Image,
    video: Film,
    audio: Music,
    document: FileText,
    other: FileText,
};

const actions: ActionItem[] = [
    {
        id: "restore",
        icon: RotateCcw,
        label: "Restore",
        description: "Move back to active storage",
    },
    {
        id: "permanentDelete",
        icon: Trash2,
        label: "Delete Permanently",
        description: "Cannot be recovered",
        danger: true,
    },
    {
        id: "info",
        icon: Info,
        label: "Details",
        description: "File info and deletion date",
    },
];

function formatDeletedDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function TrashActionSheet({
    file,
    open,
    onOpenChange,
    onAction,
}: TrashActionSheetProps) {
    const { theme } = useTheme();

    if (!file) return null;

    const FileIcon = fileIcons[file.type] || FileText;
    const fileColor = FILE_TYPE_COLORS[file.type] || FILE_TYPE_COLORS.other;

    const handleAction = (action: TrashAction) => {
        hapticTap();
        onOpenChange(false);
        onAction(action, file);
    };

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        zIndex: 9998,
                    }}
                />
                <Drawer.Content
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="trash-action-sheet-title"
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "var(--background)",
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        maxHeight: "85vh",
                        zIndex: 9999,
                        outline: "none",
                    }}
                >
                    {/* Drag Handle */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            padding: "12px 0 8px",
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: "var(--muted-foreground)",
                                opacity: 0.3,
                            }}
                        />
                    </div>

                    {/* File Header */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            padding: "8px 20px 16px",
                            borderBottom: "1px solid var(--border)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 52,
                                height: 52,
                                borderRadius: 14,
                                backgroundColor: `${fileColor}15`,
                            }}
                        >
                            <FileIcon size={26} style={{ color: fileColor }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                                id="trash-action-sheet-title"
                                style={{
                                    fontSize: 16,
                                    fontWeight: 600,
                                    color: "var(--foreground)",
                                    margin: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {file.name}
                            </p>
                            <p
                                style={{
                                    fontSize: 13,
                                    color: "var(--muted-foreground)",
                                    margin: "4px 0 0",
                                }}
                            >
                                {file.size ? formatBytes(file.size) : ""}
                                {file.deletedAt && (
                                    <>
                                        {file.size ? " · " : ""}
                                        Deleted{" "}
                                        {formatDeletedDate(file.deletedAt)}
                                    </>
                                )}
                                {file.daysLeft !== undefined && (
                                    <>
                                        {" · "}
                                        <span
                                            style={{
                                                color:
                                                    file.daysLeft <= 7
                                                        ? theme.semantic.error
                                                        : undefined,
                                            }}
                                        >
                                            {file.daysLeft}d left
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                        <motion.button
                            onClick={() => onOpenChange(false)}
                            whileTap={{ scale: 0.9 }}
                            aria-label="Close"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: "var(--muted)",
                                border: "none",
                                cursor: "pointer",
                            }}
                        >
                            <X
                                size={18}
                                style={{ color: "var(--muted-foreground)" }}
                            />
                        </motion.button>
                    </div>

                    {/* Actions List */}
                    <div
                        style={{
                            padding: "12px 16px",
                            paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
                            overflowY: "auto",
                            maxHeight: "60vh",
                        }}
                    >
                        {actions.map((action, index) => {
                            const Icon = action.icon;
                            const isLast = index === actions.length - 1;

                            return (
                                <motion.button
                                    key={action.id}
                                    onClick={() => handleAction(action.id)}
                                    whileTap={{ scale: 0.98 }}
                                    aria-label={action.label}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 14,
                                        width: "100%",
                                        padding: "14px 8px",
                                        backgroundColor: "transparent",
                                        border: "none",
                                        borderBottom: isLast
                                            ? "none"
                                            : "1px solid var(--border)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: 40,
                                            height: 40,
                                            borderRadius: 12,
                                            backgroundColor: action.danger
                                                ? `${theme.semantic.error}15`
                                                : "var(--muted)",
                                        }}
                                    >
                                        <Icon
                                            size={20}
                                            style={{
                                                color: action.danger
                                                    ? theme.semantic.error
                                                    : "var(--foreground)",
                                            }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p
                                            style={{
                                                fontSize: 15,
                                                fontWeight: 500,
                                                color: action.danger
                                                    ? theme.semantic.error
                                                    : "var(--foreground)",
                                                margin: 0,
                                            }}
                                        >
                                            {action.label}
                                        </p>
                                        {action.description && (
                                            <p
                                                style={{
                                                    fontSize: 12,
                                                    color: "var(--muted-foreground)",
                                                    margin: "2px 0 0",
                                                }}
                                            >
                                                {action.description}
                                            </p>
                                        )}
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

export default TrashActionSheet;
