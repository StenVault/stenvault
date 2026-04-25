/**
 * Typed error codes for the vault domain.
 *
 * Codes are grouped by domain. UI layer translates each code into curated
 * copy (see apps/web/src/lib/errorMessages.ts, added in PR-2). Internal
 * modules throw `VaultError` with one of these codes — never a raw
 * `new Error('...')` with human text.
 *
 * Naming convention:
 * - Domain-meaningful codes (e.g. INTEGRITY_FAILED) are safe to surface to
 *   users via the translator.
 * - INFRA_* codes describe infrastructure failures (worker crash, network,
 *   timeout). These are ALWAYS mapped to a generic user message —
 *   the raw INFRA_* detail stays in logs, never in user copy.
 */
export type ErrorCode =
    // ─── Crypto / file integrity ──────────────────────────────────────────
    /** AAD / HMAC / GCM tag verification failed on a decrypt path. */
    | 'INTEGRITY_FAILED'
    /** AES-GCM OperationError attributable to a wrong master password. */
    | 'WRONG_MASTER_PASSWORD'
    /** Hybrid signature (Ed25519 + ML-DSA-65) verification failed. */
    | 'SIGNATURE_INVALID'
    /** Required key material (hybrid secret, signer public, etc.) is missing. */
    | 'KEY_UNAVAILABLE'
    /** File was encrypted with a version this client cannot read. */
    | 'UNSUPPORTED_ENCRYPTION_VERSION'

    // ─── File-level ───────────────────────────────────────────────────────
    /** Header / chunk frame / manifest is malformed — file is unusable. */
    | 'FILE_CORRUPT'
    /** File exceeds the plan's allowed upload size or a worker threshold. */
    | 'FILE_TOO_LARGE'
    /** Expected metadata (IV, salt, encryption version) absent from response. */
    | 'MISSING_METADATA'

    // ─── Infrastructure (NEVER surfaced verbatim to users) ────────────────
    /** A Web Worker (file/media/pqc) crashed, errored, or was unavailable. */
    | 'INFRA_WORKER_FAILED'
    /** WASM module failed to load or threw during execution. */
    | 'INFRA_WASM_FAILED'
    /** Network fetch / presigned URL / tRPC call failed or was offline. */
    | 'INFRA_NETWORK'
    /** Operation exceeded its timeout budget. */
    | 'INFRA_TIMEOUT'
    /** Service Worker required for streaming/download is not active. */
    | 'INFRA_SW_UNAVAILABLE'

    // ─── Fallback ─────────────────────────────────────────────────────────
    /** Unclassified — translator maps to a generic "something went wrong". */
    | 'UNKNOWN';
