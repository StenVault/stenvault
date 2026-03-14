/**
 * MobileFavorites - Mobile-optimized Favorites Page
 *
 * Displays starred files in a grid with pull-to-refresh.
 * Uses FileCard grid pattern from MobileDrive (simplified).
 *
 * Logic extracted to useMobileFavorites hook for maintainability.
 */

import { Star } from "lucide-react";
import { formatBytes } from "@cloudvault/shared";
import {
    PageTransition,
    PullToRefresh,
    EmptyState,
    LoadingState,
    FileCard,
} from "@/components/mobile-v2";
import { useTheme } from "@/contexts/ThemeContext";
import { useMobileFavorites } from "./hooks/useMobileFavorites";
import type { FileType } from "@cloudvault/shared";

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export function MobileFavorites() {
    const { theme } = useTheme();
    const {
        files,
        getDisplayName,
        isLoading,
        isEmpty,
        totalSize,
        handleRefresh,
        handleUnfavorite,
    } = useMobileFavorites();

    return (
        <PageTransition>
            <PullToRefresh onRefresh={handleRefresh}>
                <div style={{ minHeight: "100%" }}>
                    {/* Header */}
                    <FavoritesHeader
                        fileCount={files.length}
                        totalSize={totalSize}
                        isEmpty={isEmpty}
                        isLoading={isLoading}
                        theme={theme}
                    />

                    {/* Content */}
                    {isLoading ? (
                        <LoadingState skeleton skeletonCount={6} />
                    ) : isEmpty ? (
                        <EmptyState
                            icon={Star}
                            title="No favorites yet"
                            description="Star files from Drive to see them here."
                        />
                    ) : (
                        <FavoritesGrid
                            files={files}
                            getDisplayName={getDisplayName}
                            onUnfavorite={handleUnfavorite}
                        />
                    )}
                </div>
            </PullToRefresh>
        </PageTransition>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

interface FavoritesHeaderProps {
    fileCount: number;
    totalSize: number;
    isEmpty: boolean;
    isLoading: boolean;
    theme: any;
}

function FavoritesHeader({
    fileCount,
    totalSize,
    isEmpty,
    isLoading,
    theme,
}: FavoritesHeaderProps) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                padding: "16px",
                borderBottom: "1px solid var(--border)",
                gap: 12,
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
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                }}
            >
                <Star
                    size={20}
                    style={{ color: "#f59e0b" }}
                    fill="#f59e0b"
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
                    Favorites
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
    );
}

interface FavoritesGridProps {
    files: Array<{
        id: number;
        fileType: string;
        filename: string;
        size: number;
        isFavorite?: boolean;
        [key: string]: any;
    }>;
    getDisplayName: (file: any) => string;
    onUnfavorite: (fileId: number) => void;
}

function FavoritesGrid({
    files,
    getDisplayName,
    onUnfavorite,
}: FavoritesGridProps) {
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
                return (
                    <FileCard
                        key={file.id}
                        name={displayName}
                        type={file.fileType as FileType}
                        size={file.size}
                        isFavorite={true}
                        onFavoriteToggle={() => onUnfavorite(file.id)}
                    />
                );
            })}
        </div>
    );
}

export default MobileFavorites;
