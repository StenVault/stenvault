/**
 * useLongPress - Unified hook for long press gesture detection
 *
 * Supports both touch (mobile) and mouse (desktop) interactions.
 * Includes unmount cleanup, disabled state, movement threshold,
 * configurable duration, and built-in haptic feedback.
 */

import { useRef, useCallback, useEffect } from "react";
import { hapticMedium } from "@/lib/haptics";

/** Maximum movement in pixels before long press is cancelled */
const MOVE_THRESHOLD = 10;

interface UseLongPressOptions {
    /** Callback when long press is detected */
    onLongPress: () => void;
    /** Callback for normal tap/click (fires on release if not a long press) */
    onClick?: () => void;
    /** Duration in ms to trigger long press (default: 500) */
    duration?: number;
    /** Disable the long press detection */
    disabled?: boolean;
    /** Enable haptic feedback on long press (default: true) */
    haptic?: boolean;
}

interface UseLongPressHandlers {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
}

export function useLongPress({
    onLongPress,
    onClick,
    duration = 500,
    disabled = false,
    haptic = true,
}: UseLongPressOptions): UseLongPressHandlers {
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPressRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const isMountedRef = useRef(true);

    // Cleanup timer on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    const start = useCallback(
        (x: number, y: number) => {
            if (disabled) return;

            isLongPressRef.current = false;
            startPosRef.current = { x, y };

            timerRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                    isLongPressRef.current = true;
                    if (haptic) hapticMedium();
                    onLongPress();
                }
            }, duration);
        },
        [onLongPress, duration, disabled, haptic]
    );

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const end = useCallback(() => {
        cancel();

        // If it wasn't a long press, trigger onClick
        if (!isLongPressRef.current && onClick) {
            onClick();
        }

        isLongPressRef.current = false;
    }, [cancel, onClick]);

    const move = useCallback(
        (x: number, y: number) => {
            const dx = Math.abs(x - startPosRef.current.x);
            const dy = Math.abs(y - startPosRef.current.y);

            if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                cancel();
            }
        },
        [cancel]
    );

    // Touch handlers
    const onTouchStart = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            if (touch) {
                start(touch.clientX, touch.clientY);
            }
        },
        [start]
    );

    const onTouchEnd = useCallback(() => {
        end();
    }, [end]);

    const onTouchMove = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            if (touch) {
                move(touch.clientX, touch.clientY);
            }
        },
        [move]
    );

    // Mouse handlers (desktop support)
    const onMouseDown = useCallback(
        (e: React.MouseEvent) => {
            start(e.clientX, e.clientY);
        },
        [start]
    );

    const onMouseUp = useCallback(() => {
        end();
    }, [end]);

    const onMouseLeave = useCallback(() => {
        cancel();
    }, [cancel]);

    return {
        onTouchStart,
        onTouchEnd,
        onTouchMove,
        onMouseDown,
        onMouseUp,
        onMouseLeave,
    };
}

export default useLongPress;
