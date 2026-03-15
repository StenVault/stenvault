/**
 * ShareActionSheet - Bottom sheet with share-specific actions
 *
 * Shows copy link, extend expiry, revoke, and info actions for shares.
 * Follows the same pattern as TrashActionSheet.
 */

import { Drawer } from "vaul";
import { motion } from "framer-motion";
import {
    Copy,
    RefreshCw,
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
import { type FileType, FILE_TYPE_COLORS } from "@stenvault/shared";
import { formatBytes } from "@/utils/formatters";
import type { ShareFileInfo } from "./pages/hooks/useMobileShares";

export type ShareAction = "copyLink" | "extend" | "revoke" | "info";

interface ShareActionSheetProps {
    share: ShareFileInfo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAction: (action: ShareAction, share: ShareFileInfo) => void;
}

interface ActionItem {
    id: ShareAction;
    icon: React.ElementType;
    label: string;
    description?: string;
    danger?: boolean;
    activeOnly?: boolean;
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
        id: "copyLink",
        icon: Copy,
        label: "Copy Link",
        description: "Copy sharing link to clipboard",
        activeOnly: true,
    },
    {
        id: "extend",
        icon: RefreshCw,
        label: "Extend Expiry",
        description: "Change expiration time",
        activeOnly: true,
    },
    {
        id: "revoke",
        icon: Trash2,
        label: "Revoke Share",
        description: "Link will stop working immediately",
        danger: true,
        activeOnly: true,
    },
    {
        id: "info",
        icon: Info,
        label: "Details",
        description: "Share info and download stats",
    },
];

function formatShareStatus(share: ShareFileInfo): string {
    if (share.isRevoked) return "Revoked";
    if (share.isExpired) return "Expired";
    if (share.isLimitReached) return "Limit reached";
    return "Active";
}

export function ShareActionSheet({
    share,
    open,
    onOpenChange,
    onAction,
}: ShareActionSheetProps) {
    const { theme } = useTheme();

    if (!share) return null;

    const FileIcon = fileIcons[share.type] || FileText;
    const fileColor = FILE_TYPE_COLORS[share.type] || FILE_TYPE_COLORS.other;
    const visibleActions = actions.filter(
        (a) => !a.activeOnly || share.isActive
    );

    const handleAction = (action: ShareAction) => {
        hapticTap();
        onOpenChange(false);
        onAction(action, share);
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
                    aria-labelledby="share-action-sheet-title"
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

                    {/* Share Header */}
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
                                id="share-action-sheet-title"
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
                                {share.name}
                            </p>
                            <p
                                style={{
                                    fontSize: 13,
                                    color: "var(--muted-foreground)",
                                    margin: "4px 0 0",
                                }}
                            >
                                {share.size ? formatBytes(share.size) : ""}
                                {share.recipientEmail && (
                                    <>
                                        {share.size ? " · " : ""}
                                        {share.recipientEmail}
                                    </>
                                )}
                                {" · "}
                                <span
                                    style={{
                                        color: share.isActive
                                            ? theme.semantic.success
                                            : theme.semantic.error,
                                    }}
                                >
                                    {formatShareStatus(share)}
                                </span>
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
                        {visibleActions.map((action, index) => {
                            const Icon = action.icon;
                            const isLast = index === visibleActions.length - 1;

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

export default ShareActionSheet;
