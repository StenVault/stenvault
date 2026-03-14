/**
 * Master Key Crypto Helpers
 *
 * Pure cryptographic functions for key derivation, wrapping, and HKDF.
 * No React hooks or state — used by useMasterKey hook and tests.
 */

import { getArgon2Provider } from '@/lib/platform/webArgon2Provider';
import { base64ToArrayBuffer, toArrayBuffer } from '@/lib/platform';
import type { Argon2Params } from '@cloudvault/shared/platform/crypto';

// Re-export for consumers that imported from here
export { toArrayBuffer } from '@/lib/platform';


/**
 * Encrypt arbitrary-length secret key bytes using AES-256-GCM with the Master Key.
 * Used for ML-KEM-768 secret keys (2400 bytes) which are too large for AES-KW (32-byte limit).
 * Format: [12-byte IV][ciphertext + 16-byte GCM tag]
 */
export async function encryptLargeSecretKey(
  secretKeyBytes: Uint8Array,
  masterKeyBytes: Uint8Array
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const mkCryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(masterKeyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    mkCryptoKey,
    toArrayBuffer(secretKeyBytes)
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
}

/**
 * Decrypt arbitrary-length secret key bytes using AES-256-GCM with the Master Key.
 * Inverse of encryptLargeSecretKey.
 */
export async function decryptLargeSecretKey(
  encryptedData: Uint8Array,
  masterKeyBytes: Uint8Array
): Promise<Uint8Array> {
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const mkCryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(masterKeyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    mkCryptoKey,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(decrypted);
}


/**
 * Derive KEK using Argon2id
 */
export async function deriveArgon2Key(
  password: string,
  salt: Uint8Array,
  params: Argon2Params
): Promise<CryptoKey> {
  const argon2Provider = getArgon2Provider();
  const result = await argon2Provider.deriveKey(password, salt, params);

  try {
    return await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(result.key),
      { name: 'AES-KW', length: 256 },
      true,
      ['wrapKey', 'unwrapKey']
    );
  } finally {
    // Zero raw KEK bytes from Argon2 output — CryptoKey now holds the material
    if (result.key instanceof Uint8Array) {
      result.key.fill(0);
    }
  }
}

/**
 * Unwrap master key using KEK
 */
export async function unwrapMasterKey(
  wrappedKeyB64: string,
  kek: CryptoKey
): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyB64);

  return crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['wrapKey', 'unwrapKey']
  );
}


/**
 * Result of deriving file key with raw bytes for Web Worker
 */
export interface DerivedFileKeyWithBytes {
  /** CryptoKey for local use */
  key: CryptoKey;
  /** Raw key bytes for Web Worker transfer - MUST be zeroed after use! */
  keyBytes: Uint8Array;
  /** Function to zero the key bytes after use */
  zeroBytes: () => void;
}

/**
 * Derive a unique file encryption key from the Master Key using HKDF.
 * Creates deterministic but unique keys for each file.
 */
export async function deriveFileKeyFromMaster(
  masterKey: CryptoKey,
  fileId: string,
  timestamp: number
): Promise<CryptoKey> {
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  new Uint8Array(masterKeyBytes).fill(0);

  const encoder = new TextEncoder();
  const info = encoder.encode(`cloudvault:file:${fileId}:${timestamp}`);
  const salt = encoder.encode('cloudvault-file-key-v3');

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive file key AND raw bytes for Web Worker transfer.
 * SECURITY: Caller MUST call zeroBytes() after sending to Worker!
 */
export async function deriveFileKeyWithBytesFromMaster(
  masterKey: CryptoKey,
  fileId: string,
  timestamp: number
): Promise<DerivedFileKeyWithBytes> {
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey', 'deriveBits']
  );

  new Uint8Array(masterKeyBytes).fill(0);

  const encoder = new TextEncoder();
  const info = encoder.encode(`cloudvault:file:${fileId}:${timestamp}`);
  const salt = encoder.encode('cloudvault-file-key-v3');

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    256
  );

  const keyBytes = new Uint8Array(derivedBits);

  const key = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const zeroBytes = () => {
    keyBytes.fill(0);
  };

  return { key, keyBytes, zeroBytes };
}

/**
 * Derive a key for filename encryption from the Master Key using HKDF.
 * Uses constant context so all filenames for a user use the same key.
 */
export async function deriveFilenameKeyFromMaster(
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  new Uint8Array(masterKeyBytes).fill(0);

  const encoder = new TextEncoder();
  const info = encoder.encode('cloudvault:filename:v1');
  const salt = encoder.encode('cloudvault-filename-key-v1');

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a key for folder name encryption from the Master Key using HKDF.
 * Uses constant context so all folder names for a user use the same key.
 */
export async function deriveFoldernameKeyFromMaster(
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  new Uint8Array(masterKeyBytes).fill(0);

  const encoder = new TextEncoder();
  const info = encoder.encode('cloudvault:foldername:v1');
  const salt = encoder.encode('cloudvault-foldername-key-v1');

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a key for content fingerprinting from the Master Key using HKDF.
 * Used for HMAC-SHA-256 duplicate detection (quantum-safe with 256-bit key).
 * Same key for all files per user (deterministic: same file = same fingerprint).
 */
export async function deriveFingerprintKeyFromMaster(
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  new Uint8Array(masterKeyBytes).fill(0);

  const encoder = new TextEncoder();
  const info = encoder.encode('cloudvault:fingerprint:v1');
  const salt = encoder.encode('cloudvault-fingerprint-key-v1');

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}

/**
 * Derive a key for thumbnail encryption from the Master Key using HKDF.
 * Uses file-specific context so each thumbnail has a unique key.
 */
export async function deriveThumbnailKeyFromMaster(
  masterKey: CryptoKey,
  fileId: string
): Promise<CryptoKey> {
  const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  new Uint8Array(masterKeyBytes).fill(0);

  const encoder = new TextEncoder();
  const info = encoder.encode(`cloudvault:thumbnail:v1:${fileId}`);
  const salt = encoder.encode('cloudvault-thumbnail-key-v1');

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
