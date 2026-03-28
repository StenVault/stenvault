/**
 * Tests for Signed File Cryptography
 *
 * Tests v1.3 and v1.4 file verification and utility functions.
 * Signing is now done at encrypt time in hybridFileCrypto (v1.4).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifySignedFile,
  verifyContentHash,
  fileHasSignature,
  getSignatureInfo,
  computeFileContentHash,
} from './signedFileCrypto';
import {
  createCVEFHeader,
  parseCVEFHeader,
  type CVEFMetadataV1_2,
  type CVEFMetadataV1_3,
  type CVEFMetadataV1_4,
  type CVEFSignatureMetadata,
} from '@stenvault/shared/platform/crypto';
import type {
  HybridSignaturePublicKey,
  HybridSignature,
} from '@stenvault/shared/platform/crypto';
import { HYBRID_SIGNATURE_SIZES } from '@stenvault/shared/platform/crypto';
import { toArrayBuffer } from '@/lib/platform';

// ============ Mock Setup ============

const mockVerify = vi.fn();

vi.mock('@/lib/platform/webHybridSignatureProvider', () => ({
  getHybridSignatureProvider: () => ({
    sign: vi.fn(),
    verify: mockVerify,
    generateKeyPair: vi.fn(),
  }),
}));

// ============ Test Data Generators ============

function createMockPublicKey(): HybridSignaturePublicKey {
  return {
    classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).fill(0x03),
    postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).fill(0x04),
  };
}

function createMockSignature(): HybridSignature {
  return {
    classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE).fill(0x05),
    postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE).fill(0x06),
    context: 'FILE',
    signedAt: Date.now(),
  };
}

function createCVEFv12Blob(content: Uint8Array = new Uint8Array([1, 2, 3, 4, 5])): Blob {
  const metadata: CVEFMetadataV1_2 = {
    version: '1.2',
    salt: 'dGVzdHNhbHQ=',
    iv: 'dGVzdGl2',
    algorithm: 'AES-256-GCM',
    iterations: 0,
    kdfAlgorithm: 'argon2id',
    kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
    keyWrapAlgorithm: 'aes-kw',
    masterKeyVersion: 1,
    pqcAlgorithm: 'ml-kem-768',
    pqcParams: {
      kemAlgorithm: 'x25519-ml-kem-768',
      classicalCiphertext: 'dGVzdGNsYXNzaWNhbA==',
      pqCiphertext: 'dGVzdHBx',
      wrappedFileKey: 'dGVzdHdyYXBwZWQ=',
    },
  };

  const { header } = createCVEFHeader(metadata);
  return new Blob([toArrayBuffer(header), toArrayBuffer(content)], { type: 'application/octet-stream' });
}

function createCVEFv13Blob(
  content: Uint8Array = new Uint8Array([1, 2, 3, 4, 5]),
  includeSignature = true
): Blob {
  const metadata: CVEFMetadataV1_3 = {
    version: '1.3',
    salt: 'dGVzdHNhbHQ=',
    iv: 'dGVzdGl2',
    algorithm: 'AES-256-GCM',
    iterations: 0,
    kdfAlgorithm: 'argon2id',
    kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
    keyWrapAlgorithm: 'aes-kw',
    masterKeyVersion: 1,
    pqcAlgorithm: 'ml-kem-768',
    pqcParams: {
      kemAlgorithm: 'x25519-ml-kem-768',
      classicalCiphertext: 'dGVzdGNsYXNzaWNhbA==',
      pqCiphertext: 'dGVzdHBx',
      wrappedFileKey: 'dGVzdHdyYXBwZWQ=',
    },
    signatureParams: includeSignature
      ? {
          signatureAlgorithm: 'ed25519-ml-dsa-65',
          classicalSignature: btoa(
            String.fromCharCode(...new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE).fill(0x05))
          ),
          pqSignature: btoa(
            String.fromCharCode(...new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE).fill(0x06))
          ),
          signingContext: 'FILE',
          signedAt: Date.now(),
          signerFingerprint: 'abc123',
          signerKeyVersion: 1,
        }
      : undefined,
  };

  const { header } = createCVEFHeader(metadata);
  return new Blob([toArrayBuffer(header), toArrayBuffer(content)], { type: 'application/octet-stream' });
}

function createCVEFv14Metadata(): CVEFMetadataV1_4 {
  return {
    version: '1.4',
    salt: 'dGVzdHNhbHQ=',
    iv: 'dGVzdGl2',
    algorithm: 'AES-256-GCM',
    iterations: 0,
    kdfAlgorithm: 'argon2id',
    kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
    keyWrapAlgorithm: 'aes-kw',
    masterKeyVersion: 1,
    pqcAlgorithm: 'ml-kem-768',
    pqcParams: {
      kemAlgorithm: 'x25519-ml-kem-768',
      classicalCiphertext: 'dGVzdGNsYXNzaWNhbA==',
      pqCiphertext: 'dGVzdHBx',
      wrappedFileKey: 'dGVzdHdyYXBwZWQ=',
    },
  };
}

function createMockSignatureMetadata(): CVEFSignatureMetadata {
  return {
    signatureAlgorithm: 'ed25519-ml-dsa-65',
    classicalSignature: btoa(
      String.fromCharCode(...new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE).fill(0x05))
    ),
    pqSignature: btoa(
      String.fromCharCode(...new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE).fill(0x06))
    ),
    signingContext: 'FILE',
    signedAt: Date.now(),
    signerFingerprint: 'v14fp',
    signerKeyVersion: 2,
  };
}

function createCVEFv14Blob(
  content: Uint8Array = new Uint8Array([1, 2, 3, 4, 5]),
  includeSignature = true
): Blob {
  const metadata = createCVEFv14Metadata();
  const sigMeta = includeSignature ? createMockSignatureMetadata() : undefined;
  const { header } = createCVEFHeader(metadata, sigMeta);
  return new Blob([toArrayBuffer(header), toArrayBuffer(content)], { type: 'application/octet-stream' });
}

// ============ Tests ============

describe('signedFileCrypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifySignedFile', () => {
    it('should verify a valid signed file', async () => {
      mockVerify.mockResolvedValue({
        valid: true,
        classicalValid: true,
        postQuantumValid: true,
      });

      const v13Blob = createCVEFv13Blob();
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v13Blob, { publicKey });

      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.postQuantumValid).toBe(true);
      expect(result.signerFingerprint).toBe('abc123');
      expect(result.signerKeyVersion).toBe(1);
      expect(mockVerify).toHaveBeenCalledOnce();
    });

    it('should reject unsigned v1.2 file', async () => {
      const v12Blob = createCVEFv12Blob();
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v12Blob, { publicKey });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a signed format');
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('should reject v1.3 file without signature params', async () => {
      const v13Blob = createCVEFv13Blob(new Uint8Array([1, 2, 3]), false);
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v13Blob, { publicKey });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('no valid signature');
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('should return verification failure details', async () => {
      mockVerify.mockResolvedValue({
        valid: false,
        classicalValid: true,
        postQuantumValid: false,
        error: 'ML-DSA-65 signature invalid',
      });

      const v13Blob = createCVEFv13Blob();
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v13Blob, { publicKey });

      expect(result.valid).toBe(false);
      expect(result.classicalValid).toBe(true);
      expect(result.postQuantumValid).toBe(false);
      expect(result.error).toBe('ML-DSA-65 signature invalid');
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidBlob = new Blob(['not a cvef file'], { type: 'application/octet-stream' });
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(invalidBlob, { publicKey });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    // ── v1.4 verification tests ──

    it('should verify a valid signed v1.4 file', async () => {
      mockVerify.mockResolvedValue({
        valid: true,
        classicalValid: true,
        postQuantumValid: true,
      });

      const v14Blob = createCVEFv14Blob();
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v14Blob, { publicKey });

      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.postQuantumValid).toBe(true);
      expect(result.signerFingerprint).toBe('v14fp');
      expect(result.signerKeyVersion).toBe(2);
      expect(mockVerify).toHaveBeenCalledOnce();
    });

    it('should reject v1.4 file without signature metadata', async () => {
      const v14Blob = createCVEFv14Blob(new Uint8Array([1, 2, 3]), false);
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v14Blob, { publicKey });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('no valid signature metadata');
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('should return verification failure details for v1.4', async () => {
      mockVerify.mockResolvedValue({
        valid: false,
        classicalValid: true,
        postQuantumValid: false,
        error: 'ML-DSA-65 signature invalid',
      });

      const v14Blob = createCVEFv14Blob();
      const publicKey = createMockPublicKey();

      const result = await verifySignedFile(v14Blob, { publicKey });

      expect(result.valid).toBe(false);
      expect(result.classicalValid).toBe(true);
      expect(result.postQuantumValid).toBe(false);
      expect(result.error).toBe('ML-DSA-65 signature invalid');
    });

    it('should verify v1.4 signature against SHA-256(coreMetadataBytes)', async () => {
      mockVerify.mockResolvedValue({
        valid: true,
        classicalValid: true,
        postQuantumValid: true,
      });

      const v14Blob = createCVEFv14Blob();
      const publicKey = createMockPublicKey();

      await verifySignedFile(v14Blob, { publicKey });

      // The hash passed to verify should be SHA-256 of core metadata, not content
      const verifyCall = mockVerify.mock.calls[0]!;
      const hashArg = verifyCall[0] as Uint8Array;
      expect(hashArg.length).toBe(32); // SHA-256 output
    });
  });

  describe('verifyContentHash', () => {
    it('should verify a signature against content hash', async () => {
      mockVerify.mockResolvedValue({
        valid: true,
        classicalValid: true,
        postQuantumValid: true,
      });

      const hash = new Uint8Array(32).fill(0xAB);
      const signature = createMockSignature();
      const publicKey = createMockPublicKey();

      const result = await verifyContentHash(hash, signature, publicKey);

      expect(result.valid).toBe(true);
      expect(result.signedAt).toBe(signature.signedAt);
      expect(mockVerify).toHaveBeenCalledWith(hash, signature, publicKey);
    });

    it('should handle verification errors', async () => {
      mockVerify.mockRejectedValue(new Error('Verification failed'));

      const hash = new Uint8Array(32).fill(0xAB);
      const signature = createMockSignature();
      const publicKey = createMockPublicKey();

      const result = await verifyContentHash(hash, signature, publicKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Verification failed');
    });
  });

  describe('fileHasSignature', () => {
    it('should return true for signed v1.3 file', async () => {
      const v13Blob = createCVEFv13Blob();
      expect(await fileHasSignature(v13Blob)).toBe(true);
    });

    it('should return false for unsigned v1.2 file', async () => {
      const v12Blob = createCVEFv12Blob();
      expect(await fileHasSignature(v12Blob)).toBe(false);
    });

    it('should return false for v1.3 without signature params', async () => {
      const v13Blob = createCVEFv13Blob(new Uint8Array([1, 2, 3]), false);
      expect(await fileHasSignature(v13Blob)).toBe(false);
    });

    it('should return false for invalid file', async () => {
      const invalidBlob = new Blob(['not cvef'], { type: 'application/octet-stream' });
      expect(await fileHasSignature(invalidBlob)).toBe(false);
    });

    it('should return true for signed v1.4 file', async () => {
      const v14Blob = createCVEFv14Blob();
      expect(await fileHasSignature(v14Blob)).toBe(true);
    });

    it('should return false for unsigned v1.4 file', async () => {
      const v14Blob = createCVEFv14Blob(new Uint8Array([1, 2, 3]), false);
      expect(await fileHasSignature(v14Blob)).toBe(false);
    });
  });

  describe('getSignatureInfo', () => {
    it('should extract signature info from signed file', async () => {
      const v13Blob = createCVEFv13Blob();
      const info = await getSignatureInfo(v13Blob);

      expect(info).not.toBeNull();
      expect(info?.signerFingerprint).toBe('abc123');
      expect(info?.signerKeyVersion).toBe(1);
      expect(info?.context).toBe('FILE');
      expect(info?.signedAt).toBeGreaterThan(0);
    });

    it('should return null for unsigned file', async () => {
      const v12Blob = createCVEFv12Blob();
      expect(await getSignatureInfo(v12Blob)).toBeNull();
    });

    it('should return null for invalid file', async () => {
      const invalidBlob = new Blob(['not cvef'], { type: 'application/octet-stream' });
      expect(await getSignatureInfo(invalidBlob)).toBeNull();
    });

    it('should extract signature info from signed v1.4 file', async () => {
      const v14Blob = createCVEFv14Blob();
      const info = await getSignatureInfo(v14Blob);

      expect(info).not.toBeNull();
      expect(info?.signerFingerprint).toBe('v14fp');
      expect(info?.signerKeyVersion).toBe(2);
      expect(info?.context).toBe('FILE');
      expect(info?.signedAt).toBeGreaterThan(0);
    });

    it('should return null for unsigned v1.4 file', async () => {
      const v14Blob = createCVEFv14Blob(new Uint8Array([1, 2, 3]), false);
      expect(await getSignatureInfo(v14Blob)).toBeNull();
    });
  });

  describe('computeFileContentHash', () => {
    it('should compute SHA-256 hash of encrypted content', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      const v12Blob = createCVEFv12Blob(content);

      const hash = await computeFileContentHash(v12Blob);

      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('should produce different hashes for different content', async () => {
      const blob1 = createCVEFv12Blob(new Uint8Array([1, 2, 3]));
      const blob2 = createCVEFv12Blob(new Uint8Array([4, 5, 6]));

      const hash1 = await computeFileContentHash(blob1);
      const hash2 = await computeFileContentHash(blob2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash for same content', async () => {
      const content = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      const blob1 = createCVEFv12Blob(content);
      const blob2 = createCVEFv12Blob(content);

      expect(await computeFileContentHash(blob1)).toBe(await computeFileContentHash(blob2));
    });

    it('should hash coreMetadataBytes for v1.4 (not content)', async () => {
      // Two v1.4 blobs with SAME metadata but DIFFERENT content should produce SAME hash
      // because v1.4 signs SHA-256(coreMetadataBytes), not content
      const blob1 = createCVEFv14Blob(new Uint8Array([1, 2, 3]));
      const blob2 = createCVEFv14Blob(new Uint8Array([4, 5, 6]));

      const hash1 = await computeFileContentHash(blob1);
      const hash2 = await computeFileContentHash(blob2);

      expect(hash1).toBe(hash2); // same metadata → same hash
    });

    it('should hash encrypted content for v1.2 (not metadata)', async () => {
      // Two v1.2 blobs with SAME metadata but DIFFERENT content should produce DIFFERENT hash
      const blob1 = createCVEFv12Blob(new Uint8Array([1, 2, 3]));
      const blob2 = createCVEFv12Blob(new Uint8Array([4, 5, 6]));

      const hash1 = await computeFileContentHash(blob1);
      const hash2 = await computeFileContentHash(blob2);

      expect(hash1).not.toBe(hash2); // different content → different hash
    });

    it('should return valid hex SHA-256 for v1.4', async () => {
      const v14Blob = createCVEFv14Blob();
      const hash = await computeFileContentHash(v14Blob);

      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });
  });
});
