/**
 * Tests for Signed File Cryptography (Phase 3.4)
 *
 * Tests file signing and verification using hybrid signatures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signEncryptedFile,
  verifySignedFile,
  signContentHash,
  verifyContentHash,
  createSignatureParams,
  fileHasSignature,
  getSignatureInfo,
  computeFileContentHash,
  removeSignature,
} from './signedFileCrypto';
import {
  createCVEFHeader,
  parseCVEFHeader,
  isCVEFMetadataV1_2,
  type CVEFMetadataV1_2,
  type CVEFMetadataV1_3,
} from '@stenvault/shared/platform/crypto';
import type {
  HybridSignatureSecretKey,
  HybridSignaturePublicKey,
  HybridSignature,
} from '@stenvault/shared/platform/crypto';
import { HYBRID_SIGNATURE_SIZES } from '@stenvault/shared/platform/crypto';
import { toArrayBuffer } from '@/lib/platform';

// ============ Mock Setup ============

// Mock the signature provider
const mockSign = vi.fn();
const mockVerify = vi.fn();
const mockGenerateKeyPair = vi.fn();

vi.mock('@/lib/platform/webHybridSignatureProvider', () => ({
  getHybridSignatureProvider: () => ({
    sign: mockSign,
    verify: mockVerify,
    generateKeyPair: mockGenerateKeyPair,
  }),
}));

// ============ Test Data Generators ============

function createMockSecretKey(): HybridSignatureSecretKey {
  return {
    classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_SECRET_KEY).fill(0x01),
    postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY).fill(0x02),
  };
}

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
    kdfParams: {
      memoryCost: 47104,
      timeCost: 1,
      parallelism: 1,
    },
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

  const header = createCVEFHeader(metadata);
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
    kdfParams: {
      memoryCost: 47104,
      timeCost: 1,
      parallelism: 1,
    },
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

  const header = createCVEFHeader(metadata);
  return new Blob([toArrayBuffer(header), toArrayBuffer(content)], { type: 'application/octet-stream' });
}

// ============ Tests ============

describe('signedFileCrypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signEncryptedFile', () => {
    it('should sign a CVEF v1.2 file and upgrade to v1.3', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);

      const v12Blob = createCVEFv12Blob();
      const secretKey = createMockSecretKey();

      const result = await signEncryptedFile(v12Blob, {
        secretKey,
        fingerprint: 'test-fingerprint',
        keyVersion: 1,
        context: 'FILE',
      });

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.metadata.version).toBe('1.3');
      expect(result.metadata.signatureParams).toBeDefined();
      expect(result.metadata.signatureParams?.signatureAlgorithm).toBe('ed25519-ml-dsa-65');
      expect(result.metadata.signatureParams?.signerFingerprint).toBe('test-fingerprint');
      expect(result.metadata.signatureParams?.signerKeyVersion).toBe(1);
      expect(result.signature).toBe(mockSig);
      expect(mockSign).toHaveBeenCalledOnce();
    });

    it('should use default FILE context when not specified', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);

      const v12Blob = createCVEFv12Blob();
      const secretKey = createMockSecretKey();

      await signEncryptedFile(v12Blob, {
        secretKey,
        fingerprint: 'test-fingerprint',
        keyVersion: 1,
      });

      expect(mockSign).toHaveBeenCalledWith(expect.any(Uint8Array), secretKey, 'FILE');
    });

    it('should update signature on already-signed v1.3 file', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);

      const v13Blob = createCVEFv13Blob();
      const secretKey = createMockSecretKey();

      const result = await signEncryptedFile(v13Blob, {
        secretKey,
        fingerprint: 'new-fingerprint',
        keyVersion: 2,
      });

      expect(result.metadata.version).toBe('1.3');
      expect(result.metadata.signatureParams?.signerFingerprint).toBe('new-fingerprint');
      expect(result.metadata.signatureParams?.signerKeyVersion).toBe(2);
    });

    it('should compute SHA-256 of encrypted content', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);

      const content = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      const v12Blob = createCVEFv12Blob(content);
      const secretKey = createMockSecretKey();

      await signEncryptedFile(v12Blob, {
        secretKey,
        fingerprint: 'test',
        keyVersion: 1,
      });

      // Verify sign was called with a 32-byte hash (SHA-256)
      expect(mockSign.mock.calls.length).toBeGreaterThan(0);
      const hashArg = mockSign.mock.calls[0]![0] as Uint8Array;
      expect(hashArg.length).toBe(32);
    });
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
      expect(result.error).toContain('not CVEF v1.3');
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
  });

  describe('signContentHash', () => {
    it('should sign a content hash directly', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);

      const hash = new Uint8Array(32).fill(0xAB);
      const secretKey = createMockSecretKey();

      const result = await signContentHash(hash, {
        secretKey,
        fingerprint: 'test',
        keyVersion: 1,
        context: 'TIMESTAMP',
      });

      expect(result).toBe(mockSig);
      expect(mockSign).toHaveBeenCalledWith(hash, secretKey, 'TIMESTAMP');
    });

    it('should use default FILE context', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);

      const hash = new Uint8Array(32).fill(0xAB);
      const secretKey = createMockSecretKey();

      await signContentHash(hash, {
        secretKey,
        fingerprint: 'test',
        keyVersion: 1,
      });

      expect(mockSign).toHaveBeenCalledWith(hash, secretKey, 'FILE');
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

  describe('createSignatureParams', () => {
    it('should create signature params from hybrid signature', () => {
      const signature = createMockSignature();
      const params = createSignatureParams(signature, 'test-fingerprint', 2);

      expect(params.signatureAlgorithm).toBe('ed25519-ml-dsa-65');
      // Type narrowing for discriminated union
      if (params.signatureAlgorithm === 'ed25519-ml-dsa-65') {
        expect(params.classicalSignature).toBeDefined();
        expect(params.pqSignature).toBeDefined();
      }
      expect(params.signingContext).toBe('FILE');
      expect(params.signedAt).toBe(signature.signedAt);
      expect(params.signerFingerprint).toBe('test-fingerprint');
      expect(params.signerKeyVersion).toBe(2);
    });

    it('should encode signatures as Base64', () => {
      const signature = createMockSignature();
      const params = createSignatureParams(signature, 'test', 1);

      // Type narrowing for discriminated union
      if (params.signatureAlgorithm === 'ed25519-ml-dsa-65') {
        // Base64 strings should be decodable
        expect(() => atob(params.classicalSignature)).not.toThrow();
        expect(() => atob(params.pqSignature)).not.toThrow();
      }
    });
  });

  describe('fileHasSignature', () => {
    it('should return true for signed v1.3 file', async () => {
      const v13Blob = createCVEFv13Blob();
      const result = await fileHasSignature(v13Blob);
      expect(result).toBe(true);
    });

    it('should return false for unsigned v1.2 file', async () => {
      const v12Blob = createCVEFv12Blob();
      const result = await fileHasSignature(v12Blob);
      expect(result).toBe(false);
    });

    it('should return false for v1.3 without signature params', async () => {
      const v13Blob = createCVEFv13Blob(new Uint8Array([1, 2, 3]), false);
      const result = await fileHasSignature(v13Blob);
      expect(result).toBe(false);
    });

    it('should return false for invalid file', async () => {
      const invalidBlob = new Blob(['not cvef'], { type: 'application/octet-stream' });
      const result = await fileHasSignature(invalidBlob);
      expect(result).toBe(false);
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
      const info = await getSignatureInfo(v12Blob);
      expect(info).toBeNull();
    });

    it('should return null for invalid file', async () => {
      const invalidBlob = new Blob(['not cvef'], { type: 'application/octet-stream' });
      const info = await getSignatureInfo(invalidBlob);
      expect(info).toBeNull();
    });
  });

  describe('computeFileContentHash', () => {
    it('should compute SHA-256 hash of encrypted content', async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      const v12Blob = createCVEFv12Blob(content);

      const hash = await computeFileContentHash(v12Blob);

      // SHA-256 produces 64 hex characters
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

      const hash1 = await computeFileContentHash(blob1);
      const hash2 = await computeFileContentHash(blob2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('removeSignature', () => {
    it('should downgrade v1.3 to v1.2', async () => {
      const v13Blob = createCVEFv13Blob();
      const result = await removeSignature(v13Blob);

      // Parse the result to verify it's v1.2
      const data = await result.arrayBuffer();
      const bytes = new Uint8Array(data);
      const { metadata } = parseCVEFHeader(bytes);

      expect(isCVEFMetadataV1_2(metadata)).toBe(true);
      expect((metadata as CVEFMetadataV1_3).signatureParams).toBeUndefined();
    });

    it('should return unchanged v1.2 file', async () => {
      const v12Blob = createCVEFv12Blob();
      const result = await removeSignature(v12Blob);

      expect(result).toBe(v12Blob);
    });

    it('should preserve encrypted content', async () => {
      const content = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]);
      const v13Blob = createCVEFv13Blob(content);

      const result = await removeSignature(v13Blob);

      // Parse result
      const data = await result.arrayBuffer();
      const bytes = new Uint8Array(data);
      const { dataOffset } = parseCVEFHeader(bytes);

      // Extract content
      const extractedContent = bytes.slice(dataOffset);
      expect(Array.from(extractedContent)).toEqual(Array.from(content));
    });
  });

  describe('Sign and Verify Roundtrip', () => {
    it('should sign and verify correctly', async () => {
      const mockSig = createMockSignature();
      mockSign.mockResolvedValue(mockSig);
      mockVerify.mockResolvedValue({
        valid: true,
        classicalValid: true,
        postQuantumValid: true,
      });

      const v12Blob = createCVEFv12Blob();
      const secretKey = createMockSecretKey();
      const publicKey = createMockPublicKey();

      // Sign
      const signResult = await signEncryptedFile(v12Blob, {
        secretKey,
        fingerprint: 'roundtrip-test',
        keyVersion: 1,
      });

      // Verify
      const verifyResult = await verifySignedFile(signResult.blob, { publicKey });

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.signerFingerprint).toBe('roundtrip-test');
      expect(verifyResult.signerKeyVersion).toBe(1);
    });
  });

  describe('Context Support', () => {
    it.each(['FILE', 'TIMESTAMP', 'SHARE'] as const)('should support %s context', async (context) => {
      const mockSig = { ...createMockSignature(), context };
      mockSign.mockResolvedValue(mockSig);

      const v12Blob = createCVEFv12Blob();
      const secretKey = createMockSecretKey();

      const result = await signEncryptedFile(v12Blob, {
        secretKey,
        fingerprint: 'test',
        keyVersion: 1,
        context,
      });

      expect(result.metadata.signatureParams?.signingContext).toBe(context);
      expect(mockSign).toHaveBeenCalledWith(expect.any(Uint8Array), secretKey, context);
    });
  });
});
