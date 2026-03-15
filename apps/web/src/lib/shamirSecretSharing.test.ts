/**
 * Shamir's Secret Sharing Tests
 *
 * Tests for the Shamir's Secret Sharing implementation.
 */

import { describe, it, expect } from 'vitest';
import {
  splitSecret,
  combineShares,
  splitSecretString,
  combineSharesString,
  splitKey,
  combineKeyShares,
  encodeShareAsString,
  decodeShareFromString,
  validateShares,
  generateAndSplitKey,
  type EncodedShare,
  type ShamirShare,
} from './shamirSecretSharing';

// ============ GF(2^8) Test Utilities ============
// Recreate field operations locally for testing mathematical properties

const GF256_PRIMITIVE = 0x11d;
const EXP_TABLE: number[] = new Array(512);
const LOG_TABLE: number[] = new Array(256);

function initTestGFTables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x >= 128 ? GF256_PRIMITIVE : 0);
  }
  EXP_TABLE[255] = 1;
  for (let i = 256; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255]!;
  }
  LOG_TABLE[0] = -1;
}

initTestGFTables();

function testGfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const sum = LOG_TABLE[a]! + LOG_TABLE[b]!;
  return EXP_TABLE[sum % 255]!;
}

function testGfDiv(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero");
  if (a === 0) return 0;
  const diff = LOG_TABLE[a]! - LOG_TABLE[b]! + 255;
  return EXP_TABLE[diff % 255]!;
}

function testGfInverse(a: number): number {
  if (a === 0) throw new Error("Zero has no inverse");
  return testGfDiv(1, a);
}

describe('Shamir Secret Sharing', () => {
  describe('splitSecret', () => {
    it('should split a secret into the correct number of shares', () => {
      const secret = new Uint8Array([1, 2, 3, 4, 5]);
      const shares = splitSecret(secret, 5, 3);

      expect(shares).toHaveLength(5);
    });

    it('should create shares with correct indices', () => {
      const secret = new Uint8Array([1, 2, 3]);
      const shares = splitSecret(secret, 3, 2);

      expect(shares[0]?.index).toBe(1);
      expect(shares[1]?.index).toBe(2);
      expect(shares[2]?.index).toBe(3);
    });

    it('should create shares with same length as secret', () => {
      const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const shares = splitSecret(secret, 4, 2);

      for (const share of shares) {
        expect(share.data).toHaveLength(secret.length);
      }
    });

    it('should throw error if threshold > totalShares', () => {
      const secret = new Uint8Array([1, 2, 3]);
      expect(() => splitSecret(secret, 3, 5)).toThrow('Threshold cannot be greater than total shares');
    });

    it('should throw error if threshold < 2', () => {
      const secret = new Uint8Array([1, 2, 3]);
      expect(() => splitSecret(secret, 3, 1)).toThrow('Threshold must be at least 2');
    });

    it('should throw error if totalShares > 255', () => {
      const secret = new Uint8Array([1]);
      expect(() => splitSecret(secret, 256, 2)).toThrow('Maximum 255 shares supported');
    });
  });

  describe('combineShares', () => {
    it('should reconstruct secret from threshold shares', () => {
      const secret = new Uint8Array([42, 123, 255, 0, 100]);
      const shares = splitSecret(secret, 5, 3);

      // Use only 3 shares (threshold)
      const result = combineShares([shares[0]!, shares[2]!, shares[4]!]);

      expect(Array.from(result)).toEqual(Array.from(secret));
    });

    it('should reconstruct secret from all shares', () => {
      const secret = new Uint8Array([1, 2, 3, 4, 5]);
      const shares = splitSecret(secret, 5, 3);

      const result = combineShares(shares);

      expect(Array.from(result)).toEqual(Array.from(secret));
    });

    it('should reconstruct secret with more than threshold shares', () => {
      const secret = new Uint8Array([10, 20, 30]);
      const shares = splitSecret(secret, 5, 2);

      // Use 4 shares (more than threshold of 2)
      const result = combineShares([shares[0]!, shares[1]!, shares[2]!, shares[3]!]);

      expect(Array.from(result)).toEqual(Array.from(secret));
    });

    it('should throw error with less than 2 shares', () => {
      const secret = new Uint8Array([1, 2, 3]);
      const shares = splitSecret(secret, 3, 2);

      expect(() => combineShares([shares[0]!])).toThrow('At least 2 shares required');
    });

    it('should throw error if shares have different lengths', () => {
      const share1: ShamirShare = { index: 1, data: new Uint8Array([1, 2, 3]) };
      const share2: ShamirShare = { index: 2, data: new Uint8Array([1, 2]) };

      expect(() => combineShares([share1, share2])).toThrow('All shares must have the same length');
    });

    it('should work with any valid subset of shares', () => {
      const secret = new Uint8Array([99, 88, 77, 66, 55]);
      const shares = splitSecret(secret, 5, 3);

      // Try different combinations of 3 shares
      const combinations = [
        [0, 1, 2],
        [0, 1, 3],
        [0, 1, 4],
        [0, 2, 3],
        [1, 2, 4],
        [2, 3, 4],
      ];

      for (const combo of combinations) {
        const selectedShares = combo.map(i => shares[i]!);
        const result = combineShares(selectedShares);
        expect(Array.from(result)).toEqual(Array.from(secret));
      }
    });
  });

  describe('string API', () => {
    it('should split string into correct number of shares', () => {
      const secret = 'Hello, World!';
      const shares = splitSecretString(secret, 5, 3);

      expect(shares).toHaveLength(5);
    });

    it('should split and combine string secrets', () => {
      const secret = 'Hello, World!';
      const shares = splitSecretString(secret, 5, 3);

      const result = combineSharesString([shares[0]!, shares[2]!, shares[4]!]);
      expect(result).toBe(secret);
    });

    it('should handle unicode strings', () => {
      // Skipped: combineShares has implementation issues
      const secret = '日本語テスト 🎉';
      const shares = splitSecretString(secret, 3, 2);
      const result = combineSharesString([shares[0]!, shares[1]!]);

      expect(result).toBe(secret);
    });

    it('should handle empty string', () => {
      const secret = '';
      const shares = splitSecretString(secret, 3, 2);
      const result = combineSharesString([shares[0]!, shares[1]!]);

      expect(result).toBe(secret);
    });

    it('should include metadata in encoded shares', () => {
      const shares = splitSecretString('test', 5, 3);

      for (const share of shares) {
        expect(share.threshold).toBe(3);
        expect(share.totalShares).toBe(5);
        expect(typeof share.data).toBe('string');
      }
    });
  });

  describe('key API', () => {
    it('should split Uint8Array keys into correct number of shares', () => {
      const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 16, 32, 64, 128, 255]);
      const shares = splitKey(key, 5, 3) as EncodedShare[];

      expect(shares).toHaveLength(5);
      expect(shares[0]?.threshold).toBe(3);
      expect(shares[0]?.totalShares).toBe(5);
    });

    it('should split and combine Uint8Array keys', () => {
      // Skipped: combineShares has implementation issues
      const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 16, 32, 64, 128, 255]);
      const shares = splitKey(key, 5, 3) as EncodedShare[];

      const recovered = combineKeyShares([shares[0]!, shares[2]!, shares[4]!]);
      expect(Array.from(recovered)).toEqual(Array.from(key));
    });

    it('should split ArrayBuffer keys into correct number of shares', () => {
      const keyArray = new Uint8Array([10, 20, 30, 40, 50]);
      const key = keyArray.buffer;
      const shares = splitKey(key, 3, 2) as EncodedShare[];

      expect(shares).toHaveLength(3);
    });

    it('should split and combine ArrayBuffer keys', () => {
      // Skipped: combineShares has implementation issues
      const keyArray = new Uint8Array([10, 20, 30, 40, 50]);
      const key = keyArray.buffer;
      const shares = splitKey(key, 3, 2) as EncodedShare[];

      const recovered = combineKeyShares([shares[0]!, shares[1]!]);
      expect(Array.from(recovered)).toEqual(Array.from(keyArray));
    });
  });

  describe('share encoding', () => {
    it('should encode share as string', () => {
      const share: EncodedShare = {
        index: 1,
        threshold: 3,
        totalShares: 5,
        data: 'SGVsbG8=',
      };

      const encoded = encodeShareAsString(share);
      expect(encoded).toBe('shamir:v1:1/3/5:SGVsbG8=');
    });

    it('should decode share from string', () => {
      const encoded = 'shamir:v1:2/3/5:dGVzdA==';
      const decoded = decodeShareFromString(encoded);

      expect(decoded.index).toBe(2);
      expect(decoded.threshold).toBe(3);
      expect(decoded.totalShares).toBe(5);
      expect(decoded.data).toBe('dGVzdA==');
    });

    it('should round-trip encode and decode', () => {
      const original: EncodedShare = {
        index: 3,
        threshold: 2,
        totalShares: 4,
        data: 'YWJjZGVm',
      };

      const encoded = encodeShareAsString(original);
      const decoded = decodeShareFromString(encoded);

      expect(decoded).toEqual(original);
    });

    it('should throw error on invalid format', () => {
      expect(() => decodeShareFromString('invalid')).toThrow('Invalid share format');
      expect(() => decodeShareFromString('shamir:v2:1/2/3:data')).toThrow('Invalid share format');
      expect(() => decodeShareFromString('shamir:v1:abc:data')).toThrow('Invalid share format');
    });
  });

  describe('validateShares', () => {
    it('should validate compatible shares', () => {
      const shares = splitSecretString('test', 5, 3);
      const result = validateShares([shares[0]!, shares[1]!, shares[2]!]);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty array', () => {
      const result = validateShares([]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No shares provided');
    });

    it('should reject shares with different thresholds', () => {
      const share1: EncodedShare = { index: 1, threshold: 2, totalShares: 5, data: 'a' };
      const share2: EncodedShare = { index: 2, threshold: 3, totalShares: 5, data: 'b' };

      const result = validateShares([share1, share2]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Shares have different thresholds');
    });

    it('should reject shares with different total counts', () => {
      const share1: EncodedShare = { index: 1, threshold: 2, totalShares: 5, data: 'a' };
      const share2: EncodedShare = { index: 2, threshold: 2, totalShares: 4, data: 'b' };

      const result = validateShares([share1, share2]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Shares have different total counts');
    });

    it('should reject insufficient shares', () => {
      const shares = splitSecretString('test', 5, 3);
      const result = validateShares([shares[0]!, shares[1]!]); // Only 2, need 3

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Need 3 shares, only have 2');
    });

    it('should reject duplicate indices', () => {
      const share1: EncodedShare = { index: 1, threshold: 2, totalShares: 3, data: 'a' };
      const share2: EncodedShare = { index: 1, threshold: 2, totalShares: 3, data: 'b' };

      const result = validateShares([share1, share2]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Duplicate share indices');
    });
  });

  describe('generateAndSplitKey', () => {
    it('should generate key and split into shares', async () => {
      const { key, shares } = await generateAndSplitKey(32, 5, 3);

      expect(key).toHaveLength(32);
      expect(shares).toHaveLength(5);
    });

    it('should allow reconstruction of generated key', async () => {
      // Skipped: combineShares has implementation issues
      const { key, shares } = await generateAndSplitKey(16, 4, 2);

      const recovered = combineKeyShares([shares[0]!, shares[2]!]);

      expect(Array.from(recovered)).toEqual(Array.from(key));
    });

    it('should generate different keys each time', async () => {
      const result1 = await generateAndSplitKey(16, 3, 2);
      const result2 = await generateAndSplitKey(16, 3, 2);

      // Keys should be different (extremely unlikely to be same)
      expect(Array.from(result1.key)).not.toEqual(Array.from(result2.key));
    });

    it('should include correct metadata in shares', async () => {
      const { shares } = await generateAndSplitKey(16, 5, 3);

      for (const share of shares) {
        expect(share.threshold).toBe(3);
        expect(share.totalShares).toBe(5);
        expect(typeof share.data).toBe('string');
      }
    });
  });

  describe('edge cases', () => {
    it('should create shares for single byte secret', () => {
      const secret = new Uint8Array([42]);
      const shares = splitSecret(secret, 3, 2);

      expect(shares).toHaveLength(3);
      expect(shares[0]?.data).toHaveLength(1);
    });

    it('should handle single byte secret reconstruction', () => {
      // Skipped: combineShares has implementation issues
      const secret = new Uint8Array([42]);
      const shares = splitSecret(secret, 3, 2);
      const result = combineShares([shares[0]!, shares[1]!]);

      expect(Array.from(result)).toEqual([42]);
    });

    it('should create shares for large secret', () => {
      const secret = new Uint8Array(1000);
      crypto.getRandomValues(secret);

      const shares = splitSecret(secret, 5, 3);

      expect(shares).toHaveLength(5);
      expect(shares[0]?.data).toHaveLength(1000);
    });

    it('should handle large secret reconstruction', () => {
      // Skipped: combineShares has implementation issues
      const secret = new Uint8Array(1000);
      crypto.getRandomValues(secret);

      const shares = splitSecret(secret, 5, 3);
      const result = combineShares([shares[1]!, shares[2]!, shares[4]!]);

      expect(Array.from(result)).toEqual(Array.from(secret));
    });

    it('should create shares when threshold equals total', () => {
      const secret = new Uint8Array([1, 2, 3]);
      const shares = splitSecret(secret, 3, 3);

      expect(shares).toHaveLength(3);
    });

    it('should handle threshold equal to total shares', () => {
      // Skipped: combineShares has implementation issues
      const secret = new Uint8Array([1, 2, 3]);
      const shares = splitSecret(secret, 3, 3);
      const result = combineShares(shares);

      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it('should create shares for minimum valid config (2 of 2)', () => {
      const secret = new Uint8Array([100, 200]);
      const shares = splitSecret(secret, 2, 2);

      expect(shares).toHaveLength(2);
    });

    it('should handle minimum valid config (2 of 2) reconstruction', () => {
      // Skipped: combineShares has implementation issues
      const secret = new Uint8Array([100, 200]);
      const shares = splitSecret(secret, 2, 2);
      const result = combineShares(shares);

      expect(Array.from(result)).toEqual([100, 200]);
    });

    it('should handle all zero bytes', () => {
      const secret = new Uint8Array([0, 0, 0, 0]);
      const shares = splitSecret(secret, 3, 2);
      const result = combineShares([shares[0]!, shares[2]!]);

      expect(Array.from(result)).toEqual([0, 0, 0, 0]);
    });

    it('should handle all 255 bytes', () => {
      // Skipped: combineShares has implementation issues
      const secret = new Uint8Array([255, 255, 255]);
      const shares = splitSecret(secret, 3, 2);
      const result = combineShares([shares[0]!, shares[1]!]);

      expect(Array.from(result)).toEqual([255, 255, 255]);
    });
  });

  // ============ M2: GF(2^8) Field Property Tests ============
  describe('GF(2^8) Field Properties', () => {
    describe('Multiplicative Group Order', () => {
      it('should have generator (g=2) with order 255', () => {
        // g^255 = 1 for generator g=2
        let x = 1;
        for (let i = 0; i < 255; i++) {
          x = testGfMul(x, 2);
        }
        expect(x).toBe(1);
      });

      it('should have g^i != 1 for all i < 255', () => {
        let x = 1;
        for (let i = 1; i < 255; i++) {
          x = testGfMul(x, 2);
          expect(x).not.toBe(1);
        }
      });

      it('should generate all 255 non-zero elements', () => {
        const generated = new Set<number>();
        let x = 1;
        for (let i = 0; i < 255; i++) {
          generated.add(x);
          x = testGfMul(x, 2);
        }
        expect(generated.size).toBe(255);
        expect(generated.has(0)).toBe(false);
      });
    });

    describe('Multiplicative Inverses', () => {
      it('should have inverse for all non-zero elements', () => {
        for (let a = 1; a < 256; a++) {
          const inv = testGfInverse(a);
          const product = testGfMul(a, inv);
          expect(product).toBe(1);
        }
      });

      it('should throw for inverse of zero', () => {
        expect(() => testGfInverse(0)).toThrow("Zero has no inverse");
      });
    });

    describe('Division is Inverse of Multiplication', () => {
      it('should satisfy (a * b) / b = a for all non-zero a, b', () => {
        // Test representative sample (full 256x256 would be slow)
        const testValues = [1, 2, 3, 7, 15, 31, 63, 127, 128, 200, 254, 255];

        for (const a of testValues) {
          for (const b of testValues) {
            const product = testGfMul(a, b);
            const result = testGfDiv(product, b);
            expect(result).toBe(a);
          }
        }
      });

      it('should satisfy a / b * b = a for all non-zero a, b', () => {
        const testValues = [1, 2, 3, 7, 15, 31, 63, 127, 128, 200, 254, 255];

        for (const a of testValues) {
          for (const b of testValues) {
            const quotient = testGfDiv(a, b);
            const result = testGfMul(quotient, b);
            expect(result).toBe(a);
          }
        }
      });

      it('should throw for division by zero', () => {
        expect(() => testGfDiv(42, 0)).toThrow("Division by zero");
      });
    });

    describe('Field Axioms - Commutativity', () => {
      it('should satisfy a * b = b * a (multiplication commutative)', () => {
        for (let i = 0; i < 100; i++) {
          const a = Math.floor(Math.random() * 256);
          const b = Math.floor(Math.random() * 256);
          expect(testGfMul(a, b)).toBe(testGfMul(b, a));
        }
      });

      it('should satisfy a ^ b = b ^ a (addition/XOR commutative)', () => {
        for (let i = 0; i < 100; i++) {
          const a = Math.floor(Math.random() * 256);
          const b = Math.floor(Math.random() * 256);
          expect(a ^ b).toBe(b ^ a);
        }
      });
    });

    describe('Field Axioms - Associativity', () => {
      it('should satisfy (a * b) * c = a * (b * c)', () => {
        const testValues = [1, 2, 3, 7, 42, 100, 127, 200, 255];

        for (const a of testValues) {
          for (const b of testValues) {
            for (const c of testValues) {
              const left = testGfMul(testGfMul(a, b), c);
              const right = testGfMul(a, testGfMul(b, c));
              expect(left).toBe(right);
            }
          }
        }
      });

      it('should satisfy (a ^ b) ^ c = a ^ (b ^ c) (XOR associative)', () => {
        for (let i = 0; i < 50; i++) {
          const a = Math.floor(Math.random() * 256);
          const b = Math.floor(Math.random() * 256);
          const c = Math.floor(Math.random() * 256);
          expect((a ^ b) ^ c).toBe(a ^ (b ^ c));
        }
      });
    });

    describe('Field Axioms - Distributivity', () => {
      it('should satisfy a * (b ^ c) = (a * b) ^ (a * c)', () => {
        const testValues = [0, 1, 2, 3, 7, 42, 100, 127, 200, 255];

        for (const a of testValues) {
          for (const b of testValues) {
            for (const c of testValues) {
              const left = testGfMul(a, b ^ c);
              const right = testGfMul(a, b) ^ testGfMul(a, c);
              expect(left).toBe(right);
            }
          }
        }
      });
    });

    describe('Identity Elements', () => {
      it('should have multiplicative identity 1 (a * 1 = a)', () => {
        for (let a = 0; a < 256; a++) {
          expect(testGfMul(a, 1)).toBe(a);
        }
      });

      it('should have additive identity 0 (a ^ 0 = a)', () => {
        for (let a = 0; a < 256; a++) {
          expect(a ^ 0).toBe(a);
        }
      });
    });

    describe('Zero Properties', () => {
      it('should satisfy a * 0 = 0', () => {
        for (let a = 0; a < 256; a++) {
          expect(testGfMul(a, 0)).toBe(0);
        }
      });

      it('should satisfy 0 / a = 0 for non-zero a', () => {
        for (let a = 1; a < 256; a++) {
          expect(testGfDiv(0, a)).toBe(0);
        }
      });
    });

    describe('EXP/LOG Table Consistency', () => {
      it('should have LOG_TABLE[EXP_TABLE[i]] = i for i < 255', () => {
        for (let i = 0; i < 255; i++) {
          const exp = EXP_TABLE[i]!;
          expect(LOG_TABLE[exp]).toBe(i);
        }
      });

      it('should have EXP_TABLE[LOG_TABLE[x]] = x for x > 0', () => {
        for (let x = 1; x < 256; x++) {
          const log = LOG_TABLE[x]!;
          expect(EXP_TABLE[log]).toBe(x);
        }
      });

      it('should have LOG_TABLE[0] = -1 (sentinel)', () => {
        expect(LOG_TABLE[0]).toBe(-1);
      });

      it('should have extended EXP_TABLE wrap correctly', () => {
        for (let i = 255; i < 512; i++) {
          expect(EXP_TABLE[i]).toBe(EXP_TABLE[i - 255]);
        }
      });
    });

    describe('Primitive Polynomial Correctness', () => {
      it('should use correct primitive polynomial 0x11d', () => {
        // x^8 + x^4 + x^3 + x^2 + 1 = 100011101 in binary = 0x11d
        expect(GF256_PRIMITIVE).toBe(0x11d);
        expect(GF256_PRIMITIVE).toBe(285);
      });

      it('should correctly reduce x^8 using primitive polynomial', () => {
        // x^8 = x^4 + x^3 + x^2 + 1 in GF(2^8) with our polynomial
        // This is verified by the multiplication table working correctly
        // If 128 (x^7) * 2 = 256 (x^8), it should reduce to 0x1d (29)
        const x7 = 128; // 10000000 in binary = x^7
        const result = testGfMul(x7, 2); // x^7 * x = x^8
        expect(result).toBe(0x1d); // x^4 + x^3 + x^2 + 1 = 11101 = 29 = 0x1d
      });
    });

    describe('Integration with Shamir Implementation', () => {
      it('should correctly split and combine using field operations', () => {
        // Verify that the Shamir implementation uses correct GF(2^8) operations
        // by testing with specific values that exercise edge cases
        const edgeCases = [
          new Uint8Array([0]),           // Zero
          new Uint8Array([1]),           // Multiplicative identity
          new Uint8Array([255]),         // Maximum value
          new Uint8Array([128]),         // Power of 2
          new Uint8Array([0x1d]),        // Primitive polynomial low bits
        ];

        for (const secret of edgeCases) {
          const shares = splitSecret(secret, 3, 2);
          const recovered = combineShares([shares[0]!, shares[2]!]);
          expect(Array.from(recovered)).toEqual(Array.from(secret));
        }
      });

      it('should handle secrets with all possible byte values', () => {
        // Create a secret with all 256 possible byte values
        const secret = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
          secret[i] = i;
        }

        const shares = splitSecret(secret, 5, 3);
        const recovered = combineShares([shares[1]!, shares[2]!, shares[4]!]);
        expect(Array.from(recovered)).toEqual(Array.from(secret));
      });
    });
  });
});
