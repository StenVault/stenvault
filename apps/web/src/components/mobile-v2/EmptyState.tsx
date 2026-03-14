/**
 * EmptyState - Placeholder for empty content areas
 * 
 * Shows icon, title, description, and optional action button.
 */

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    const { theme } = useTheme();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 32,
                minHeight: 300,
            }}
        >
            {/* Icon Container */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: `${theme.brand.primary}10`,
                    marginBottom: 24,
                }}
            >
                <Icon
                    size={36}
                    style={{ color: theme.brand.primary, opacity: 0.7 }}
                />
            </div>

            {/* Title */}
            <h3
                style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    margin: "0 0 8px",
                }}
            >
                {title}
            </h3>

            {/* Description */}
            <p
                style={{
                    fontSize: 14,
                    color: "var(--muted-foreground)",
                    margin: 0,
                    maxWidth: 280,
                    lineHeight: 1.5,
                }}
            >
                {description}
            </p>

            {/* Action Button */}
            {action && (
                <motion.button
                    onClick={action.onClick}
                    whileTap={{ scale: 0.98 }}
                    aria-label={action.label}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 24,
                        padding: "12px 24px",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#FFFFFF",
                        backgroundColor: theme.brand.primary,
                        border: "none",
                        borderRadius: 12,
                        cursor: "pointer",
                    }}
                >
                    {action.label}
                </motion.button>
            )}
        </motion.div>
    );
}

export default EmptyState;
