/**
 * Public Send — File Size Tiers (Single Source of Truth)
 *
 * Every byte cap used by Public Send — backend plan limits, the Zod schema,
 * frontend marketing copy, fallback defaults — derives from this file.
 * Raising a tier here propagates to every consumer automatically.
 *
 * Anonymous runtime ceiling is enforced at the API boundary (default 5120 MB
 * for anonymous senders). A contract test traps drift between that default
 * and SEND_FILE_SIZE_TIERS.ANON.
 *
 * Not in scope: PlanLimits.maxFileSize (account vault upload cap — separate
 * concern), chat file size, local P2P Send (browser memory limit), ReceivePage
 * account storage copy.
 *
 * @module @stenvault/shared/sendFileSize
 */

const GB = 1024 * 1024 * 1024;

/**
 * Named tiers for Public Send file size. Keyed by semantic role; each plan in
 * planDefinitions.ts maps exactly one plan to one tier. ANON is the pre-login
 * default; operators can tune it at runtime via PUBLIC_SEND_ANON_MAX_FILE_SIZE_MB.
 */
export const SEND_FILE_SIZE_TIERS = {
    ANON:     { value: 5 * GB,  label: "5 GB"  },
    FREE:     { value: 10 * GB, label: "10 GB" },
    PRO:      { value: 25 * GB, label: "25 GB" },
    BUSINESS: { value: 50 * GB, label: "50 GB" },
} as const;

export type SendFileSizeTierKey = keyof typeof SEND_FILE_SIZE_TIERS;
export type SendFileSizeTier = (typeof SEND_FILE_SIZE_TIERS)[SendFileSizeTierKey];

/**
 * Compile-time default cap for anonymous senders. Must match the envSchema
 * `PUBLIC_SEND_ANON_MAX_FILE_SIZE_MB` .default() — contract test traps drift.
 * Operators may tune higher via ENV (envSchema enforces a 5 GB hard ceiling).
 */
export const SEND_FILE_SIZE_ANON_DEFAULT_BYTES: number = SEND_FILE_SIZE_TIERS.ANON.value;

/**
 * Absolute ceiling for authenticated senders — equals the largest tier. The
 * Zod schema caps fileSize here; per-plan limits reduce further at runtime
 * via `getPlanFeatureLimit('publicSendMaxFileSize', ...)`.
 *
 * Adding a tier above BUSINESS requires updating the reference chain here —
 * the `business plan max equals absolute ceiling` contract test catches any
 * divergence.
 */
export const SEND_FILE_SIZE_AUTH_MAX_BYTES: number = SEND_FILE_SIZE_TIERS.BUSINESS.value;
