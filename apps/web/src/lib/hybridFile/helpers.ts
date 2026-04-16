import { toArrayBuffer, CRYPTO_CONSTANTS } from '@stenvault/shared/platform/crypto';

export const FILE_KEY_SIZE = CRYPTO_CONSTANTS.AES_KEY_LENGTH_BYTES;
export const IV_SIZE = CRYPTO_CONSTANTS.GCM_IV_LENGTH;
export const CHUNK_SIZE = CRYPTO_CONSTANTS.STREAMING_CHUNK_SIZE;

/**
 * Convert any typed array to a fresh Uint8Array with clean ArrayBuffer.
 * Returns a Uint8Array that TypeScript knows is backed by ArrayBuffer (not SharedArrayBuffer).
 */
export function toCleanUint8Array(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(data.length);
  const result = new Uint8Array(buffer);
  result.set(data);
  return result;
}

/**
 * Generate a random file encryption key
 */
export function generateFileKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(FILE_KEY_SIZE));
}

/**
 * Generate a random IV for AES-GCM
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_SIZE));
}

/**
 * Import raw key bytes as CryptoKey for AES-GCM
 */
export async function importFileKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Compute SHA-256 hash of data
 */
export async function sha256(data: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const buf = data instanceof ArrayBuffer ? data : toArrayBuffer(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(hashBuffer);
}
