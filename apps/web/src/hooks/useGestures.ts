/**
 * useGestures Hook
 *
 * Custom hook for handling touch gestures:
 * - Pinch to zoom
 * - Double tap to zoom
 * - Swipe navigation
 * - Long press
 */

import { useRef, useCallback, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

interface GestureHandlers {
  onPinch?: (scale: number) => void;
  onDoubleTap?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onLongPress?: () => void;
}

interface GestureOptions {
  swipeThreshold?: number;
  longPressDelay?: number;
  doubleTapDelay?: number;
}

export function useGestures(
  ref: React.RefObject<HTMLElement>,
  handlers: GestureHandlers,
  options: GestureOptions = {}
) {
  const {
    swipeThreshold = 50,
    longPressDelay = 500,
    doubleTapDelay = 300,
  } = options;

  const touchStart = useRef<Point | null>(null);
  const touchEnd = useRef<Point | null>(null);
  const initialDistance = useRef<number>(0);
  const lastTap = useRef<number>(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isPinching = useRef(false);

  const getDistance = useCallback((touch1: Touch, touch2: Touch): number => {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (touch) {
        touchStart.current = { x: touch.clientX, y: touch.clientY };
        touchEnd.current = null;
      }

      if (handlers.onLongPress) {
        longPressTimer.current = setTimeout(() => {
          handlers.onLongPress?.();
        }, longPressDelay);
      }
    } else if (e.touches.length === 2) {
      isPinching.current = true;
      initialDistance.current = getDistance(e.touches[0]!, e.touches[1]!);

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, [handlers, longPressDelay, getDistance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (e.touches.length === 2 && isPinching.current && handlers.onPinch) {
      const currentDistance = getDistance(e.touches[0]!, e.touches[1]!);
      const scale = currentDistance / initialDistance.current;
      handlers.onPinch(scale);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (touch) {
        touchEnd.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  }, [handlers, getDistance]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isPinching.current) {
      isPinching.current = false;
      return;
    }

    if (!touchStart.current || !touchEnd.current) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTap.current;

      if (timeSinceLastTap < doubleTapDelay && timeSinceLastTap > 0) {
        handlers.onDoubleTap?.();
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      return;
    }

    const deltaX = touchEnd.current.x - touchStart.current.x;
    const deltaY = touchEnd.current.y - touchStart.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX > swipeThreshold && absDeltaX > absDeltaY) {
      if (deltaX > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    }
    else if (absDeltaY > swipeThreshold && absDeltaY > absDeltaX) {
      if (deltaY > 0) {
        handlers.onSwipeDown?.();
      } else {
        handlers.onSwipeUp?.();
      }
    }

    touchStart.current = null;
    touchEnd.current = null;
  }, [handlers, swipeThreshold, doubleTapDelay]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);
}

export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  const light = useCallback(() => vibrate(10), [vibrate]);
  const medium = useCallback(() => vibrate(20), [vibrate]);
  const heavy = useCallback(() => vibrate(30), [vibrate]);
  const success = useCallback(() => vibrate([10, 50, 10]), [vibrate]);
  const error = useCallback(() => vibrate([10, 50, 10, 50, 10]), [vibrate]);

  return { vibrate, light, medium, heavy, success, error };
}

