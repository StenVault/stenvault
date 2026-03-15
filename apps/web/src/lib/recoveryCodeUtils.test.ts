/**
 * Recovery Code Utilities Tests
 *
 * Tests for recovery code generation.
 * Hashing is now done server-side with HMAC-SHA256, so no client-side hash tests.
 */

import { describe, it, expect } from 'vitest';
import {
    RECOVERY_CODE_COUNT,
    RECOVERY_CODE_LENGTH,
    RECOVERY_CODE_CHARS,
    generateRecoveryCodes,
} from './recoveryCodeUtils';

// ============ Constants ============

describe('Recovery Code Constants', () => {
    it('should generate 10 codes', () => {
        expect(RECOVERY_CODE_COUNT).toBe(10);
    });

    it('should generate 12-character codes', () => {
        expect(RECOVERY_CODE_LENGTH).toBe(12);
    });

    it('should exclude ambiguous characters (I, O, 0, 1)', () => {
        expect(RECOVERY_CODE_CHARS).not.toContain('I');
        expect(RECOVERY_CODE_CHARS).not.toContain('O');
        expect(RECOVERY_CODE_CHARS).not.toContain('0');
        expect(RECOVERY_CODE_CHARS).not.toContain('1');
    });

    it('should contain only uppercase letters and digits', () => {
        expect(RECOVERY_CODE_CHARS).toMatch(/^[A-Z2-9]+$/);
    });
});

// ============ generateRecoveryCodes ============

describe('generateRecoveryCodes', () => {
    it('should generate exactly RECOVERY_CODE_COUNT codes', () => {
        const codes = generateRecoveryCodes();
        expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    });

    it('should generate codes of RECOVERY_CODE_LENGTH characters each', () => {
        const codes = generateRecoveryCodes();
        for (const code of codes) {
            expect(code).toHaveLength(RECOVERY_CODE_LENGTH);
        }
    });

    it('should only use characters from RECOVERY_CODE_CHARS', () => {
        const codes = generateRecoveryCodes();
        const validChars = new Set(RECOVERY_CODE_CHARS.split(''));
        for (const code of codes) {
            for (const char of code) {
                expect(validChars.has(char)).toBe(true);
            }
        }
    });

    it('should generate unique codes within a single call', () => {
        const codes = generateRecoveryCodes();
        const unique = new Set(codes);
        // With 8 chars from 32-char alphabet, collision is astronomically unlikely
        expect(unique.size).toBe(codes.length);
    });

    it('should generate different sets across calls', () => {
        const codes1 = generateRecoveryCodes();
        const codes2 = generateRecoveryCodes();
        // Extremely unlikely to be identical (32^8 = ~1 trillion possibilities per code)
        expect(codes1).not.toEqual(codes2);
    });

    it('should not contain ambiguous characters in generated codes', () => {
        // Run multiple times to increase confidence
        for (let run = 0; run < 5; run++) {
            const codes = generateRecoveryCodes();
            for (const code of codes) {
                expect(code).not.toMatch(/[IO01]/);
            }
        }
    });
});
