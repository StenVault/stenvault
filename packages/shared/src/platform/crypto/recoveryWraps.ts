/**
 * Recovery Code Dual-Wrap
 *
 * Types and Zod schemas for storing the Master Key wrapped independently
 * by each recovery code's KEK. Enables `resetWithRecoveryCode` to preserve
 * the user's Master Key (and therefore all files/keypairs) instead of
 * generating a fresh random MK.
 *
 * Architecture:
 * ```
 * At setup:
 *   For each recovery code i in 0..N-1:
 *     salt_i     ← random(32)
 *     kek_i      ← Argon2id(code_i, salt_i, ARGON2_PARAMS)
 *     wrapped_i  ← AES-KW.wrap(masterKey, kek_i)
 *     store { codeIndex: i, salt: b64(salt_i), argon2Params, wrappedMK: b64(wrapped_i) }
 *
 * At reset:
 *   User submits code_i
 *   Server looks up wraps[i], returns { salt, argon2Params, wrappedMK }
 *   Client derives kek_i ← Argon2id(code_i, salt_i, argon2Params)
 *   Client unwraps masterKey ← AES-KW.unwrap(wrappedMK, kek_i)
 *   Client re-wraps with new password-KEK + new recovery-code-KEKs
 * ```
 *
 * Security:
 * - Each wrap has its own salt (never reused across codes)
 * - Per-wrap argon2Params allows future migration without invalidating old wraps
 * - Server treats wraps as opaque blobs (never derives KEK server-side)
 * - Online brute force: rate-limited (login bucket), 60 bits entropy per code
 * - Offline brute force: 2^60 × ~500ms Argon2 ≈ 1.8e10 years
 */

import { z } from "zod";
import { RECOVERY_CODE_COUNT } from "../../utils/recoveryCode";

// ============ Zod Schemas ============

/**
 * Argon2id params for a single recovery-code wrap.
 * Bounds match `encryptionRouter` setupMasterKeySchema/changeMasterPasswordSchema.
 */
export const recoveryWrapArgon2ParamsSchema = z.object({
    type: z.literal("argon2id"),
    memoryCost: z.number().int().min(19456).max(1048576),
    timeCost: z.number().int().min(1).max(10),
    parallelism: z.number().int().min(1).max(16),
    hashLength: z.number().int().min(32).max(64),
});

/**
 * Single recovery-code wrap entry.
 *
 * - `codeIndex`: position in the recovery codes array, 0..RECOVERY_CODE_COUNT-1.
 *   Must align with the same index in `recoveryCodesHash`.
 * - `salt`: Base64-encoded 32-byte random salt (44 chars w/ padding).
 * - `argon2Params`: KDF parameters used to derive the per-code KEK.
 * - `wrappedMK`: Base64-encoded AES-KW-wrapped 32-byte Master Key
 *   (40 bytes raw → ~56 chars Base64).
 */
export const recoveryWrapSchema = z.object({
    codeIndex: z.number().int().min(0).max(RECOVERY_CODE_COUNT - 1),
    salt: z.string().min(40).max(64),
    argon2Params: recoveryWrapArgon2ParamsSchema,
    wrappedMK: z.string().min(40).max(128),
});

/**
 * Recovery wraps array schema.
 *
 * Enforces:
 * - exactly `RECOVERY_CODE_COUNT` entries
 * - `codeIndex` values form the set {0, 1, ..., RECOVERY_CODE_COUNT - 1}
 *   (no duplicates, no gaps, any order — but consumers can sort by codeIndex)
 */
export const recoveryWrapsSchema = z
    .array(recoveryWrapSchema)
    .length(RECOVERY_CODE_COUNT)
    .refine(
        (wraps) => {
            const indices = new Set(wraps.map((w) => w.codeIndex));
            if (indices.size !== RECOVERY_CODE_COUNT) return false;
            for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
                if (!indices.has(i)) return false;
            }
            return true;
        },
        {
            message: `recoveryWraps must contain exactly one entry per codeIndex in 0..${RECOVERY_CODE_COUNT - 1}`,
        }
    );

// ============ Types ============

export type RecoveryWrapArgon2Params = z.infer<typeof recoveryWrapArgon2ParamsSchema>;
export type RecoveryWrap = z.infer<typeof recoveryWrapSchema>;
export type RecoveryWraps = z.infer<typeof recoveryWrapsSchema>;

// ============ Utilities ============

/**
 * Sort wraps by codeIndex. Useful before persisting or lookup.
 * Does not mutate input.
 */
export function sortRecoveryWrapsByIndex(wraps: RecoveryWrap[]): RecoveryWrap[] {
    return [...wraps].sort((a, b) => a.codeIndex - b.codeIndex);
}

/**
 * Find the wrap entry for a given code index.
 * Returns `null` if not found (caller should treat as invariant violation).
 */
export function findRecoveryWrap(
    wraps: RecoveryWrap[],
    codeIndex: number
): RecoveryWrap | null {
    return wraps.find((w) => w.codeIndex === codeIndex) ?? null;
}
