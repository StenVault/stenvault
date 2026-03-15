/**
 * Recovery Code Constants
 *
 * Single source of truth for recovery code parameters.
 * Used by both frontend (WebCrypto) and backend (Node.js crypto) hashing functions.
 */

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 12;
export const RECOVERY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
export const RECOVERY_CODE_SALT = 'stenvault_recovery_code_salt_v1';
