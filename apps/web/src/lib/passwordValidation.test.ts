/**
 * Password Validation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateEncryptionPassword,
  getPasswordStrengthUI,
} from './passwordValidation';

describe('validateEncryptionPassword', () => {
  describe('invalid passwords', () => {
    it('should reject empty password', () => {
      const result = validateEncryptionPassword('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Password is required');
      expect(result.strength).toBe('weak');
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validateEncryptionPassword('Short1!');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters');
      expect(result.strength).toBe('weak');
    });
  });

  describe('valid passwords', () => {
    it('should accept 8 character password', () => {
      const result = validateEncryptionPassword('Password1!');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept longer passwords', () => {
      const result = validateEncryptionPassword('VeryLongPassword123!@#');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('password strength - weak', () => {
    it('should rate "password" as weak', () => {
      const result = validateEncryptionPassword('password');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('weak');
    });

    it('should rate "12345678" as weak', () => {
      const result = validateEncryptionPassword('12345678');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('weak');
    });

    it('should rate simple 8-char password as weak', () => {
      const result = validateEncryptionPassword('Password');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('weak');
    });
  });

  describe('password strength - medium', () => {
    it('should rate password with lower, upper, number as medium', () => {
      const result = validateEncryptionPassword('Password1');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('medium');
    });

    it('should rate password with variety but short as medium', () => {
      const result = validateEncryptionPassword('Pass123!');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('medium');
    });

    it('should rate 12-char password with some variety as medium', () => {
      // Has lower + upper + length>=12 = score 3 (medium)
      const result = validateEncryptionPassword('Passwordlong');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('medium');
    });
  });

  describe('password strength - strong', () => {
    it('should rate password with all criteria as strong', () => {
      const result = validateEncryptionPassword('Password123!');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
    });

    it('should rate long password with variety as strong', () => {
      const result = validateEncryptionPassword('MySecurePassword123!@#');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
    });

    it('should rate 16+ char password with variety as strong', () => {
      const result = validateEncryptionPassword('VeryLongPassword1!');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
    });
  });

  describe('character type detection', () => {
    it('should detect lowercase letters', () => {
      const result = validateEncryptionPassword('lowercase123');
      expect(result.isValid).toBe(true);
      // Should contribute to strength
    });

    it('should detect uppercase letters', () => {
      const result = validateEncryptionPassword('UPPERCASE123');
      expect(result.isValid).toBe(true);
    });

    it('should detect numbers', () => {
      const result = validateEncryptionPassword('Password123');
      expect(result.isValid).toBe(true);
    });

    it('should detect special characters', () => {
      const result = validateEncryptionPassword('Password!@#');
      expect(result.isValid).toBe(true);
    });

    it('should handle unicode special characters', () => {
      const result = validateEncryptionPassword('Pass©®™123');
      expect(result.isValid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in password', () => {
      const result = validateEncryptionPassword('Pass word 123!');
      expect(result.isValid).toBe(true);
      // Whitespace counts as special character
    });

    it('should handle very long passwords', () => {
      const longPassword = 'A'.repeat(100) + '1!';
      const result = validateEncryptionPassword(longPassword);
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
    });
  });
});


describe('getPasswordStrengthUI', () => {
  // Scoring rules:
  //   +1 if length >= 12
  //   +1 if length >= 16
  //   +1 if has both lowercase AND uppercase
  //   +1 if has digit
  //   +1 if has special char
  //
  // score 0-1 → Weak, 2 → Fair, 3 → Good, 4 → Strong, 5 → Excellent

  describe('return shape', () => {
    it('should return label, color, and width', () => {
      const result = getPasswordStrengthUI('test');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('width');
    });

    it('should return a Tailwind bg-* color class', () => {
      const result = getPasswordStrengthUI('test');
      expect(result.color).toMatch(/^bg-/);
    });

    it('should return width as percentage string', () => {
      const result = getPasswordStrengthUI('test');
      expect(result.width).toMatch(/^\d+%$/);
    });
  });

  describe('Weak (score 0-1)', () => {
    it('should rate empty string as Weak', () => {
      const result = getPasswordStrengthUI('');
      expect(result.label).toBe('Weak');
      expect(result.color).toBe('bg-red-500');
      expect(result.width).toBe('20%');
    });

    it('should rate short lowercase-only as Weak (score 0)', () => {
      // No criteria met: <12 chars, no mixed case, no digit, no special
      const result = getPasswordStrengthUI('abcdefgh');
      expect(result.label).toBe('Weak');
    });

    it('should rate 12+ chars lowercase-only as Weak (score 1)', () => {
      // Only length>=12 met
      const result = getPasswordStrengthUI('abcdefghijkl');
      expect(result.label).toBe('Weak');
    });

    it('should rate short mixed case as Weak (score 1)', () => {
      // Only mixed case met
      const result = getPasswordStrengthUI('AbCdEfGh');
      expect(result.label).toBe('Weak');
    });
  });

  describe('Fair (score 2)', () => {
    it('should rate 12+ chars with digit as Fair', () => {
      // length>=12 (+1) + digit (+1) = 2
      const result = getPasswordStrengthUI('abcdefghij1k');
      expect(result.label).toBe('Fair');
      expect(result.color).toBe('bg-orange-500');
      expect(result.width).toBe('40%');
    });

    it('should rate 12+ chars with mixed case as Fair', () => {
      // length>=12 (+1) + mixed case (+1) = 2
      const result = getPasswordStrengthUI('Abcdefghijkl');
      expect(result.label).toBe('Fair');
    });

    it('should rate short mixed case with digit as Fair', () => {
      // mixed case (+1) + digit (+1) = 2
      const result = getPasswordStrengthUI('Abcdefg1');
      expect(result.label).toBe('Fair');
    });
  });

  describe('Good (score 3)', () => {
    it('should rate 12+ chars with mixed case and digit as Good', () => {
      // length>=12 (+1) + mixed case (+1) + digit (+1) = 3
      const result = getPasswordStrengthUI('Abcdefghij1k');
      expect(result.label).toBe('Good');
      expect(result.color).toBe('bg-yellow-500');
      expect(result.width).toBe('60%');
    });

    it('should rate short mixed case with digit and special as Good', () => {
      // mixed case (+1) + digit (+1) + special (+1) = 3
      const result = getPasswordStrengthUI('Abcdef1!');
      expect(result.label).toBe('Good');
    });
  });

  describe('Strong (score 4)', () => {
    it('should rate 12+ chars with mixed case, digit, and special as Strong', () => {
      // length>=12 (+1) + mixed case (+1) + digit (+1) + special (+1) = 4
      const result = getPasswordStrengthUI('Abcdefghij1!');
      expect(result.label).toBe('Strong');
      expect(result.color).toBe('bg-green-500');
      expect(result.width).toBe('80%');
    });

    it('should rate 16+ chars with mixed case and digit as Strong', () => {
      // length>=12 (+1) + length>=16 (+1) + mixed case (+1) + digit (+1) = 4
      const result = getPasswordStrengthUI('Abcdefghijklmno1');
      expect(result.label).toBe('Strong');
    });
  });

  describe('Excellent (score 5)', () => {
    it('should rate 16+ chars with mixed case, digit, and special as Excellent', () => {
      // length>=12 (+1) + length>=16 (+1) + mixed case (+1) + digit (+1) + special (+1) = 5
      const result = getPasswordStrengthUI('Abcdefghijklmno1!');
      expect(result.label).toBe('Excellent');
      expect(result.color).toBe('bg-emerald-500');
      expect(result.width).toBe('100%');
    });

    it('should rate a realistic strong password as Excellent', () => {
      const result = getPasswordStrengthUI('MySecur3Pa$$word!');
      expect(result.label).toBe('Excellent');
    });
  });

  describe('width progression', () => {
    it('should increase width monotonically with strength', () => {
      const widths = [
        getPasswordStrengthUI(''),                        // Weak
        getPasswordStrengthUI('abcdefghij1k'),            // Fair
        getPasswordStrengthUI('Abcdefghij1k'),            // Good
        getPasswordStrengthUI('Abcdefghij1!'),            // Strong
        getPasswordStrengthUI('Abcdefghijklmno1!'),       // Excellent
      ].map(r => parseInt(r.width));

      for (let i = 1; i < widths.length; i++) {
        expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
      }
    });
  });
});
