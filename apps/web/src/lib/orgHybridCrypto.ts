/**
 * Organization Hybrid Crypto Helpers
 *
 * Provides org-specific wrappers around the generic hybridFileCrypto module.
 * The core unique operation is unwrapping org hybrid secret keys using the OMK,
 * since org keys are wrapped with the OMK (not personal MK).
 *
 * Encryption/decryption of file content reuses the generic hybridFileCrypto
 * functions — only the key source differs.
 *
 * Key chain:
 *   OMK → unwrap org X25519 secret (AES-KW) + org ML-KEM secret (AES-GCM)
 *       → HybridSecretKey
 *       → decapsulate file key from CVEF header
 *       → decrypt file content
 *
 * @module orgHybridCrypto
 */

import { base64ToArrayBuffer, arrayBufferToBase64 } from '@/lib/platform';
import { getKeyWrapProvider } from '@/lib/platform/webKeyWrapProvider';
import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { decryptLargeSecretKey, encryptLargeSecretKey, toArrayBuffer } from '@/hooks/masterKeyCrypto';
import type { HybridSecretKey, HybridPublicKey } from '@stenvault/shared/platform/crypto';
import {
  encryptFileHybrid,
  encryptFileHybridAuto,
  decryptFileHybrid,
  type HybridEncryptionResult,
  type EncryptionProgress,
} from './hybridFile';

// Re-export generic functions for convenience
export { encryptFileHybrid, encryptFileHybridAuto, decryptFileHybrid };
export type { HybridEncryptionResult, EncryptionProgress };

// ============ Types ============

/** Server response shape from orgKeys.getOrgHybridSecretKey */
export interface OrgHybridSecretKeyData {
  organizationId: number;
  keyVersion: number;
  x25519SecretKeyEncrypted: string;
  mlkem768SecretKeyEncrypted: string;
  mlkem768SecretKeyIv: string;
}

/** Server response shape from orgKeys.getOrgHybridPublicKey */
export interface OrgHybridPublicKeyData {
  organizationId: number;
  keyVersion: number;
  algorithm: string;
  x25519PublicKey: string;
  mlkem768PublicKey: string;
  fingerprint: string | null;
}

export interface OrgEncryptionOptions {
  /** Org hybrid public key (from server, converted) */
  publicKey: HybridPublicKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
}

export interface OrgDecryptionOptions {
  /** Org hybrid secret key (unwrapped from OMK) */
  secretKey: HybridSecretKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
}

// ============ Org Hybrid Secret Key Unwrap ============

/**
 * Unwrap an organization's hybrid secret key using the OMK.
 *
 * The org's hybrid secret keys are stored encrypted on the server:
 * - X25519 secret (32 bytes): AES-KW wrapped with OMK bytes
 * - ML-KEM-768 secret (2400 bytes): AES-GCM encrypted with OMK bytes [IV || ciphertext]
 *
 * @param omk - The org's unlocked Organization Master Key
 * @param serverData - Encrypted secret key data from orgKeys.getOrgHybridSecretKey
 * @returns Unwrapped hybrid secret key ready for decapsulation
 */
export async function unwrapOrgHybridSecretKey(
  omk: CryptoKey,
  serverData: OrgHybridSecretKeyData
): Promise<HybridSecretKey> {
  // Export OMK as raw bytes for unwrapping
  const omkBytes = new Uint8Array(await crypto.subtle.exportKey('raw', omk));
  const keyWrap = getKeyWrapProvider();

  try {
    // Unwrap X25519 secret (32 bytes) via AES-KW
    const x25519Wrapped = new Uint8Array(base64ToArrayBuffer(serverData.x25519SecretKeyEncrypted));
    const x25519Result = await keyWrap.unwrap(x25519Wrapped, omkBytes, serverData.keyVersion);

    // Decrypt ML-KEM-768 secret (2400 bytes) via AES-GCM
    // Format: [12-byte IV][ciphertext + 16-byte GCM tag]
    const mlkemEncrypted = new Uint8Array(base64ToArrayBuffer(serverData.mlkem768SecretKeyEncrypted));
    const mlkemSecret = await decryptLargeSecretKey(mlkemEncrypted, omkBytes);

    return {
      classical: x25519Result.masterKey,
      postQuantum: mlkemSecret,
    };
  } finally {
    omkBytes.fill(0);
  }
}

// ============ Org Hybrid Key Pair Generation ============

/** Result of generating an org hybrid keypair with secrets wrapped by OMK */
export interface OrgHybridKeyPairBundle {
  /** Public keys (plaintext, stored on server) */
  x25519PublicKey: string;
  mlkem768PublicKey: string;
  /** Secret keys encrypted with OMK */
  x25519SecretKeyEncrypted: string;
  mlkem768SecretKeyEncrypted: string;
  mlkem768SecretKeyIv: string;
  /** SHA-256 fingerprint of public keys (first 16 bytes, hex) */
  fingerprint: string;
}

/**
 * Generate a hybrid keypair for an organization and wrap the secrets with the OMK.
 *
 * Called during:
 * - Vault setup (owner initializes encryption)
 * - OMK rotation (new keypair for new OMK version)
 *
 * @param omk - The org's Organization Master Key (plaintext CryptoKey)
 * @returns Keypair bundle ready to be sent to the server
 */
export async function generateOrgHybridKeyPair(omk: CryptoKey): Promise<OrgHybridKeyPairBundle> {
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // Generate X25519 + ML-KEM-768 keypair
  const { publicKey, secretKey } = await hybridKem.generateKeyPair();

  // Export OMK as raw bytes for wrapping
  const omkBytes = new Uint8Array(await crypto.subtle.exportKey('raw', omk));

  try {
    // Wrap X25519 secret (32 bytes) with AES-KW
    const x25519Wrapped = await keyWrap.wrap(secretKey.classical, omkBytes);

    // Encrypt ML-KEM-768 secret (2400 bytes) with AES-GCM
    // encryptLargeSecretKey produces [12-byte IV][ciphertext + 16-byte tag]
    const mlkemEncrypted = await encryptLargeSecretKey(secretKey.postQuantum, omkBytes);

    // Extract IV from the encrypted blob for the separate field
    const mlkemIv = mlkemEncrypted.slice(0, 12);

    // Generate fingerprint (SHA-256 of concatenated public keys, first 16 bytes, hex)
    const fpData = new Uint8Array(publicKey.classical.length + publicKey.postQuantum.length);
    fpData.set(publicKey.classical, 0);
    fpData.set(publicKey.postQuantum, publicKey.classical.length);
    const fpHash = await crypto.subtle.digest('SHA-256', fpData);
    const fingerprint = Array.from(new Uint8Array(fpHash).slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      x25519PublicKey: arrayBufferToBase64(toArrayBuffer(publicKey.classical)),
      mlkem768PublicKey: arrayBufferToBase64(toArrayBuffer(publicKey.postQuantum)),
      x25519SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(x25519Wrapped.wrappedKey)),
      mlkem768SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(mlkemEncrypted)),
      mlkem768SecretKeyIv: arrayBufferToBase64(toArrayBuffer(mlkemIv)),
      fingerprint,
    };
  } finally {
    // Zero sensitive material
    omkBytes.fill(0);
    secretKey.classical.fill(0);
    secretKey.postQuantum.fill(0);
  }
}

// ============ Conversion Helpers ============

/**
 * Convert server response to HybridPublicKey for use with generic hybridFileCrypto.
 */
export function toHybridPublicKey(serverData: OrgHybridPublicKeyData): HybridPublicKey {
  return {
    classical: new Uint8Array(base64ToArrayBuffer(serverData.x25519PublicKey)),
    postQuantum: new Uint8Array(base64ToArrayBuffer(serverData.mlkem768PublicKey)),
  };
}

// ============ Org-Specific Encrypt/Decrypt Wrappers ============

/**
 * Encrypt a file for an organization vault.
 *
 * Uses the org's hybrid public key. The encrypted file is in standard CVEF v1.2
 * format — identical to personal V4 encryption, but uses org keys.
 *
 * @param file - File to encrypt
 * @param options - Org encryption options (org public key + progress callback)
 * @returns CVEF v1.2 encrypted blob + metadata
 */
export async function encryptOrgFile(
  file: File,
  options: OrgEncryptionOptions
): Promise<HybridEncryptionResult> {
  return encryptFileHybridAuto(file, {
    publicKey: options.publicKey,
    onProgress: options.onProgress,
  });
}

/**
 * Decrypt an org vault file.
 *
 * Requires the org's hybrid secret key (already unwrapped from OMK).
 * The caller should use unwrapOrgHybridSecretKey() first.
 *
 * @param encryptedData - CVEF v1.2 encrypted file data
 * @param options - Org decryption options (org secret key + progress callback)
 * @returns Decrypted file content
 */
export async function decryptOrgFile(
  encryptedData: ArrayBuffer,
  options: OrgDecryptionOptions
): Promise<ArrayBuffer> {
  return decryptFileHybrid(encryptedData, {
    secretKey: options.secretKey,
    onProgress: options.onProgress,
  });
}

/**
 * Encrypt OMK bytes for hybrid distribution to a member.
 *
 * Used by admin when distributing OMK to a new org member:
 *   1. Admin unwraps own OMK
 *   2. Gets target member's hybrid public key
 *   3. Hybrid encapsulates OMK for target → this function
 *   4. Sends encrypted OMK + distribution metadata to server
 *
 * @param omkBytes - Raw 32-byte OMK
 * @param memberPublicKey - Target member's hybrid public key
 * @returns Encrypted OMK + distribution metadata for server storage
 */
export async function encryptOMKForMember(
  omkBytes: Uint8Array,
  memberPublicKey: HybridPublicKey
): Promise<{
  omkEncrypted: string;
  distributionIv: string;
  distributionX25519Public: string;
  distributionMlkemCiphertext: string;
}> {
  const hybridKem = getHybridKemProvider();

  // Hybrid encapsulate → shared secret + ciphertext
  const { ciphertext, sharedSecret } = await hybridKem.encapsulate(memberPublicKey);

  // AES-GCM encrypt the OMK bytes with the shared secret
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(sharedSecret),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  sharedSecret.fill(0);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    toArrayBuffer(omkBytes)
  );

  return {
    omkEncrypted: arrayBufferToBase64(encrypted),
    distributionIv: arrayBufferToBase64(toArrayBuffer(iv)),
    distributionX25519Public: arrayBufferToBase64(toArrayBuffer(ciphertext.classical)),
    distributionMlkemCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.postQuantum)),
  };
}
