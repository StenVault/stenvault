/**
 * Password Validation Utilities
 *
 * Centralized password validation for encryption across the application.
 * Used by fileCrypto.ts and other encryption modules.
 *
 * @module passwordValidation
 */

import { devLog } from '@/lib/debugLogger';

/**
 * Password validation result
 */
export interface PasswordValidationResult {
    isValid: boolean;
    error?: string;
    strength: 'weak' | 'medium' | 'strong';
}

/**
 * Validate password strength for encryption
 * 
 * Password strength is calculated based on:
 * - Presence of lowercase letters
 * - Presence of uppercase letters
 * - Presence of numbers
 * - Presence of special characters
 * - Length >= 12 characters
 * - Length >= 16 characters
 * 
 * @param password - Password to validate
 * @returns Validation result with strength indicator
 * 
 * @example
 * ```typescript
 * const result = validateEncryptionPassword('MySecur3Password!');
 * if (!result.isValid) {
 *     console.error(result.error);
 * }
 * devLog(`Strength: ${result.strength}`); // 'strong'
 * ```
 */
export function validateEncryptionPassword(password: string): PasswordValidationResult {
    if (!password) {
        return { isValid: false, error: 'Password is required', strength: 'weak' };
    }

    if (password.length < 8) {
        return {
            isValid: false,
            error: 'Password must be at least 8 characters',
            strength: 'weak'
        };
    }

    // Calculate strength based on character diversity and length
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const length = password.length;

    const score =
        (hasLower ? 1 : 0) +
        (hasUpper ? 1 : 0) +
        (hasNumber ? 1 : 0) +
        (hasSpecial ? 1 : 0) +
        (length >= 12 ? 1 : 0) +
        (length >= 16 ? 1 : 0);

    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (score >= 5) {
        strength = 'strong';
    } else if (score >= 3) {
        strength = 'medium';
    }

    return { isValid: true, strength };
}

/**
 * 5-tier password strength UI indicator for setup/reset pages.
 * Returns label, Tailwind color class, progress bar width, and raw score.
 *
 * `score` exposes the 0-5 composite so callers (e.g. segmented meters,
 * Fair-only confirmation dialogs) can act on the tier numerically without
 * re-deriving it from `label`.
 */
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4 | 5;

export function getPasswordStrengthUI(password: string): {
    label: string;
    color: string;
    labelColor: string;
    width: string;
    score: PasswordStrengthScore;
} {
    let score = 0;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Five positive conditions above, each contributing at most 1 — `score`
    // is mathematically bounded to [0, 5], but TS can't narrow it from `number`.
    const s = score as PasswordStrengthScore;

    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', labelColor: 'text-red-400', width: '20%', score: s };
    if (score === 2) return { label: 'Fair', color: 'bg-orange-500', labelColor: 'text-orange-400', width: '40%', score: s };
    if (score === 3) return { label: 'Good', color: 'bg-yellow-500', labelColor: 'text-yellow-400', width: '60%', score: s };
    if (score === 4) return { label: 'Strong', color: 'bg-green-500', labelColor: 'text-green-400', width: '80%', score: s };
    return { label: 'Excellent', color: 'bg-emerald-500', labelColor: 'text-emerald-400', width: '100%', score: s };
}
