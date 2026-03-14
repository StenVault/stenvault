/**
 * Tests for WebArgon2Provider
 *
 * Note: hash-wasm requires a browser environment with WebAssembly support.
 * These tests skip the actual WASM-dependent tests in Node.js and focus on
 * the pure TypeScript validation logic that doesn't require WASM.
 *
 * For full integration tests, run in a browser environment (e.g., Playwright).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ARGON2_PARAMS,
  ARGON2_PARAMS_CONSTRAINED,
  validateArgon2Params,
  mergeArgon2Params,
} from '@cloudvault/shared/platform/crypto';

// Skip importing the provider in Node.js since argon2-browser WASM crashes
// These tests focus on the pure TypeScript validation functions
const isNode = typeof process !== 'undefined' && process.versions?.node;

describe('Argon2 Validation (Pure TypeScript)', () => {
  describe('ARGON2_PARAMS constants', () => {
    it('should have correct OWASP 2024 parameters', () => {
      expect(ARGON2_PARAMS.type).toBe('argon2id');
      expect(ARGON2_PARAMS.memoryCost).toBe(47104); // 46 MiB
      expect(ARGON2_PARAMS.timeCost).toBe(1);
      expect(ARGON2_PARAMS.parallelism).toBe(1);
      expect(ARGON2_PARAMS.hashLength).toBe(32);
      expect(ARGON2_PARAMS.saltLength).toBe(32);
    });

    it('should have reasonable constrained parameters', () => {
      expect(ARGON2_PARAMS_CONSTRAINED.type).toBe('argon2id');
      expect(ARGON2_PARAMS_CONSTRAINED.memoryCost).toBe(19456); // 19 MiB
      expect(ARGON2_PARAMS_CONSTRAINED.timeCost).toBe(2);
    });
  });

  describe('validateArgon2Params', () => {
    it('should accept valid OWASP params', () => {
      expect(() => validateArgon2Params(ARGON2_PARAMS)).not.toThrow();
    });

    it('should accept constrained params', () => {
      expect(() => validateArgon2Params(ARGON2_PARAMS_CONSTRAINED)).not.toThrow();
    });

    it('should reject non-argon2id types', () => {
      expect(() =>
        validateArgon2Params({
          ...ARGON2_PARAMS,
          type: 'argon2d' as const,
        })
      ).toThrow('Only argon2id is supported');
    });

    it('should reject low memory cost', () => {
      expect(() =>
        validateArgon2Params({
          ...ARGON2_PARAMS,
          memoryCost: 1024, // Too low
        })
      ).toThrow('Memory cost too low');
    });

    it('should reject zero time cost', () => {
      expect(() =>
        validateArgon2Params({
          ...ARGON2_PARAMS,
          timeCost: 0,
        })
      ).toThrow('Time cost must be at least 1');
    });

    it('should reject short hash length', () => {
      expect(() =>
        validateArgon2Params({
          ...ARGON2_PARAMS,
          hashLength: 16,
        })
      ).toThrow('Hash length must be at least 32 bytes');
    });

    it('should reject extremely high memory cost', () => {
      expect(() =>
        validateArgon2Params({
          ...ARGON2_PARAMS,
          memoryCost: 2097152, // 2 GiB
        })
      ).toThrow('Memory cost too high');
    });
  });

  describe('mergeArgon2Params', () => {
    it('should use defaults when no params provided', () => {
      const merged = mergeArgon2Params();
      expect(merged.type).toBe('argon2id');
      expect(merged.memoryCost).toBe(ARGON2_PARAMS.memoryCost);
      expect(merged.timeCost).toBe(ARGON2_PARAMS.timeCost);
      expect(merged.parallelism).toBe(ARGON2_PARAMS.parallelism);
      expect(merged.hashLength).toBe(ARGON2_PARAMS.hashLength);
    });

    it('should override specific params', () => {
      const merged = mergeArgon2Params({
        memoryCost: 32768,
        timeCost: 3,
      });
      expect(merged.type).toBe('argon2id'); // default
      expect(merged.memoryCost).toBe(32768); // overridden
      expect(merged.timeCost).toBe(3); // overridden
      expect(merged.parallelism).toBe(ARGON2_PARAMS.parallelism); // default
    });
  });
});

// Note: WebArgon2Provider integration tests are skipped in Node.js
// because hash-wasm requires browser WASM environment.
// See e2e tests for full integration testing with Playwright.
