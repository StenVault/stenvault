/**
 * PullToRefresh - Native-like pull to refresh gesture
 * 
 * Wraps content and handles pull gesture to trigger refresh.
 */

import { useState, useRef, useCallback, ReactNode } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap, hapticError } from "@/lib/haptics";
import { PULL_TO_REFRESH_THRESHOLD } from "./constants";
import { devWarn } from '@/lib/debugLogger';

interface PullToRefreshProps {
    children: ReactNode;
    onRefresh: () => Promise<void>;
    disabled?: boolean;
    /** Optional callback when refresh fails */
    onRefreshError?: (error: unknown) => void;
}

export function PullToRefresh({
    children,
    onRefresh,
    disabled = false,
    onRefreshError,
}: PullToRefreshProps) {
    const { theme } = useTheme();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const startY = useRef(0);
    const currentY = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const y = useMotionValue(0);
    const controls = useAnimation();

    // Transform values using centralized threshold
    const indicatorOpacity = useTransform(y, [0, PULL_TO_REFRESH_THRESHOLD / 2, PULL_TO_REFRESH_THRESHOLD], [0, 0.5, 1]);
    const indicatorScale = useTransform(y, [0, PULL_TO_REFRESH_THRESHOLD], [0.5, 1]);
    const indicatorRotation = useTransform(y, [0, PULL_TO_REFRESH_THRESHOLD], [0, 180]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled || isRefreshing) return;

        const container = containerRef.current;
        const touch = e.touches[0];
        if (container && container.scrollTop <= 0 && touch) {
            startY.current = touch.clientY;
            setIsPulling(true);
        }
    }, [disabled, isRefreshing]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isPulling || disabled || isRefreshing) return;

        const touch = e.touches[0];
        if (!touch) return;

        currentY.current = touch.clientY;
        const diff = currentY.current - startY.current;

        if (diff > 0) {
            // Apply resistance
            const pullDistance = Math.min(diff * 0.5, PULL_TO_REFRESH_THRESHOLD * 1.5);
            y.set(pullDistance);
        }
    }, [isPulling, disabled, isRefreshing, y]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling) return;
        setIsPulling(false);

        const pullDistance = y.get();

        if (pullDistance >= PULL_TO_REFRESH_THRESHOLD && !isRefreshing) {
            hapticTap();
            setIsRefreshing(true);

            // Animate to loading position
            await controls.start({ y: PULL_TO_REFRESH_THRESHOLD / 2 });

            try {
                await onRefresh();
            } catch (error) {
                // Log error for debugging
                devWarn('[PullToRefresh] Refresh failed:', error);
                // Trigger error haptic feedback if available
                hapticError?.();
                // Call optional error callback
                onRefreshError?.(error);
            } finally {
                setIsRefreshing(false);
                controls.start({ y: 0 });
                y.set(0);
            }
        } else {
            // Snap back
            controls.start({ y: 0 });
            y.set(0);
        }
    }, [isPulling, y, isRefreshing, controls, onRefresh, onRefreshError]);

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                height: "100%",
                overflow: "hidden",
            }}
        >
            {/* Pull indicator */}
            <motion.div
                role="status"
                aria-live="polite"
                aria-label={isRefreshing ? "Refreshing content" : "Pull down to refresh"}
                style={{
                    position: "absolute",
                    top: -40,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    opacity: indicatorOpacity,
                    scale: indicatorScale,
                    y,
                    zIndex: 10,
                }}
            >
                <motion.div
                    style={{
                        rotate: isRefreshing ? undefined : indicatorRotation,
                    }}
                    animate={isRefreshing ? { rotate: 360 } : undefined}
                    transition={isRefreshing ? { duration: 1, repeat: Infinity, ease: "linear" } : undefined}
                >
                    <RefreshCw
                        size={20}
                        style={{ color: theme.brand.primary }}
                    />
                </motion.div>
            </motion.div>

            {/* Content */}
            <motion.div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                animate={controls}
                style={{
                    height: "100%",
                    overflowY: "auto",
                    WebkitOverflowScrolling: "touch",
                    y: isPulling ? y : undefined,
                }}
            >
                {children}
            </motion.div>
        </div>
    );
}

export default PullToRefresh;
