/**
 * Master Key Crypto Helpers
 *
 * Pure cryptographic functions for key derivation, wrapping, and HKDF.
 * No React hooks or state — used by useMasterKey hook and tests.
 *
 * SECURITY: Master Key is stored as non-extractable CryptoKeys (Fix V1a).
 * XSS cannot call exportKey() on cached keys — only USE them for operations.
 * Raw bytes exist momentarily during unwrap/setup, then are zeroed.
 */

import { getArgon2Provider } from '@/lib/platform/webArgon2Provider';
import { arrayBufferToBase64, base64ToArrayBuffer, toArrayBuffer } from '@/lib/platform';
import type { Argon2Params, RecoveryWrap } from '@stenvault/shared/platform/crypto';

// Re-export for consumers that imported from here
export { toArrayBuffer } from '@/lib/platform';

// ============ Master Key Bundle (Fix V1a) ============

/**
 * Non-extractable CryptoKey bundle for the Master Key.
 * Three "views" of the same 32-byte key, each locked to a specific algorithm.
 * XSS can call operations on these keys but cannot read the raw bytes.
 */
export interface MasterKeyBundle {
  /** HKDF key for deriving file/filename/foldername/fingerprint/thumbnail keys */
  hkdf: CryptoKey;
  /** AES-GCM key for encrypting/decrypting large secret keys (ML-KEM-768, Ed25519) */
  aesGcm: CryptoKey;
  /** AES-KW key for wrapping/unwrapping 32-byte secrets (X25519, ML-DSA-65 seed) */
  aesKw: CryptoKey;
}

/**
 * Create a non-extractable MasterKeyBundle from raw key bytes.
 * Zeros the input bytes after importing into WebCrypto subsystem.
 */
export async function createMasterKeyBundle(rawBytes: Uint8Array): Promise<MasterKeyBundle> {
  try {
    const buf = toArrayBuffer(rawBytes);
    const hkdf = await crypto.subtle.importKey(
      'raw', buf, 'HKDF', false, ['deriveKey', 'deriveBits']
    );
    const aesGcm = await crypto.subtle.importKey(
      'raw', buf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    const aesKw = await crypto.subtle.importKey(
      'raw', buf, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']
    );
    return { hkdf, aesGcm, aesKw };
  } finally {
    rawBytes.fill(0);
  }
}

// ============ Large Secret Key Encryption (ML-KEM-768, Ed25519) ============

/**
 * Encrypt arbitrary-length secret key bytes using AES-256-GCM with the Master Key.
 * Used for ML-KEM-768 (2400 bytes) and Ed25519 (64 bytes) secret keys — both
 * exceed the AES-KW 32-byte limit imposed by WebCrypto's importKey. ML-DSA-65
 * uses wrapSecretWithMK instead (its 32-byte FIPS 204 seed fits AES-KW).
 * Format: [12-byte IV][ciphertext + 16-byte GCM tag]
 *
 * Accepts either a CryptoKey (non-extractable, preferred) or raw Uint8Array (legacy).
 */
export async function encryptLargeSecretKey(
  secretKeyBytes: Uint8Array,
  masterKey: Uint8Array | CryptoKey
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const mkCryptoKey = masterKey instanceof CryptoKey
    ? masterKey
    : await crypto.subtle.importKey(
        'raw', toArrayBuffer(masterKey),
        { name: 'AES-GCM', length: 256 }, false, ['encrypt']
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
 *
 * Accepts either a CryptoKey (non-extractable, preferred) or raw Uint8Array (legacy).
 */
export async function decryptLargeSecretKey(
  encryptedData: Uint8Array,
  masterKey: Uint8Array | CryptoKey
): Promise<Uint8Array> {
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const mkCryptoKey = masterKey instanceof CryptoKey
    ? masterKey
    : await crypto.subtle.importKey(
        'raw', toArrayBuffer(masterKey),
        { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    mkCryptoKey,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(decrypted);
}

// ============ AES-KW Wrap/Unwrap with non-extractable MK ============

/**
 * Wrap a 32-byte secret (e.g. X25519 private key) using the MK's AES-KW CryptoKey.
 * Returns the 40-byte AES-KW wrapped output.
 */
export async function wrapSecretWithMK(
  secretBytes: Uint8Array,
  mkAesKw: CryptoKey
): Promise<Uint8Array> {
  // Import secret as extractable CryptoKey (it's being wrapped, not our key to protect)
  const secretCryptoKey = await crypto.subtle.importKey(
    'raw', toArrayBuffer(secretBytes),
    { name: 'AES-GCM', length: 256 }, true, ['encrypt']
  );
  const wrapped = await crypto.subtle.wrapKey('raw', secretCryptoKey, mkAesKw, 'AES-KW');
  return new Uint8Array(wrapped);
}

/**
 * Unwrap a 32-byte secret (e.g. X25519 private key) using the MK's AES-KW CryptoKey.
 * Returns the raw 32-byte secret.
 */
export async function unwrapSecretWithMK(
  wrappedBytes: Uint8Array,
  mkAesKw: CryptoKey
): Promise<Uint8Array> {
  const unwrapped = await crypto.subtle.unwrapKey(
    'raw', toArrayBuffer(wrappedBytes), mkAesKw, 'AES-KW',
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
  return rawBytes;
}

// ============ KEK Derivation ============

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
      false,
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
 * Unwrap master key using KEK. Returns a non-extractable MasterKeyBundle.
 *
 * Optionally wraps the raw MK bytes with a device KEK (for UES fast-path)
 * while they're momentarily available, before zeroing.
 */
export async function unwrapMasterKey(
  wrappedKeyB64: string,
  kek: CryptoKey,
  deviceKek?: CryptoKey
): Promise<{ bundle: MasterKeyBundle; deviceWrapped?: ArrayBuffer }> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyB64);

  // Unwrap as extractable temporarily to extract raw bytes
  const tempKey = await crypto.subtle.unwrapKey(
    'raw', wrappedKey, kek, 'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt', 'decrypt']
  );

  // Wrap for device fast-path while the extractable key is available
  let deviceWrapped: ArrayBuffer | undefined;
  if (deviceKek) {
    deviceWrapped = await crypto.subtle.wrapKey('raw', tempKey, deviceKek, 'AES-KW');
  }

  // Extract raw bytes, create non-extractable bundle, zero bytes
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', tempKey));
  const bundle = await createMasterKeyBundle(rawBytes);
  // rawBytes zeroed by createMasterKeyBundle

  return { bundle, deviceWrapped };
}

// ============ Recovery Code Dual-Wrap ============

/**
 * Wrap the Master Key with each recovery code's Argon2id-derived KEK.
 *
 * Returns an array of `RecoveryWrap` entries, one per recovery code,
 * with `codeIndex` aligned to the position of the code in the input array.
 * The caller is responsible for zeroing `mk` after this returns.
 *
 * Serial Argon2id derivations (10 × ~500ms ≈ 5s on a modern desktop).
 * Accept the latency — the single-thread serial approach keeps peak memory
 * at one Argon2id invocation's footprint (~47 MiB), safe on mobile.
 */
export async function generateRecoveryWraps(
  mk: Uint8Array,
  codes: string[],
  params: Argon2Params
): Promise<RecoveryWrap[]> {
  // Import MK once as extractable AES-GCM (so it can be AES-KW-wrapped repeatedly).
  // The raw bytes are zeroed by the caller — we only need the CryptoKey handle.
  const mkExtractable = await crypto.subtle.importKey(
    'raw', toArrayBuffer(mk),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return generateRecoveryWrapsFromKey(mkExtractable, codes, params);
}

/**
 * Variant of `generateRecoveryWraps` that skips the raw-bytes → CryptoKey import.
 *
 * For flows that already hold the MK as an extractable AES-GCM CryptoKey
 * (recovery-code reset, Shamir recovery) — lets the caller import once for
 * both the password re-wrap AND the 10 recovery-code wraps, so the raw-bytes
 * window can close ~50s earlier.
 *
 * `mkKey` must be created with `extractable: true` (AES-KW wrapKey spec
 * requirement) and usage `['encrypt','decrypt']`.
 */
export async function generateRecoveryWrapsFromKey(
  mkKey: CryptoKey,
  codes: string[],
  params: Argon2Params
): Promise<RecoveryWrap[]> {
  const wraps: RecoveryWrap[] = [];
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    const saltBytes = crypto.getRandomValues(new Uint8Array(32));
    const codeKek = await deriveArgon2Key(code, saltBytes, params);
    const wrappedBuf = await crypto.subtle.wrapKey('raw', mkKey, codeKek, 'AES-KW');
    wraps.push({
      codeIndex: i,
      salt: arrayBufferToBase64(toArrayBuffer(saltBytes)),
      argon2Params: {
        type: 'argon2id',
        memoryCost: params.memoryCost,
        timeCost: params.timeCost,
        parallelism: params.parallelism,
        hashLength: params.hashLength,
      },
      wrappedMK: arrayBufferToBase64(wrappedBuf),
    });
  }
  return wraps;
}

/**
 * Unwrap the Master Key from a single recovery-code wrap.
 *
 * Derives the per-code KEK via Argon2id(code, wrap.salt, wrap.argon2Params),
 * then AES-KW-unwraps `wrap.wrappedMK` and extracts the raw 32-byte MK.
 *
 * Throws if the recovery code is wrong (AES-KW unwrap validation fails — the
 * RFC 3394 integrity check rejects keys wrapped under a different KEK).
 *
 * The returned Uint8Array contains sensitive key material. Caller MUST zero
 * it after use (e.g. after re-wrapping with a new password-KEK).
 */
export async function unwrapMKFromRecoveryWrap(
  wrap: RecoveryWrap,
  code: string
): Promise<Uint8Array> {
  const saltBytes = new Uint8Array(base64ToArrayBuffer(wrap.salt));
  const codeKek = await deriveArgon2Key(code, saltBytes, wrap.argon2Params);

  // Unwrap as extractable AES-GCM (matches setup pattern) so we can export raw bytes.
  const tempKey = await crypto.subtle.unwrapKey(
    'raw',
    base64ToArrayBuffer(wrap.wrappedMK),
    codeKek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return new Uint8Array(await crypto.subtle.exportKey('raw', tempKey));
}

/**
 * Derive raw master key bytes from password (for operations that genuinely need raw bytes,
 * like Shamir secret splitting). Caller MUST zero the returned bytes after use.
 */
export async function deriveRawMasterKeyBytes(
  password: string,
  salt: Uint8Array,
  argon2Params: Argon2Params,
  masterKeyEncryptedB64: string
): Promise<Uint8Array> {
  const kek = await deriveArgon2Key(password, salt, argon2Params);
  const wrappedKey = base64ToArrayBuffer(masterKeyEncryptedB64);

  const tempKey = await crypto.subtle.unwrapKey(
    'raw', wrappedKey, kek, 'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt', 'decrypt']
  );

  return new Uint8Array(await crypto.subtle.exportKey('raw', tempKey));
}

// ============ HKDF File Key Derivation ============

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
 * Derive a unique file encryption key from the Master Key's HKDF CryptoKey.
 * Creates deterministic but unique keys for each file.
 *
 * Accepts the HKDF CryptoKey directly — no raw byte export needed.
 */
export async function deriveFileKeyFromMaster(
  hkdfKey: CryptoKey,
  fileId: string,
  timestamp: number
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode(`stenvault:file:${fileId}:${timestamp}`);
  const salt = encoder.encode('stenvault-file-key-v3');

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
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
  hkdfKey: CryptoKey,
  fileId: string,
  timestamp: number
): Promise<DerivedFileKeyWithBytes> {
  const encoder = new TextEncoder();
  const info = encoder.encode(`stenvault:file:${fileId}:${timestamp}`);
  const salt = encoder.encode('stenvault-file-key-v3');

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    256
  );

  const keyBytes = new Uint8Array(derivedBits);

  const key = await crypto.subtle.importKey(
    'raw', derivedBits,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  return { key, keyBytes, zeroBytes: () => keyBytes.fill(0) };
}

/**
 * Derive a key for filename encryption from the Master Key's HKDF CryptoKey.
 * Uses constant context so all filenames for a user use the same key.
 */
export async function deriveFilenameKeyFromMaster(
  hkdfKey: CryptoKey
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode('stenvault:filename:v1');
  const salt = encoder.encode('stenvault-filename-key-v1');

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a key for folder name encryption from the Master Key's HKDF CryptoKey.
 * Uses constant context so all folder names for a user use the same key.
 */
export async function deriveFoldernameKeyFromMaster(
  hkdfKey: CryptoKey
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode('stenvault:foldername:v1');
  const salt = encoder.encode('stenvault-foldername-key-v1');

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a key for content fingerprinting from the Master Key's HKDF CryptoKey.
 * Used for HMAC-SHA-256 duplicate detection (quantum-safe with 256-bit key).
 * Same key for all files per user (deterministic: same file = same fingerprint).
 */
export async function deriveFingerprintKeyFromMaster(
  hkdfKey: CryptoKey
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode('stenvault:fingerprint:v1');
  const salt = encoder.encode('stenvault-fingerprint-key-v1');

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}

/**
 * Derive a key for thumbnail encryption from the Master Key's HKDF CryptoKey.
 * Uses file-specific context so each thumbnail has a unique key.
 */
export async function deriveThumbnailKeyFromMaster(
  hkdfKey: CryptoKey,
  fileId: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode(`stenvault:thumbnail:v1:${fileId}`);
  const salt = encoder.encode('stenvault-thumbnail-key-v1');

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
