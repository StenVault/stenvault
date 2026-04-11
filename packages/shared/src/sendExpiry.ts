/**
 * Public Send — Expiry Presets (Single Source of Truth)
 *
 * Every expiry value used by Public Send — backend plan limits, Zod schemas,
 * frontend dropdown, fallbacks — derives from this file. Adding a new preset
 * here propagates to every consumer automatically.
 *
 * Consumers:
 * - apps/api/src/_core/subscription/planDefinitions.ts (plan.publicSendMaxExpiryHours)
 * - apps/api/src/_core/publicSend/types.ts (Zod schema ceiling)
 * - apps/api/src/_core/publicSend/procedures/initiateSend.ts (runtime gate)
 * - apps/web/src/pages/send/constants.ts (dropdown options)
 * - apps/web/src/pages/SendPage.tsx (fallback defaults, labels)
 *
 * @module @stenvault/shared/sendExpiry
 */

/** Named semantic presets. Add new durations here and they propagate everywhere. */
export const SEND_EXPIRY_PRESETS = {
    ONE_HOUR:    { value: 1,    label: "1 hour"   },
    ONE_DAY:     { value: 24,   label: "24 hours" },
    SEVEN_DAYS:  { value: 168,  label: "7 days"   },
    THIRTY_DAYS: { value: 720,  label: "30 days"  },
    NINETY_DAYS: { value: 2160, label: "90 days"  },
} as const;

/** Ordered preset list — drives the frontend dropdown. Order is the UI order. */
export const SEND_EXPIRY_OPTIONS = [
    SEND_EXPIRY_PRESETS.ONE_HOUR,
    SEND_EXPIRY_PRESETS.ONE_DAY,
    SEND_EXPIRY_PRESETS.SEVEN_DAYS,
    SEND_EXPIRY_PRESETS.THIRTY_DAYS,
    SEND_EXPIRY_PRESETS.NINETY_DAYS,
] as const;

export type SendExpiryPresetKey = keyof typeof SEND_EXPIRY_PRESETS;
export type SendExpiryOption = (typeof SEND_EXPIRY_OPTIONS)[number];

/**
 * Maximum expiry for anonymous (unauthenticated) senders.
 * Authenticated users must never receive less than this — enforced by
 * `planDefinitions.test.ts` contract test.
 */
export const SEND_EXPIRY_ANON_MAX_HOURS: number = SEND_EXPIRY_PRESETS.SEVEN_DAYS.value;

/**
 * Absolute ceiling for authenticated senders — the largest preset.
 * The Zod schema caps at this value; plan-specific limits reduce further
 * at runtime via `getPlanFeatureLimit('publicSendMaxExpiryHours', ...)`.
 *
 * When a new preset above 90 days is added, this constant updates
 * automatically via the reference chain.
 */
export const SEND_EXPIRY_AUTH_MAX_HOURS: number = SEND_EXPIRY_PRESETS.NINETY_DAYS.value;
