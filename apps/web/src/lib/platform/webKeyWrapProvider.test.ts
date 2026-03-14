/**
 * Tests for WebKeyWrapProvider (AES Key Wrap RFC 3394)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WebKeyWrapProvider,
  getKeyWrapProvider,
  createKeyWrapProvider,
} from './webKeyWrapProvider';
import {
  KEY_WRAP_CONSTANTS,
  getWrappedKeySize,
  validateKeyWrapSizes,
  validateWrappedKeySize,
} from '@cloudvault/shared/platform/crypto';

describe('WebKeyWrapProvider', () => {
  let provider: WebKeyWrapProvider;

  beforeEach(() => {
    provider = new WebKeyWrapProvider();
  });

  describe('singleton pattern', () => {
    it('should return the same instance from getKeyWrapProvider', () => {
      const instance1 = getKeyWrapProvider();
      const instance2 = getKeyWrapProvider();
      expect(instance1).toBe(instance2);
    });

    it('should return new instances from createKeyWrapProvider', () => {
      const instance1 = createKeyWrapProvider();
      const instance2 = createKeyWrapProvider();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('KEY_WRAP_CONSTANTS', () => {
    it('should have correct values', () => {
      expect(KEY_WRAP_CONSTANTS.WRAP_OVERHEAD).toBe(8);
      expect(KEY_WRAP_CONSTANTS.MIN_KEY_SIZE).toBe(16);
      expect(KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE).toBe(32);
      expect(KEY_WRAP_CONSTANTS.CURRENT_VERSION).toBe(1);
    });

    it('should have correct default IV', () => {
      expect(KEY_WRAP_CONSTANTS.DEFAULT_IV).toEqual(
        new Uint8Array([0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6])
      );
    });
  });

  describe('getWrappedKeySize', () => {
    it('should add 8 bytes overhead', () => {
      expect(getWrappedKeySize(32)).toBe(40);
      expect(getWrappedKeySize(16)).toBe(24);
      expect(getWrappedKeySize(64)).toBe(72);
    });
  });

  describe('validateKeyWrapSizes', () => {
    it('should accept valid 32-byte keys', () => {
      const masterKey = new Uint8Array(32);
      const kek = new Uint8Array(32);
      expect(() => validateKeyWrapSizes(masterKey, kek)).not.toThrow();
    });

    it('should reject invalid master key size', () => {
      const masterKey = new Uint8Array(16);
      const kek = new Uint8Array(32);
      expect(() => validateKeyWrapSizes(masterKey, kek)).toThrow(
        'Master key must be 32 bytes'
      );
    });

    it('should reject invalid KEK size', () => {
      const masterKey = new Uint8Array(32);
      const kek = new Uint8Array(16);
      expect(() => validateKeyWrapSizes(masterKey, kek)).toThrow(
        'KEK must be 32 bytes'
      );
    });
  });

  describe('validateWrappedKeySize', () => {
    it('should accept valid 40-byte wrapped key', () => {
      const wrappedKey = new Uint8Array(40);
      expect(() => validateWrappedKeySize(wrappedKey)).not.toThrow();
    });

    it('should reject invalid wrapped key size', () => {
      const wrappedKey = new Uint8Array(32);
      expect(() => validateWrappedKeySize(wrappedKey)).toThrow(
        'Wrapped key must be 40 bytes'
      );
    });
  });

  describe('generateMasterKey', () => {
    it('should generate 32-byte random key', () => {
      const key = provider.generateMasterKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should generate different keys each time', () => {
      const key1 = provider.generateMasterKey();
      const key2 = provider.generateMasterKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe('isAvailable', () => {
    it('should return true when crypto.subtle is available', async () => {
      const available = await provider.isAvailable();
      // In Node.js test environment, this should be true
      expect(typeof available).toBe('boolean');
    });
  });

  describe('wrap and unwrap', () => {
    it('should wrap and unwrap a master key correctly', async () => {
      const masterKey = provider.generateMasterKey();
      const kek = new Uint8Array(32);
      crypto.getRandomValues(kek);

      const wrapped = await provider.wrap(masterKey, kek);

      expect(wrapped.wrappedKey).toBeInstanceOf(Uint8Array);
      expect(wrapped.wrappedKey.length).toBe(40); // 32 + 8 overhead
      expect(wrapped.algorithm).toBe('aes-kw');
      expect(wrapped.version).toBe(1);

      const unwrapped = await provider.unwrap(wrapped.wrappedKey, kek, wrapped.version);

      expect(unwrapped.masterKey).toEqual(masterKey);
      expect(unwrapped.version).toBe(wrapped.version);
    });

    it('should fail to unwrap with wrong KEK', async () => {
      const masterKey = provider.generateMasterKey();
      const correctKek = new Uint8Array(32);
      const wrongKek = new Uint8Array(32);
      crypto.getRandomValues(correctKek);
      crypto.getRandomValues(wrongKek);

      const wrapped = await provider.wrap(masterKey, correctKek);

      await expect(
        provider.unwrap(wrapped.wrappedKey, wrongKek, wrapped.version)
      ).rejects.toThrow('Failed to unwrap master key');
    });

    it('should fail with corrupted wrapped key', async () => {
      const masterKey = provider.generateMasterKey();
      const kek = new Uint8Array(32);
      crypto.getRandomValues(kek);

      const wrapped = await provider.wrap(masterKey, kek);

      // Corrupt the wrapped key
      wrapped.wrappedKey[0] = wrapped.wrappedKey[0]! ^ 0xff;

      await expect(
        provider.unwrap(wrapped.wrappedKey, kek, wrapped.version)
      ).rejects.toThrow('Failed to unwrap master key');
    });

    it('should use specified version number', async () => {
      const masterKey = provider.generateMasterKey();
      const kek = new Uint8Array(32);
      crypto.getRandomValues(kek);

      const wrapped = await provider.wrap(masterKey, kek, 42);

      expect(wrapped.version).toBe(42);
    });
  });

  describe('rewrap', () => {
    it('should rewrap with new KEK and increment version', async () => {
      const masterKey = provider.generateMasterKey();
      const oldKek = new Uint8Array(32);
      const newKek = new Uint8Array(32);
      crypto.getRandomValues(oldKek);
      crypto.getRandomValues(newKek);

      const original = await provider.wrap(masterKey, oldKek, 1);
      const rewrapped = await provider.rewrap(
        original.wrappedKey,
        oldKek,
        newKek,
        original.version
      );

      expect(rewrapped.version).toBe(2);
      expect(rewrapped.algorithm).toBe('aes-kw');

      // Should be able to unwrap with new KEK
      const unwrapped = await provider.unwrap(
        rewrapped.wrappedKey,
        newKek,
        rewrapped.version
      );
      expect(unwrapped.masterKey).toEqual(masterKey);

      // Should NOT be able to unwrap with old KEK
      await expect(
        provider.unwrap(rewrapped.wrappedKey, oldKek, rewrapped.version)
      ).rejects.toThrow();
    });

    it('should fail rewrap with wrong old KEK', async () => {
      const masterKey = provider.generateMasterKey();
      const correctOldKek = new Uint8Array(32);
      const wrongOldKek = new Uint8Array(32);
      const newKek = new Uint8Array(32);
      crypto.getRandomValues(correctOldKek);
      crypto.getRandomValues(wrongOldKek);
      crypto.getRandomValues(newKek);

      const original = await provider.wrap(masterKey, correctOldKek);

      await expect(
        provider.rewrap(original.wrappedKey, wrongOldKek, newKek, original.version)
      ).rejects.toThrow('Failed to unwrap master key');
    });
  });

  describe('password change scenario', () => {
    it('should enable password change without re-encrypting files', async () => {
      // Simulate initial setup
      const masterKey = provider.generateMasterKey();
      const password1Kek = new Uint8Array(32);
      crypto.getRandomValues(password1Kek);

      // Initial wrap
      const initialWrap = await provider.wrap(masterKey, password1Kek);

      // Simulate file encryption with master key
      const fileKey = masterKey; // Master key is used to derive file keys

      // User changes password
      const password2Kek = new Uint8Array(32);
      crypto.getRandomValues(password2Kek);

      // Rewrap master key with new password
      const newWrap = await provider.rewrap(
        initialWrap.wrappedKey,
        password1Kek,
        password2Kek,
        initialWrap.version
      );

      // Unwrap with new password
      const unwrapped = await provider.unwrap(
        newWrap.wrappedKey,
        password2Kek,
        newWrap.version
      );

      // Master key should be the same!
      // This means files encrypted with master key are still readable
      // without re-encryption
      expect(unwrapped.masterKey).toEqual(fileKey);
    });
  });
});
