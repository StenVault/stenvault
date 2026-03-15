/**
 * MobileShares - Mobile-optimized Shares Page
 *
 * Displays sharing links with stats header, copy/extend/revoke actions.
 * Uses pull-to-refresh, long-press action sheet, and confirmation dialogs.
 *
 * Logic extracted to useMobileShares hook for maintainability.
 */

import { useState } from "react";
import { Share2, Download, Clock, Link2 } from "lucide-react";
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
    ShareActionSheet,
    type ShareAction,
} from "../ShareActionSheet";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/ThemeContext";
import { useMobileShares, type ShareFileInfo } from "./hooks/useMobileShares";
import type { FileType } from "@stenvault/shared";

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export function MobileShares() {
    const { theme } = useTheme();
    const [newExpiration, setNewExpiration] = useState<string>("7d");
    const {
        selectedShare,
        actionSheetOpen,
        setActionSheetOpen,
        revokeTarget,
        setRevokeTarget,
        extendTarget,
        setExtendTarget,
        shares,
        stats,
        isLoading,
        isEmpty,
        isRevoking,
        isUpdating,
        handleRefresh,
        handleShareLongPress,
        handleCopyLink,
        handleRevoke,
        handleExtend,
        closeRevokeDialog,
        closeExtendDialog,
    } = useMobileShares();

    const handleAction = (action: ShareAction, share: ShareFileInfo) => {
        switch (action) {
            case "copyLink":
                handleCopyLink(share.downloadLink);
                break;
            case "extend":
                setExtendTarget(share.id);
                break;
            case "revoke":
                setRevokeTarget(share.id);
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
                    {/* Stats Header */}
                    {stats && (
                        <StatsHeader
                            activeShares={stats.activeShares}
                            totalDownloads={stats.totalDownloads}
                            expiredShares={stats.expiredShares}
                            sharesUsed={stats.sharesUsed}
                            maxShares={stats.maxShares}
                            theme={theme}
                        />
                    )}

                    {/* Content */}
                    {isLoading ? (
                        <LoadingState skeleton skeletonCount={6} />
                    ) : isEmpty ? (
                        <EmptyState
                            icon={Share2}
                            title="No shares yet"
                            description="Use the context menu on a file to create a sharing link."
                        />
                    ) : (
                        <SharesListSection
                            shares={shares}
                            onShareLongPress={handleShareLongPress}
                            theme={theme}
                        />
                    )}
                </div>

                {/* Share Action Sheet */}
                <ShareActionSheet
                    share={selectedShare}
                    open={actionSheetOpen}
                    onOpenChange={setActionSheetOpen}
                    onAction={handleAction}
                />

                {/* Revoke Confirmation */}
                <AlertDialog
                    open={revokeTarget !== null}
                    onOpenChange={(open) => !open && closeRevokeDialog()}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Revoke Share?</AlertDialogTitle>
                            <AlertDialogDescription>
                                The sharing link will stop working immediately.
                                This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isRevoking}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleRevoke}
                                disabled={isRevoking}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {isRevoking ? "Revoking..." : "Revoke"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Extend Expiry Dialog */}
                <AlertDialog
                    open={extendTarget !== null}
                    onOpenChange={(open) => !open && closeExtendDialog()}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Extend Expiry</AlertDialogTitle>
                            <AlertDialogDescription>
                                Choose a new expiration time for this share.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Select
                            value={newExpiration}
                            onValueChange={setNewExpiration}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="New expiration" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1h">1 hour</SelectItem>
                                <SelectItem value="24h">24 hours</SelectItem>
                                <SelectItem value="7d">7 days</SelectItem>
                                <SelectItem value="30d">30 days</SelectItem>
                                <SelectItem value="never">
                                    No expiration
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isUpdating}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => handleExtend(newExpiration)}
                                disabled={isUpdating}
                            >
                                {isUpdating ? "Updating..." : "Update"}
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

interface StatsHeaderProps {
    activeShares: number;
    totalDownloads: number;
    expiredShares: number;
    sharesUsed: number;
    maxShares: number;
    theme: any;
}

function StatsHeader({
    activeShares,
    totalDownloads,
    expiredShares,
    sharesUsed,
    maxShares,
    theme,
}: StatsHeaderProps) {
    const statItems = [
        {
            icon: Share2,
            value: activeShares,
            label: "Active",
            color: theme.brand.primary,
        },
        {
            icon: Download,
            value: totalDownloads,
            label: "Downloads",
            color: theme.semantic.success,
        },
        {
            icon: Clock,
            value: expiredShares,
            label: "Expired",
            color: theme.semantic.warning,
        },
        {
            icon: Link2,
            value: `${sharesUsed}/${maxShares}`,
            label: "Quota",
            color: "var(--muted-foreground)",
        },
    ];

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
                padding: "16px",
                borderBottom: "1px solid var(--border)",
            }}
        >
            {statItems.map((item) => {
                const Icon = item.icon;
                return (
                    <div
                        key={item.label}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            backgroundColor: "var(--muted)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                backgroundColor: `${item.color}15`,
                            }}
                        >
                            <Icon size={16} style={{ color: item.color }} />
                        </div>
                        <div>
                            <p
                                style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: "var(--foreground)",
                                    margin: 0,
                                }}
                            >
                                {item.value}
                            </p>
                            <p
                                style={{
                                    fontSize: 11,
                                    color: "var(--muted-foreground)",
                                    margin: 0,
                                }}
                            >
                                {item.label}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface SharesListSectionProps {
    shares: ShareFileInfo[];
    onShareLongPress: (share: ShareFileInfo) => void;
    theme: any;
}

function SharesListSection({
    shares,
    onShareLongPress,
    theme,
}: SharesListSectionProps) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                padding: "16px",
            }}
        >
            {shares.map((share) => {
                return (
                    <div key={share.id} style={{ position: "relative" }}>
                        <FileCard
                            name={share.name}
                            type={share.type as FileType}
                            size={share.size}
                            onLongPress={() => onShareLongPress(share)}
                            onMenuClick={() => onShareLongPress(share)}
                        />
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 3,
                                marginTop: 4,
                                fontSize: 11,
                                color: share.isActive
                                    ? theme.semantic.success
                                    : "var(--muted-foreground)",
                            }}
                        >
                            <span>
                                {share.downloadCount} dl
                                {share.isActive
                                    ? ""
                                    : share.isRevoked
                                      ? " · Revoked"
                                      : share.isExpired
                                        ? " · Expired"
                                        : " · Limit"}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default MobileShares;
