/**
 * ActionSheet - Bottom Sheet for Quick Actions (v2)
 * 
 * Uses Vaul drawer for native-like bottom sheet behavior.
 * Contains Upload and New Folder options.
 */

import { Drawer } from "vaul";
import { motion } from "framer-motion";
import { Upload, FolderPlus, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap } from "@/lib/haptics";

interface ActionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpload?: () => void;
    onNewFolder?: () => void;
}

interface ActionItem {
    id: string;
    icon: React.ElementType;
    label: string;
    description: string;
    onClick: () => void;
    color?: string;
}

export function ActionSheet({
    open,
    onOpenChange,
    onUpload,
    onNewFolder,
}: ActionSheetProps) {
    const { theme } = useTheme();

    const actions: ActionItem[] = [
        {
            id: "upload",
            icon: Upload,
            label: "Upload Files",
            description: "Upload files from device",
            onClick: () => {
                hapticTap();
                onUpload?.();
            },
            color: theme.brand.primary,
        },
        {
            id: "folder",
            icon: FolderPlus,
            label: "New Folder",
            description: "Create a folder to organise",
            onClick: () => {
                hapticTap();
                onNewFolder?.();
            },
        },
    ];

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.4)",
                        zIndex: 100,
                    }}
                />
                <Drawer.Content
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="action-sheet-title"
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "var(--background)",
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                        zIndex: 100,
                        outline: "none",
                        paddingBottom: "env(safe-area-inset-bottom, 0px)",
                    }}
                >
                    {/* Drag Handle */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            paddingTop: 12,
                            paddingBottom: 8,
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

                    {/* Title */}
                    <Drawer.Title
                        id="action-sheet-title"
                        style={{
                            fontSize: 18,
                            fontWeight: 600,
                            textAlign: "center",
                            padding: "8px 24px 24px",
                            margin: 0,
                            color: "var(--foreground)",
                        }}
                    >
                        Add
                    </Drawer.Title>

                    {/* Actions Grid */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 12,
                            padding: "0 16px 24px",
                        }}
                    >
                        {actions.map((action, index) => {
                            const Icon = action.icon;
                            return (
                                <motion.button
                                    key={action.id}
                                    onClick={action.onClick}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    whileTap={{ scale: 0.98 }}
                                    aria-label={action.label}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 12,
                                        padding: 24,
                                        backgroundColor: "var(--muted)",
                                        borderRadius: 16,
                                        border: "1px solid var(--border)",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: 56,
                                            height: 56,
                                            borderRadius: 28,
                                            backgroundColor: action.color
                                                ? `${action.color}15`
                                                : "var(--secondary)",
                                        }}
                                    >
                                        <Icon
                                            size={24}
                                            style={{
                                                color: action.color || "var(--foreground)",
                                            }}
                                        />
                                    </div>
                                    <div style={{ textAlign: "center" }}>
                                        <p
                                            style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                                margin: 0,
                                                color: "var(--foreground)",
                                            }}
                                        >
                                            {action.label}
                                        </p>
                                        <p
                                            style={{
                                                fontSize: 12,
                                                margin: "4px 0 0",
                                                color: "var(--muted-foreground)",
                                            }}
                                        >
                                            {action.description}
                                        </p>
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

export default ActionSheet;
