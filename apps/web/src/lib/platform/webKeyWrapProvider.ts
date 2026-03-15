/**
 * Web Key Wrap Provider
 *
 * Browser implementation of AES Key Wrap (RFC 3394) using Web Crypto API.
 * Used for wrapping/unwrapping Master Keys with Key Encryption Keys (KEK).
 *
 * Benefits:
 * - Master Key generated once, never changes
 * - Password changes only require re-wrapping (no file re-encryption)
 * - RFC 3394 is NIST approved (SP 800-38F)
 * - Built-in integrity verification (prevents silent corruption)
 *
 * Architecture:
 * ```
 * Password → Argon2id → KEK (32 bytes)
 *                        ↓
 *      Master Key (32 bytes) → AES-KW → Wrapped Key (40 bytes)
 *                                         ↓
 *                               Stored in Database
 * ```
 */

import type { KeyWrapProvider, KeyWrapResult, KeyUnwrapResult } from '@stenvault/shared/platform/crypto';
import {
  KEY_WRAP_CONSTANTS,
  validateKeyWrapSizes,
  validateWrappedKeySize,
  toArrayBuffer,
} from '@stenvault/shared/platform/crypto';

// ============ Singleton ============

let keyWrapProviderInstance: WebKeyWrapProvider | null = null;

/**
 * Get the singleton Key Wrap provider instance
 */
export function getKeyWrapProvider(): KeyWrapProvider {
  if (!keyWrapProviderInstance) {
    keyWrapProviderInstance = new WebKeyWrapProvider();
  }
  return keyWrapProviderInstance;
}

/**
 * Create a new Key Wrap provider instance (for testing)
 */
export function createKeyWrapProvider(): KeyWrapProvider {
  return new WebKeyWrapProvider();
}

// ============ Implementation ============

export class WebKeyWrapProvider implements KeyWrapProvider {
  /**
   * Check if AES Key Wrap is available on this platform
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if crypto.subtle is available
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return false;
      }

      // Try to import a key with 'wrapKey' usage
      const testKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(32),
        { name: 'AES-KW' },
        false,
        ['wrapKey', 'unwrapKey']
      );

      return testKey !== null;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new master key
   * This should only be called once during initial setup
   */
  generateMasterKey(): Uint8Array {
    const masterKey = new Uint8Array(KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE);
    crypto.getRandomValues(masterKey);
    return masterKey;
  }

  /**
   * Wrap a master key with a KEK (Key Encryption Key)
   */
  async wrap(
    masterKey: Uint8Array,
    kek: Uint8Array,
    version: number = KEY_WRAP_CONSTANTS.CURRENT_VERSION
  ): Promise<KeyWrapResult> {
    validateKeyWrapSizes(masterKey, kek);

    // Import KEK as a CryptoKey
    const kekCryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(kek),
      { name: 'AES-KW' },
      false,
      ['wrapKey']
    );

    // Import master key as a CryptoKey (raw key to wrap)
    const masterCryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(masterKey),
      { name: 'AES-GCM' },
      true, // extractable: true is needed for wrapping
      ['encrypt', 'decrypt']
    );

    // Wrap the master key using AES-KW
    const wrappedBuffer = await crypto.subtle.wrapKey(
      'raw',
      masterCryptoKey,
      kekCryptoKey,
      { name: 'AES-KW' }
    );

    return {
      wrappedKey: new Uint8Array(wrappedBuffer),
      algorithm: 'aes-kw',
      version,
    };
  }

  /**
   * Unwrap a master key using a KEK
   */
  async unwrap(
    wrappedKey: Uint8Array,
    kek: Uint8Array,
    version: number
  ): Promise<KeyUnwrapResult> {
    validateWrappedKeySize(wrappedKey);

    if (kek.length !== KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE) {
      throw new Error(
        `KEK must be ${KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE} bytes, got ${kek.length}`
      );
    }

    // Import KEK as a CryptoKey
    const kekCryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(kek),
      { name: 'AES-KW' },
      false,
      ['unwrapKey']
    );

    try {
      // Unwrap the master key
      const masterCryptoKey = await crypto.subtle.unwrapKey(
        'raw',
        toArrayBuffer(wrappedKey),
        kekCryptoKey,
        { name: 'AES-KW' },
        { name: 'AES-GCM' },
        true, // extractable
        ['encrypt', 'decrypt']
      );

      // Export the unwrapped key as raw bytes
      const masterKeyBuffer = await crypto.subtle.exportKey('raw', masterCryptoKey);

      return {
        masterKey: new Uint8Array(masterKeyBuffer),
        version,
      };
    } catch (error) {
      // AES-KW unwrap fails with a generic error if KEK is wrong
      // This is the integrity check in action
      throw new Error(
        'Failed to unwrap master key: incorrect password or corrupted data'
      );
    }
  }

  /**
   * Re-wrap master key with new KEK
   * Used when changing password
   */
  async rewrap(
    wrappedKey: Uint8Array,
    oldKek: Uint8Array,
    newKek: Uint8Array,
    currentVersion: number
  ): Promise<KeyWrapResult> {
    // First unwrap with old KEK
    const { masterKey } = await this.unwrap(wrappedKey, oldKek, currentVersion);

    try {
      // Then wrap with new KEK, incrementing version
      const result = await this.wrap(masterKey, newKek, currentVersion + 1);
      return result;
    } finally {
      // Zero out the unwrapped master key from memory
      // (best effort - JS doesn't guarantee this)
      masterKey.fill(0);
    }
  }
}
