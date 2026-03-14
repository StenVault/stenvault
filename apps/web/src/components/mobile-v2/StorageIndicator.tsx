/**
 * StorageIndicator - Compact storage usage display
 */

import { motion } from "framer-motion";
import { Database } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { formatBytes } from "@/utils/formatters";

interface StorageIndicatorProps {
    used: number;  // bytes
    total: number; // bytes
}

export function StorageIndicator({ used, total }: StorageIndicatorProps) {
    const { theme } = useTheme();
    const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;

    // Color based on usage
    const getColor = () => {
        if (percentage >= 90) return theme.semantic.error;
        if (percentage >= 75) return theme.semantic.warning;
        return theme.brand.primary;
    };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 16,
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                margin: 16,
            }}
        >
            {/* Icon */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: `${getColor()}15`,
                }}
            >
                <Database size={20} style={{ color: getColor() }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 8,
                    }}
                >
                    <span
                        style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--foreground)",
                        }}
                    >
                        Storage
                    </span>
                    <span
                        style={{
                            fontSize: 12,
                            color: "var(--muted-foreground)",
                        }}
                    >
                        {formatBytes(used)} / {formatBytes(total)}
                    </span>
                </div>

                {/* Progress Bar */}
                <div
                    role="progressbar"
                    aria-valuenow={Math.round(percentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Storage usage: ${formatBytes(used)} of ${formatBytes(total)}`}
                    style={{
                        width: "100%",
                        height: 6,
                        backgroundColor: "var(--muted)",
                        borderRadius: 3,
                        overflow: "hidden",
                    }}
                >
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        style={{
                            height: "100%",
                            backgroundColor: getColor(),
                            borderRadius: 3,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export default StorageIndicator;
