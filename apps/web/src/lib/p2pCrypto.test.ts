/**
 * P2P Crypto Tests
 *
 * Tests for P2P cryptographic utilities.
 * Uses WebCrypto API for X25519 ECDH and AES-GCM operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  importPublicKeyCrypto,
  generateKeyFingerprint,
  deriveSharedKey,
  encryptForRecipient,
  decryptFromSender,
  verifyKeyFingerprint,
  base64urlEncode,
  base64urlDecode,
  type P2PKeyPair,
} from './p2pCrypto';

describe('P2P Crypto (X25519 ECDH)', () => {
  describe('Base64url Helpers', () => {
    it('should round-trip encode/decode', () => {
      const data = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16]);
      const encoded = base64urlEncode(data);
      const decoded = base64urlDecode(encoded);
      expect(Array.from(decoded)).toEqual(Array.from(data));
    });

    it('should produce URL-safe characters', () => {
      const data = new Uint8Array(32);
      crypto.getRandomValues(data);
      const encoded = base64urlEncode(data);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });
  });

  describe('Key Generation', () => {
    describe('generateKeyPair', () => {
      it('should generate X25519 key pair', async () => {
        const keyPair = await generateKeyPair();

        expect(keyPair).toHaveProperty('publicKey');
        expect(keyPair).toHaveProperty('privateKey');
        expect(keyPair).toHaveProperty('publicKeyRaw');
        expect(keyPair).toHaveProperty('publicKeyBase64');
      });

      it('should generate 32-byte raw public key', async () => {
        const keyPair = await generateKeyPair();

        expect(keyPair.publicKeyRaw).toBeInstanceOf(Uint8Array);
        expect(keyPair.publicKeyRaw.length).toBe(32);
      });

      it('should generate base64url-encoded public key', async () => {
        const keyPair = await generateKeyPair();

        expect(typeof keyPair.publicKeyBase64).toBe('string');
        // base64url of 32 bytes = 43 chars (no padding)
        expect(keyPair.publicKeyBase64.length).toBe(43);
        expect(keyPair.publicKeyBase64).not.toContain('+');
        expect(keyPair.publicKeyBase64).not.toContain('/');
      });

      it('should have non-extractable private key', async () => {
        const keyPair = await generateKeyPair();

        expect(keyPair.privateKey.extractable).toBe(false);
      });

      it('should generate X25519 algorithm keys', async () => {
        const keyPair = await generateKeyPair();

        expect(keyPair.publicKey.algorithm.name).toBe('X25519');
        expect(keyPair.privateKey.algorithm.name).toBe('X25519');
      });

      it('should have deriveBits usage on private key', async () => {
        const keyPair = await generateKeyPair();

        expect(keyPair.privateKey.usages).toContain('deriveBits');
      });
    });
  });

  describe('Key Import/Export', () => {
    describe('exportPublicKey', () => {
      it('should export key as base64url with fingerprint', async () => {
        const keyPair = await generateKeyPair();
        const exported = await exportPublicKey(keyPair);

        expect(exported).toHaveProperty('base64');
        expect(exported).toHaveProperty('fingerprint');
        expect(exported.base64).toBe(keyPair.publicKeyBase64);
      });

      it('should generate formatted fingerprint', async () => {
        const keyPair = await generateKeyPair();
        const exported = await exportPublicKey(keyPair);

        expect(exported.fingerprint).toMatch(/^[\w-]+$/);
      });
    });

    describe('importPublicKey', () => {
      it('should decode base64url to raw bytes', async () => {
        const keyPair = await generateKeyPair();
        const rawBytes = importPublicKey(keyPair.publicKeyBase64);

        expect(rawBytes).toBeInstanceOf(Uint8Array);
        expect(rawBytes.length).toBe(32);
        expect(Array.from(rawBytes)).toEqual(Array.from(keyPair.publicKeyRaw));
      });
    });

    describe('importPublicKeyCrypto', () => {
      it('should import raw bytes as CryptoKey', async () => {
        const keyPair = await generateKeyPair();
        const cryptoKey = await importPublicKeyCrypto(keyPair.publicKeyRaw);

        expect(cryptoKey).toBeInstanceOf(CryptoKey);
        expect(cryptoKey.algorithm.name).toBe('X25519');
      });
    });

    describe('generateKeyFingerprint', () => {
      it('should generate fingerprint from raw bytes', async () => {
        const keyPair = await generateKeyPair();
        const fingerprint = await generateKeyFingerprint(keyPair.publicKeyRaw);

        expect(fingerprint).toBeTruthy();
        expect(typeof fingerprint).toBe('string');
      });

      it('should be deterministic', async () => {
        const keyPair = await generateKeyPair();
        const fp1 = await generateKeyFingerprint(keyPair.publicKeyRaw);
        const fp2 = await generateKeyFingerprint(keyPair.publicKeyRaw);

        expect(fp1).toBe(fp2);
      });

      it('should be different for different keys', async () => {
        const kp1 = await generateKeyPair();
        const kp2 = await generateKeyPair();
        const fp1 = await generateKeyFingerprint(kp1.publicKeyRaw);
        const fp2 = await generateKeyFingerprint(kp2.publicKeyRaw);

        expect(fp1).not.toBe(fp2);
      });
    });
  });

  describe('ECDH Key Agreement', () => {
    describe('deriveSharedKey', () => {
      it('should derive same key from both directions (ECDH symmetry)', async () => {
        const alice = await generateKeyPair();
        const bob = await generateKeyPair();

        const keyAB = await deriveSharedKey(alice.privateKey, bob.publicKeyRaw);
        const keyBA = await deriveSharedKey(bob.privateKey, alice.publicKeyRaw);

        // Both should be AES-GCM keys
        expect(keyAB.algorithm.name).toBe('AES-GCM');
        expect(keyBA.algorithm.name).toBe('AES-GCM');

        // Verify they produce same encryption: encrypt with AB, decrypt with BA
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode('ECDH symmetry test');

        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          keyAB,
          data
        );

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          keyBA,
          encrypted
        );

        expect(new TextDecoder().decode(decrypted)).toBe('ECDH symmetry test');
      });

      it('should derive non-extractable AES-256-GCM key', async () => {
        const alice = await generateKeyPair();
        const bob = await generateKeyPair();

        const key = await deriveSharedKey(alice.privateKey, bob.publicKeyRaw);

        expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
        expect(key.extractable).toBe(false);
        expect(key.usages).toContain('encrypt');
        expect(key.usages).toContain('decrypt');
      });

      it('should derive different keys for different peer pairs', async () => {
        const alice = await generateKeyPair();
        const bob = await generateKeyPair();
        const charlie = await generateKeyPair();

        const keyAB = await deriveSharedKey(alice.privateKey, bob.publicKeyRaw);
        const keyAC = await deriveSharedKey(alice.privateKey, charlie.publicKeyRaw);

        // Encrypt same data with both — should produce different ciphertext
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode('test');

        const enc1 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyAB, data));
        const enc2 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyAC, data));

        expect(enc1).not.toEqual(enc2);
      });
    });
  });

  describe('Encryption and Decryption', () => {
    let alice: P2PKeyPair;
    let bob: P2PKeyPair;

    beforeEach(async () => {
      alice = await generateKeyPair();
      bob = await generateKeyPair();
    });

    describe('encryptForRecipient / decryptFromSender', () => {
      it('should encrypt and decrypt text data', async () => {
        const data = new TextEncoder().encode('Hello, X25519 world!').buffer as ArrayBuffer;

        const encrypted = await encryptForRecipient(data, alice.privateKey, bob.publicKeyRaw);
        const decrypted = await decryptFromSender(encrypted, bob.privateKey, alice.publicKeyRaw);

        expect(new TextDecoder().decode(decrypted)).toBe('Hello, X25519 world!');
      });

      it('should return EncryptedPayload without encryptedKey', async () => {
        const data = new TextEncoder().encode('Test data').buffer as ArrayBuffer;

        const encrypted = await encryptForRecipient(data, alice.privateKey, bob.publicKeyRaw);

        expect(encrypted).toHaveProperty('encryptedData');
        expect(encrypted).toHaveProperty('iv');
        expect(encrypted).not.toHaveProperty('encryptedKey');
      });

      it('should return 12-byte IV for AES-GCM', async () => {
        const data = new TextEncoder().encode('Test').buffer as ArrayBuffer;

        const encrypted = await encryptForRecipient(data, alice.privateKey, bob.publicKeyRaw);

        expect(encrypted.iv).toBeInstanceOf(Uint8Array);
        expect(encrypted.iv.length).toBe(12);
      });

      it('should preserve binary data through encrypt/decrypt cycle', async () => {
        const originalData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);

        const encrypted = await encryptForRecipient(
          originalData.buffer as ArrayBuffer,
          alice.privateKey,
          bob.publicKeyRaw
        );
        const decrypted = await decryptFromSender(encrypted, bob.privateKey, alice.publicKeyRaw);

        expect(Array.from(new Uint8Array(decrypted))).toEqual(Array.from(originalData));
      });

      it('should fail with wrong key pair', async () => {
        const charlie = await generateKeyPair();
        const data = new TextEncoder().encode('secret').buffer as ArrayBuffer;

        const encrypted = await encryptForRecipient(data, alice.privateKey, bob.publicKeyRaw);

        // Charlie can't decrypt — different shared secret
        await expect(
          decryptFromSender(encrypted, charlie.privateKey, alice.publicKeyRaw)
        ).rejects.toThrow();
      });
    });
  });

  describe('Verification', () => {
    describe('verifyKeyFingerprint', () => {
      it('should return true for matching fingerprint', async () => {
        const keyPair = await generateKeyPair();
        const exported = await exportPublicKey(keyPair);

        const isValid = await verifyKeyFingerprint(keyPair.publicKeyRaw, exported.fingerprint);

        expect(isValid).toBe(true);
      });

      it('should return false for non-matching fingerprint', async () => {
        const keyPair = await generateKeyPair();

        const isValid = await verifyKeyFingerprint(keyPair.publicKeyRaw, 'wrong-fingerprint');

        expect(isValid).toBe(false);
      });
    });
  });
});
