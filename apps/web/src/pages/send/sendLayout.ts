export const SEND_RING_SIZE_MOBILE = 96;
export const SEND_RING_SIZE_DESKTOP = 112;

// Ripple Y offset within the card content area.
// = card padding-top (p-6 24px / sm:p-8 32px) + active view py-8 (32px) + ring radius.
export const SEND_RIPPLE_TOP_MOBILE = 24 + 32 + SEND_RING_SIZE_MOBILE / 2;
export const SEND_RIPPLE_TOP_DESKTOP = 32 + 32 + SEND_RING_SIZE_DESKTOP / 2;
