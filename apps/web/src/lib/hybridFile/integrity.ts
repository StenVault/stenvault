import {
  toArrayBuffer,
  constantTimeEqual,
} from '@stenvault/shared/platform/crypto';
import { deriveChunkIV } from '@stenvault/aead-stream/iv';
import { VaultError } from '@stenvault/shared/errors';
import { toCleanUint8Array, sha256 } from './helpers';

/**
 * Derive an HMAC-SHA-256 key from the raw file key for chunk integrity manifest.
 * Must be called before the file key is zeroed.
 */
export async function deriveManifestHmacKey(fileKey: Uint8Array): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', toArrayBuffer(fileKey), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('stenvault-integrity-manifest-v1'),
      info: new TextEncoder().encode('stenvault:integrity-manifest:v1'),
    },
    hkdfKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Verify chunk integrity manifest block.
 *
 * Decrypts the manifest ciphertext with AES-GCM using the chunk IV at index `chunkCount`,
 * extracts the stored HMAC-SHA-256 + chunk count, and verifies against the accumulated
 * SHA-256 hashes of each encrypted chunk's ciphertext.
 *
 * @throws VaultError('INTEGRITY_FAILED' | 'FILE_CORRUPT') on any mismatch
 */
export async function verifyChunkManifest(
  manifestCiphertext: Uint8Array,
  fileKey: CryptoKey,
  hmacKey: CryptoKey,
  baseIv: Uint8Array,
  chunkCount: number,
  chunkHashes: ArrayBuffer[],
  headerBytes?: Uint8Array,
): Promise<void> {
  const manifestIv = deriveChunkIV(baseIv, chunkCount);
  const aadParam = headerBytes ? { additionalData: toArrayBuffer(headerBytes) } : {};
  let manifestPlaintext: ArrayBuffer;
  try {
    manifestPlaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toCleanUint8Array(manifestIv), ...aadParam },
      fileKey,
      toArrayBuffer(manifestCiphertext),
    );
  } catch {
    throw new VaultError('FILE_CORRUPT', { layer: 'manifest_decrypt' });
  }

  const manifestBytes = new Uint8Array(manifestPlaintext);

  // v1.4 manifest: HMAC(32B) + count(4B) + SHA-256(headerBytes)(32B) = 68 bytes
  // v1.2/v1.3 manifest: HMAC(32B) + count(4B) = 36 bytes
  const expectedSize = headerBytes ? 68 : 36;
  if (manifestBytes.byteLength !== expectedSize) {
    throw new VaultError('INTEGRITY_FAILED', {
      layer: 'manifest_size',
      expected: expectedSize,
      actual: manifestBytes.byteLength,
    });
  }

  // Extract stored HMAC (32 bytes) + chunk count (4 bytes big-endian)
  const storedHMAC = manifestBytes.slice(0, 32);
  const storedCount = new DataView(manifestPlaintext, 32, 4).getUint32(0, false);

  if (storedCount !== chunkCount) {
    throw new VaultError('INTEGRITY_FAILED', {
      layer: 'chunk_count',
      expected: chunkCount,
      stored: storedCount,
    });
  }

  // Rebuild manifestData: chunkCount(4B BE) || hash_0 || ... || hash_{N-1} [|| SHA-256(headerBytes)]
  const hashesSize = chunkHashes.length * 32;
  const headerHashSize = headerBytes ? 32 : 0;
  const manifestData = new Uint8Array(4 + hashesSize + headerHashSize);
  new DataView(manifestData.buffer).setUint32(0, chunkCount, false);
  let offset = 4;
  for (const hash of chunkHashes) {
    manifestData.set(new Uint8Array(hash), offset);
    offset += 32;
  }

  // v1.4: include SHA-256(headerBytes) in manifest HMAC input
  if (headerBytes) {
    const headerHash = await sha256(headerBytes);
    manifestData.set(headerHash, offset);

    // Verify the stored header hash matches (constant-time comparison)
    const storedHeaderHash = new Uint8Array(manifestBytes.slice(36, 68));
    if (!constantTimeEqual(storedHeaderHash, headerHash)) {
      throw new VaultError('INTEGRITY_FAILED', { layer: 'header_hash' });
    }
  }

  const valid = await crypto.subtle.verify(
    'HMAC', hmacKey, toArrayBuffer(storedHMAC), toArrayBuffer(manifestData),
  );
  if (!valid) {
    throw new VaultError('INTEGRITY_FAILED', { layer: 'manifest_hmac' });
  }
}
