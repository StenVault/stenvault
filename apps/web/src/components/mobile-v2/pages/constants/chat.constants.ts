/**
 * Mobile Chat Constants
 * 
 * Centralized constants for mobile chat components.
 * Avoids magic numbers scattered throughout the codebase.
 */

// ─────────────────────────────────────────────────────────────
// TIMING CONSTANTS
// ─────────────────────────────────────────────────────────────

/** Debounce time for typing indicator (ms) */
export const TYPING_DEBOUNCE_MS = 2000;

/** Delay before clearing selected user when going back (ms) */
export const VIEW_TRANSITION_DELAY_MS = 300;

/** Stagger delay between conversation items animation (s) */
export const ITEM_STAGGER_DELAY = 0.03;

// ─────────────────────────────────────────────────────────────
// ANIMATION CONSTANTS
// ─────────────────────────────────────────────────────────────

/** Standard transition duration for view changes (s) */
export const TRANSITION_DURATION = 0.25;

/** Ease curve for smooth iOS-like transitions */
export const TRANSITION_EASE = [0.32, 0.72, 0, 1] as const;

/** Animation variants for slide transitions */
export const SLIDE_VARIANTS = {
    list: {
        initial: { x: 0, opacity: 1 },
        exit: { x: -100, opacity: 0 },
    },
    conversation: {
        initial: { x: 100, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: 100, opacity: 0 },
    },
} as const;

// ─────────────────────────────────────────────────────────────
// UI CONSTANTS
// ─────────────────────────────────────────────────────────────

/** Maximum width for message bubbles (percentage) */
export const MESSAGE_MAX_WIDTH = "75%";

/** Border radius for message bubbles */
export const MESSAGE_BORDER_RADIUS = {
    own: "18px 18px 4px 18px",
    other: "18px 18px 18px 4px",
} as const;

/** Avatar sizes */
export const AVATAR_SIZE = {
    header: 40,
    list: 48,
} as const;

/** Online indicator size */
export const ONLINE_INDICATOR_SIZE = {
    header: 12,
    list: 14,
} as const;

// ─────────────────────────────────────────────────────────────
// LIMITS
// ─────────────────────────────────────────────────────────────

/** Maximum messages to fetch per request */
export const MESSAGES_LIMIT = 50;

/** Maximum unread count to display (shows 99+ above) */
export const MAX_UNREAD_DISPLAY = 99;

/** Maximum height for message input (px) */
export const MESSAGE_INPUT_MAX_HEIGHT = 100;
