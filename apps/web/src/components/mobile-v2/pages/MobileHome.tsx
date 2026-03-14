/**
 * MobileHome - Mobile-optimized Home Page
 * 
 * Shows storage overview, recent files, and quick actions.
 */

import { useCallback } from "react";
import { useLocation } from "wouter";
import {
    FolderOpen,
    Clock,
    Star,
    Upload,
    MessageCircle,
    Shield,
    ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { hapticTap } from "@/lib/haptics";
import {
    PageTransition,
    EmptyState,
    LoadingState,
    SectionHeader,
    StorageIndicator,
    FileCard,
} from "@/components/mobile-v2";
import { FILE_TYPE_COLORS } from "@cloudvault/shared";

// UI Colors for quick actions (consistent with design system)
const UI_COLORS = {
    drive: FILE_TYPE_COLORS.folder,      // Indigo - matches folder color
    chat: FILE_TYPE_COLORS.image,         // Green - success/go
    shares: FILE_TYPE_COLORS.audio,       // Amber - attention/shared
} as const;

interface QuickAction {
    id: keyof typeof UI_COLORS;
    icon: React.ElementType;
    label: string;
    description: string;
    path: string;
    color: string;
}

const quickActions: QuickAction[] = [
    {
        id: "drive",
        icon: FolderOpen,
        label: "My Drive",
        description: "View all files",
        path: "/drive",
        color: UI_COLORS.drive,
    },
    {
        id: "chat",
        icon: MessageCircle,
        label: "Private Chat",
        description: "Secure messages",
        path: "/chat",
        color: UI_COLORS.chat,
    },
    {
        id: "shares",
        icon: Shield,
        label: "Shares",
        description: "Shared files",
        path: "/shares",
        color: UI_COLORS.shares,
    },
];

export function MobileHome() {
    const [, setLocation] = useLocation();
    const { theme } = useTheme();
    const { user } = useAuth();

    // Fetch storage stats
    const { data: storageStats, isLoading: statsLoading } = trpc.files.getStorageStats.useQuery();

    // Fetch recent files
    const { data: recentFiles, isLoading: filesLoading } = trpc.files.list.useQuery({
        limit: 6,
        orderBy: "date",
        order: "desc",
    });

    const handleQuickAction = useCallback((path: string) => {
        hapticTap();
        setLocation(path);
    }, [setLocation]);

    const handleFileClick = useCallback((fileId: number) => {
        hapticTap();
        // Navigate to file preview or drive
        setLocation(`/drive?file=${fileId}`);
    }, [setLocation]);

    // Get time-based greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Bom dia";
        if (hour < 18) return "Boa tarde";
        return "Boa noite";
    };

    return (
        <PageTransition>
            <div style={{ minHeight: "100%" }}>
                {/* Header Greeting */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        padding: "24px 16px 16px",
                    }}
                >
                    <p
                        style={{
                            fontSize: 14,
                            color: "var(--muted-foreground)",
                            margin: "0 0 4px",
                        }}
                    >
                        {getGreeting()},
                    </p>
                    <h1
                        style={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: "var(--foreground)",
                            margin: 0,
                        }}
                    >
                        {user?.name || "User"}
                    </h1>
                </motion.div>

                {/* Storage Indicator */}
                {statsLoading ? (
                    <div style={{ padding: 16 }}>
                        <LoadingState message="A carregar armazenamento..." />
                    </div>
                ) : storageStats && (
                    <StorageIndicator
                        used={storageStats.storageUsed}
                        total={storageStats.storageQuota}
                    />
                )}

                {/* Quick Actions Grid */}
                <SectionHeader title="Quick Access" />
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: 12,
                        padding: "0 16px 16px",
                    }}
                >
                    {quickActions.map((action, index) => {
                        const Icon = action.icon;
                        return (
                            <motion.button
                                key={action.id}
                                onClick={() => handleQuickAction(action.path)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: 16,
                                    backgroundColor: "var(--card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 16,
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
                                        backgroundColor: `${action.color}15`,
                                    }}
                                >
                                    <Icon size={20} style={{ color: action.color }} />
                                </div>
                                <div style={{ flex: 1, overflow: "hidden" }}>
                                    <p
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: "var(--foreground)",
                                            margin: 0,
                                        }}
                                    >
                                        {action.label}
                                    </p>
                                    <p
                                        style={{
                                            fontSize: 11,
                                            color: "var(--muted-foreground)",
                                            margin: "2px 0 0",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {action.description}
                                    </p>
                                </div>
                            </motion.button>
                        );
                    })}
                </div>

                {/* Recent Files */}
                <SectionHeader
                    title="Recent Files"
                    icon={Clock}
                    action={{
                        label: "View all",
                        onClick: () => handleQuickAction("/drive"),
                    }}
                />

                {filesLoading ? (
                    <LoadingState skeleton skeletonCount={4} />
                ) : recentFiles?.files && recentFiles.files.length > 0 ? (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 12,
                            padding: "0 16px 24px",
                        }}
                    >
                        {recentFiles.files.slice(0, 6).map((file) => (
                            <FileCard
                                key={file.id}
                                name={file.filename}
                                type={file.fileType}
                                size={file.size}
                                onClick={() => handleFileClick(file.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={FolderOpen}
                        title="No files yet"
                        description="Start by uploading your first files"
                        action={{
                            label: "Upload Files",
                            onClick: () => handleQuickAction("/drive?action=upload"),
                        }}
                    />
                )}

                {/* Bottom spacing for safe area */}
                <div style={{ height: 24 }} />
            </div>
        </PageTransition>
    );
}

export default MobileHome;
