/**
 * AES Key Wrap (RFC 3394) Interface
 *
 * Platform-agnostic abstraction for wrapping/unwrapping master keys.
 * This enables password changes without re-encrypting files.
 *
 * Architecture:
 * ```
 * Password → Argon2id → KEK (Key Encryption Key)
 *                         ↓
 *         Master Key ← AES-KW unwrap ← Wrapped Master Key (stored)
 *                         ↓
 *           File Encryption (AES-256-GCM)
 * ```
 *
 * Benefits:
 * - Master Key never changes (generated once)
 * - Password changes only re-wrap the Master Key
 * - No need to re-encrypt all files on password change
 * - Bitwarden-style key management
 *
 * References:
 * - RFC 3394: https://datatracker.ietf.org/doc/html/rfc3394
 * - NIST SP 800-38F: https://csrc.nist.gov/publications/detail/sp/800-38f/final
 */

// ============ Constants ============

export const KEY_WRAP_CONSTANTS = {
  /** AES Key Wrap output overhead (8 bytes integrity check) */
  WRAP_OVERHEAD: 8,
  /** Minimum key size for wrapping (128 bits) */
  MIN_KEY_SIZE: 16,
  /** Master key size (256 bits) */
  MASTER_KEY_SIZE: 32,
  /** Current master key version */
  CURRENT_VERSION: 1,
  /** Default Initial Value (IV) for AES-KW per RFC 3394 */
  DEFAULT_IV: new Uint8Array([0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6]),
} as const;

// ============ Types ============

/**
 * Key wrap algorithm identifier
 */
export type KeyWrapAlgorithm = 'aes-kw' | 'aes-kwp' | 'none';

/**
 * Result of wrapping a master key
 */
export interface KeyWrapResult {
  /** Wrapped key (40 bytes for 32-byte key) */
  wrappedKey: Uint8Array;
  /** Algorithm used */
  algorithm: KeyWrapAlgorithm;
  /** Master key version (incremented on rotation) */
  version: number;
}

/**
 * Result of unwrapping a master key
 */
export interface KeyUnwrapResult {
  /** Unwrapped master key (32 bytes) */
  masterKey: Uint8Array;
  /** Version that was unwrapped */
  version: number;
}

/**
 * Master key metadata stored in database
 * This is stored alongside the wrapped key
 */
export interface MasterKeyMetadata {
  /** Wrapped master key (Base64 encoded) */
  wrappedKey: string;
  /** Key wrap algorithm used */
  algorithm: KeyWrapAlgorithm;
  /** Master key version */
  version: number;
  /** When this version was created */
  createdAt: string;
  /** KDF algorithm used to derive KEK */
  kdfAlgorithm: 'pbkdf2' | 'argon2id';
  /** KDF parameters (stored for re-derivation) */
  kdfParams: {
    // PBKDF2
    iterations?: number;
    // Argon2id
    memoryCost?: number;
    timeCost?: number;
    parallelism?: number;
  };
  /** Salt for KDF (Base64 encoded) */
  salt: string;
}

/**
 * Key Wrap Provider Interface
 *
 * Platform-specific implementations for AES Key Wrap (RFC 3394).
 * Web uses SubtleCrypto, Mobile uses native modules.
 */
export interface KeyWrapProvider {
  /**
   * Check if AES Key Wrap is available on this platform
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generate a new master key
   * This should only be called once during initial setup
   *
   * @returns New random 32-byte master key
   */
  generateMasterKey(): Uint8Array;

  /**
   * Wrap a master key with a KEK (Key Encryption Key)
   *
   * @param masterKey - The 32-byte master key to wrap
   * @param kek - The 32-byte Key Encryption Key (derived from password)
   * @param version - Version number for this wrap (default: 1)
   * @returns Wrapped key and metadata
   *
   * @throws Error if master key or KEK is invalid size
   */
  wrap(
    masterKey: Uint8Array,
    kek: Uint8Array,
    version?: number
  ): Promise<KeyWrapResult>;

  /**
   * Unwrap a master key using a KEK
   *
   * @param wrappedKey - The wrapped key (40 bytes for 32-byte key)
   * @param kek - The Key Encryption Key (derived from password)
   * @param version - Expected version number
   * @returns Unwrapped master key
   *
   * @throws Error if KEK is wrong (integrity check fails)
   */
  unwrap(
    wrappedKey: Uint8Array,
    kek: Uint8Array,
    version: number
  ): Promise<KeyUnwrapResult>;

  /**
   * Re-wrap master key with new KEK
   * Used when changing password
   *
   * @param wrappedKey - Currently wrapped key
   * @param oldKek - Current KEK (from old password)
   * @param newKek - New KEK (from new password)
   * @param currentVersion - Current version number
   * @returns Newly wrapped key with same master key, incremented version
   */
  rewrap(
    wrappedKey: Uint8Array,
    oldKek: Uint8Array,
    newKek: Uint8Array,
    currentVersion: number
  ): Promise<KeyWrapResult>;
}

/**
 * Factory function type for creating Key Wrap providers
 */
export type KeyWrapProviderFactory = () => KeyWrapProvider;

// ============ Utility Functions ============

/**
 * Calculate wrapped key size
 *
 * @param keySize - Original key size in bytes
 * @returns Wrapped key size (always keySize + 8)
 */
export function getWrappedKeySize(keySize: number): number {
  return keySize + KEY_WRAP_CONSTANTS.WRAP_OVERHEAD;
}

/**
 * Validate key sizes for wrapping
 *
 * @param masterKey - Key to wrap
 * @param kek - Key encryption key
 * @throws Error if sizes are invalid
 */
export function validateKeyWrapSizes(masterKey: Uint8Array, kek: Uint8Array): void {
  if (masterKey.length !== KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE) {
    throw new Error(
      `Master key must be ${KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE} bytes, got ${masterKey.length}`
    );
  }

  if (kek.length !== KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE) {
    throw new Error(
      `KEK must be ${KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE} bytes, got ${kek.length}`
    );
  }
}

/**
 * Validate wrapped key size
 *
 * @param wrappedKey - Wrapped key to validate
 * @throws Error if size is invalid
 */
export function validateWrappedKeySize(wrappedKey: Uint8Array): void {
  const expectedSize = getWrappedKeySize(KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE);
  if (wrappedKey.length !== expectedSize) {
    throw new Error(
      `Wrapped key must be ${expectedSize} bytes, got ${wrappedKey.length}`
    );
  }
}

/**
 * Serialize MasterKeyMetadata for database storage
 */
export function serializeMasterKeyMetadata(metadata: MasterKeyMetadata): string {
  return JSON.stringify(metadata);
}

/**
 * Deserialize MasterKeyMetadata from database
 */
export function deserializeMasterKeyMetadata(json: string): MasterKeyMetadata {
  return JSON.parse(json) as MasterKeyMetadata;
}

/**
 * Create MasterKeyMetadata for new key setup
 */
export function createMasterKeyMetadata(
  wrappedKey: Uint8Array,
  salt: Uint8Array,
  kdfAlgorithm: 'pbkdf2' | 'argon2id',
  kdfParams: MasterKeyMetadata['kdfParams']
): MasterKeyMetadata {
  return {
    wrappedKey: uint8ArrayToBase64(wrappedKey),
    algorithm: 'aes-kw',
    version: KEY_WRAP_CONSTANTS.CURRENT_VERSION,
    createdAt: new Date().toISOString(),
    kdfAlgorithm,
    kdfParams,
    salt: uint8ArrayToBase64(salt),
  };
}

// ============ Base64 Helpers ============

/**
 * Convert Uint8Array to Base64 string
 * Works in both browser and Node.js
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    // Browser
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  } else {
    // Node.js
    return Buffer.from(bytes).toString('base64');
  }
}

// base64ToUint8Array is now exported from ./utils
