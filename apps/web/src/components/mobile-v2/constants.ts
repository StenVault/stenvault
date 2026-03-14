/**
 * Mobile V2 Constants
 * 
 * Centralized constants for mobile-first components.
 * Import these instead of hardcoding values throughout components.
 */

// ─────────────────────────────────────────────────────────────
// LAYOUT DIMENSIONS
// ─────────────────────────────────────────────────────────────

/** Fixed AppBar height in pixels */
export const APP_BAR_HEIGHT = 56;

/** Fixed BottomNav height in pixels */
export const BOTTOM_NAV_HEIGHT = 56;

/** FAB (Floating Action Button) size in pixels */
export const FAB_SIZE = 52;

/** Mobile breakpoint in pixels */
export const MOBILE_BREAKPOINT = 768;

// ─────────────────────────────────────────────────────────────
// GESTURES
// ─────────────────────────────────────────────────────────────

/** Duration in ms to trigger long press */
export const LONG_PRESS_DURATION = 500;

/** Maximum movement in pixels before long press is cancelled */
export const LONG_PRESS_MOVE_THRESHOLD = 10;

/** Pull-to-refresh threshold in pixels */
export const PULL_TO_REFRESH_THRESHOLD = 80;

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────

/** Standard border radius for cards */
export const CARD_BORDER_RADIUS = 16;

/** Standard border radius for buttons */
export const BUTTON_BORDER_RADIUS = 12;

/** Standard border radius for avatars */
export const AVATAR_BORDER_RADIUS = 8;

/** Standard gap for grids */
export const GRID_GAP = 12;

/** Standard padding for content areas */
export const CONTENT_PADDING = 16;

// ─────────────────────────────────────────────────────────────
// SAFE AREAS (CSS values)
// ─────────────────────────────────────────────────────────────

/** Safe area inset for top (notch/status bar) */
export const SAFE_AREA_TOP = "env(safe-area-inset-top, 0px)";

/** Safe area inset for bottom (home indicator) */
export const SAFE_AREA_BOTTOM = "env(safe-area-inset-bottom, 0px)";

// ─────────────────────────────────────────────────────────────
// ANIMATION
// ─────────────────────────────────────────────────────────────

/** Default animation duration in seconds */
export const ANIMATION_DURATION = 0.2;

/** Staggered animation delay per item in seconds */
export const STAGGER_DELAY = 0.05;

// ─────────────────────────────────────────────────────────────
// GRID LAYOUTS
// ─────────────────────────────────────────────────────────────

/** Number of columns for file grid on mobile */
export const FILE_GRID_COLUMNS = 3;

/** Number of columns for quick actions grid */
export const QUICK_ACTIONS_COLUMNS = 2;
