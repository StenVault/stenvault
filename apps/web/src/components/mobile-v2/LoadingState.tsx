/**
 * LoadingState - Animated loading placeholder
 * 
 * Shows pulsing skeleton or spinner while content loads.
 */

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface LoadingStateProps {
    /** Message to show below spinner */
    message?: string;
    /** Use skeleton cards instead of spinner */
    skeleton?: boolean;
    /** Number of skeleton items */
    skeletonCount?: number;
}

export function LoadingState({
    message = "Loading...",
    skeleton = false,
    skeletonCount = 6,
}: LoadingStateProps) {
    const { theme } = useTheme();

    if (skeleton) {
        return (
            <div
                role="status"
                aria-label="Loading content"
                aria-busy="true"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 12,
                    padding: 16,
                }}
            >
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        style={{
                            height: 120,
                            borderRadius: 12,
                            backgroundColor: "var(--muted)",
                        }}
                    >
                        <motion.div
                            animate={{
                                opacity: [0.3, 0.6, 0.3],
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                            style={{
                                width: "100%",
                                height: "100%",
                                borderRadius: 12,
                                backgroundColor: "var(--muted-foreground)",
                                opacity: 0.1,
                            }}
                        />
                    </motion.div>
                ))}
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="status"
            aria-live="polite"
            aria-busy="true"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 48,
                minHeight: 200,
            }}
        >
            <motion.div
                animate={{ rotate: 360 }}
                transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear",
                }}
                aria-hidden="true"
            >
                <Loader2
                    size={32}
                    style={{ color: theme.brand.primary }}
                />
            </motion.div>
            <p
                style={{
                    marginTop: 16,
                    fontSize: 14,
                    color: "var(--muted-foreground)",
                }}
            >
                {message}
            </p>
        </motion.div>
    );
}

export default LoadingState;
