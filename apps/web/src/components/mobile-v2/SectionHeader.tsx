/**
 * SectionHeader - Simple section title with optional action
 */

import { motion } from "framer-motion";
import { ChevronRight, LucideIcon } from "lucide-react";

interface SectionHeaderProps {
    title: string;
    icon?: LucideIcon;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function SectionHeader({ title, icon: Icon, action }: SectionHeaderProps) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 16px 8px",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {Icon && (
                    <Icon size={18} style={{ color: "var(--muted-foreground)" }} />
                )}
                <h2
                    style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--foreground)",
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                    }}
                >
                    {title}
                </h2>
            </div>

            {action && (
                <motion.button
                    onClick={action.onClick}
                    whileTap={{ scale: 0.98 }}
                    aria-label={action.label}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--muted-foreground)",
                        backgroundColor: "transparent",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                    }}
                >
                    {action.label}
                    <ChevronRight size={14} aria-hidden="true" />
                </motion.button>
            )}
        </div>
    );
}

export default SectionHeader;
