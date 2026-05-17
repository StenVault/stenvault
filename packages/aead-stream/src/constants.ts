// Fundamental AES-256-GCM parameters. Local copies to keep this
// package with zero internal dependencies. These are spec constants,
// not configuration — changing them breaks the wire format.

/** GCM IV length in bytes (96 bits). AES-GCM standard. */
export const GCM_IV_LENGTH = 12;

/**
 * Bytes taken from the base IV when deriving a per-chunk IV. The
 * remaining `GCM_IV_LENGTH - DERIVE_IV_BASE_LENGTH` bytes encode the
 * chunk index big-endian. With 4 bytes of counter we support up to
 * 2^32 - 1 chunks per session.
 */
export const DERIVE_IV_BASE_LENGTH = 8;

/** AES-GCM authentication tag size in bytes (128 bits). */
export const AUTH_TAG_SIZE = 16;
