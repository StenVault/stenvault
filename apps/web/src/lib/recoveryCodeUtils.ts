/**
 * Recovery Code Utilities
 *
 * Functions for recovery code generation.
 * Hashing is now done server-side with HMAC-SHA256.
 *
 * @module recoveryCodeUtils
 */

import {
    RECOVERY_CODE_COUNT,
    RECOVERY_CODE_LENGTH,
    RECOVERY_CODE_CHARS,
} from '@cloudvault/shared';

// Re-export constants for existing consumers
export { RECOVERY_CODE_COUNT, RECOVERY_CODE_LENGTH, RECOVERY_CODE_CHARS };

/**
 * Generate a set of random recovery codes
 */
export function generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        let code = '';
        const randomBytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_LENGTH));
        for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
            const byte = randomBytes[j];
            if (byte !== undefined) {
                code += RECOVERY_CODE_CHARS[byte % RECOVERY_CODE_CHARS.length];
            }
        }
        codes.push(code);
    }
    return codes;
}
