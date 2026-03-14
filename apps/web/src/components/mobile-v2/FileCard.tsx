/**
 * FileCard - Compact file display for mobile grid/list
 * 
 * Shows file icon, name, size, and quick actions.
 * Supports long press and three-dot menu for showing action sheet.
 */

import { motion } from "framer-motion";
import {
    FileText,
    Image,
    Film,
    Music,
    Folder,
    MoreHorizontal,
    Star,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap } from "@/lib/haptics";
import { useLongPress } from "@/hooks/useLongPress";
import { type FileType, FILE_TYPE_COLORS, type TimestampStatus } from "@cloudvault/shared";
import { TimestampIcon } from "@/components/files/components/TimestampBadge";
import { formatBytes } from "@/utils/formatters";

export interface FileCardProps {
    name: string;
    type: FileType;
    size?: number;
    onClick?: () => void;
    onLongPress?: () => void;
    onMenuClick?: () => void;
    // Timestamp
    timestampStatus?: TimestampStatus | null;
    onTimestampClick?: () => void;
    // Favorites
    isFavorite?: boolean;
    onFavoriteToggle?: () => void;
}

const fileIcons: Record<FileType, typeof FileText> = {
    image: Image,
    video: Film,
    audio: Music,
    document: FileText,
    folder: Folder,
    other: FileText,
};

// Use centralized colors from @cloudvault/shared
const fileColors = FILE_TYPE_COLORS;

export function FileCard({
    name,
    type,
    size,
    onClick,
    onLongPress,
    onMenuClick,
    timestampStatus,
    onTimestampClick,
    isFavorite,
    onFavoriteToggle,
}: FileCardProps) {
    const { theme } = useTheme();
    const isFolder = type === 'folder';
    const Icon = fileIcons[type] || FileText;
    const color = isFolder ? theme.brand.primary : fileColors[type] || fileColors.other;

    // Long press hook
    const longPressHandlers = useLongPress({
        onLongPress: () => {
            onLongPress?.();
        },
        onClick: () => {
            hapticTap();
            onClick?.();
        },
        duration: 500,
        disabled: !onLongPress,
    });

    const handleMenuClick = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();
        hapticTap();
        // Use onMenuClick if provided, otherwise fallback to onLongPress
        if (onMenuClick) {
            onMenuClick();
        } else if (onLongPress) {
            onLongPress();
        }
    };

    return (
        <motion.div
            {...longPressHandlers}
            whileTap={{ scale: onLongPress ? 0.96 : 0.98 }}
            role="button"
            tabIndex={0}
            aria-label={`${isFolder ? 'Folder' : 'File'}: ${name}${size && !isFolder ? `, ${formatBytes(size)}` : ''}`}
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: 16,
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                cursor: "pointer",
                width: "100%",
                textAlign: "center",
                position: "relative",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
            }}
        >
            {/* Favorite Star */}
            {onFavoriteToggle && !isFolder && (
                <motion.button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        hapticTap();
                        onFavoriteToggle();
                    }}
                    whileTap={{ scale: 0.75 }}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: "transparent",
                        border: "none",
                        cursor: "pointer",
                        zIndex: 10,
                    }}
                >
                    <Star
                        size={14}
                        style={{
                            color: isFavorite ? '#f59e0b' : 'var(--muted-foreground)',
                            fill: isFavorite ? '#f59e0b' : 'none',
                        }}
                    />
                </motion.button>
            )}

            {/* Three Dots Menu */}
            {(onMenuClick || onLongPress) && (
                <motion.button
                    onClick={handleMenuClick}
                    whileTap={{ scale: 0.9 }}
                    aria-label={`More options for ${name}`}
                    style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: "var(--muted)",
                        border: "none",
                        cursor: "pointer",
                        zIndex: 10,
                    }}
                >
                    <MoreHorizontal size={14} style={{ color: "var(--muted-foreground)" }} />
                </motion.button>
            )}

            {/* Icon */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: `${color}15`,
                    position: "relative",
                }}
            >
                <Icon size={24} style={{ color }} />
                {/* Timestamp indicator */}
                {timestampStatus && !isFolder && (
                    <TimestampIcon
                        status={timestampStatus}
                        className="absolute -bottom-1 -right-1"
                        onClick={onTimestampClick}
                    />
                )}
            </div>

            {/* Name */}
            <p
                style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    width: "100%",
                    maxWidth: 120,
                }}
            >
                {name}
            </p>

            {/* Size */}
            {size && !isFolder && (
                <p
                    style={{
                        fontSize: 11,
                        color: "var(--muted-foreground)",
                        margin: 0,
                    }}
                >
                    {size && formatBytes(size)}
                </p>
            )}
        </motion.div>
    );
}

export default FileCard;

