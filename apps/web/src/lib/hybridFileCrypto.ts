/**
 * Hybrid Post-Quantum File Encryption
 *
 * Provides hybrid encryption for files using X25519 + ML-KEM-768.
 * This module wraps the existing file encryption with hybrid KEM key wrapping.
 *
 * Architecture:
 * ```
 * File Key (FK) - 32 bytes (random per file)
 *         ↓
 * ┌───────┴───────┐
 * │               │
 * X25519-ECDH   ML-KEM-768
 * │               │
 * └───────┬───────┘
 *         ↓
 *     HKDF-SHA256 → Hybrid KEK
 *         ↓
 *     AES-KW Wrap → Wrapped File Key
 *         ↓
 *     CVEF v1.2 Metadata
 * ```
 *
 * The file content is still encrypted with AES-256-GCM, but the file key
 * is protected with hybrid post-quantum encryption instead of password-derived keys.
 *
 * @module hybridFileCrypto
 */

import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getKeyWrapProvider } from '@/lib/platform/webKeyWrapProvider';
import { STREAMING } from '@/lib/constants';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  toArrayBuffer,
  deriveChunkIV,
  CRYPTO_CONSTANTS,
} from '@stenvault/shared/platform/crypto';
import type {
  HybridPublicKey,
  HybridSecretKey,
  HybridCiphertext,
  HybridSignaturePublicKey,
} from '@stenvault/shared/platform/crypto';
import {
  createCVEFMetadataV1_2,
  createCVEFHeader,
  parseCVEFHeader,
  isCVEFMetadataV1_2,
  isCVEFMetadataV1_3,
  type CVEFMetadataV1_2,
  type CVEFMetadata,
  type CVEFPqcParamsV1_2,
} from '@stenvault/shared/platform/crypto';
import { parseCVEFHeaderFromStream } from './streamingDecrypt';
import { FileCorruptedError } from './errors/cryptoErrors';

// ============ Constants (from shared CRYPTO_CONSTANTS) ============

const FILE_KEY_SIZE = CRYPTO_CONSTANTS.AES_KEY_LENGTH_BYTES;
const IV_SIZE = CRYPTO_CONSTANTS.GCM_IV_LENGTH;
const CHUNK_SIZE = CRYPTO_CONSTANTS.STREAMING_CHUNK_SIZE;

// ============ Types ============

export interface HybridEncryptionOptions {
  /** User's hybrid public key for encryption */
  publicKey: HybridPublicKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
}

export interface HybridDecryptionOptions {
  /** User's hybrid secret key for decryption */
  secretKey: HybridSecretKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
  /** Signer's public key — if provided and file is CVEF v1.3, signature is verified before decryption */
  signerPublicKey?: HybridSignaturePublicKey;
}

export interface EncryptionProgress {
  bytesProcessed: number;
  totalBytes: number;
  percentage: number;
}

export interface HybridEncryptionResult {
  /** Encrypted file blob (CVEF header + ciphertext) */
  blob: Blob;
  /** CVEF v1.2 metadata */
  metadata: CVEFMetadataV1_2;
  /** Original file size */
  originalSize: number;
}

// ============ Helper Functions ============

/**
 * Convert any typed array to a fresh Uint8Array with clean ArrayBuffer.
 * Returns a Uint8Array that TypeScript knows is backed by ArrayBuffer (not SharedArrayBuffer).
 */
function toCleanUint8Array(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(data.length);
  const result = new Uint8Array(buffer);
  result.set(data);
  return result;
}

/**
 * Generate a random file encryption key
 */
function generateFileKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(FILE_KEY_SIZE));
}

/**
 * Generate a random IV for AES-GCM
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_SIZE));
}

/**
 * Import raw key bytes as CryptoKey for AES-GCM
 */
async function importFileKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Re-export deriveChunkIV from shared package (imported above from @/lib/platform)
export { deriveChunkIV };

// ============ Integrity Manifest ============

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
 * @throws Error('File integrity verification failed') on any mismatch
 */
export async function verifyChunkManifest(
  manifestCiphertext: Uint8Array,
  fileKey: CryptoKey,
  hmacKey: CryptoKey,
  baseIv: Uint8Array,
  chunkCount: number,
  chunkHashes: ArrayBuffer[],
): Promise<void> {
  const manifestIv = deriveChunkIV(baseIv, chunkCount);
  let manifestPlaintext: ArrayBuffer;
  try {
    manifestPlaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toCleanUint8Array(manifestIv) },
      fileKey,
      toArrayBuffer(manifestCiphertext),
    );
  } catch {
    throw new FileCorruptedError('File integrity verification failed — manifest decryption error');
  }

  const manifestBytes = new Uint8Array(manifestPlaintext);
  if (manifestBytes.byteLength !== 36) {
    throw new FileCorruptedError('File integrity verification failed — unexpected manifest size');
  }

  // Extract stored HMAC (32 bytes) + chunk count (4 bytes big-endian)
  const storedHMAC = manifestBytes.slice(0, 32);
  const storedCount = new DataView(manifestPlaintext, 32, 4).getUint32(0, false);

  if (storedCount !== chunkCount) {
    throw new Error('File integrity verification failed');
  }

  // Rebuild manifestData: chunkCount(4B BE) || hash_0 || ... || hash_{N-1}
  const manifestData = new Uint8Array(4 + chunkHashes.length * 32);
  new DataView(manifestData.buffer).setUint32(0, chunkCount, false);
  let offset = 4;
  for (const hash of chunkHashes) {
    manifestData.set(new Uint8Array(hash), offset);
    offset += 32;
  }

  const valid = await crypto.subtle.verify(
    'HMAC', hmacKey, toArrayBuffer(storedHMAC), toArrayBuffer(manifestData),
  );
  if (!valid) {
    throw new Error('File integrity verification failed');
  }
}

// ============ Hybrid Encryption ============

/**
 * Encrypt a file using hybrid post-quantum encryption
 *
 * Flow:
 * 1. Generate random file key (FK)
 * 2. Hybrid encapsulate to recipient's public key → get shared secret
 * 3. Derive hybrid KEK from shared secret via HKDF
 * 4. Wrap file key with hybrid KEK using AES-KW
 * 5. Encrypt file content with file key using AES-256-GCM
 * 6. Package as CVEF v1.2 format
 *
 * @param file - File to encrypt
 * @param options - Encryption options including hybrid public key
 * @returns Encrypted blob with CVEF header
 */
export async function encryptFileHybrid(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  const { publicKey, onProgress } = options;

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // 1. Generate random file key
  const fileKey = generateFileKey();

  // 2. Hybrid encapsulate to get shared secret
  const { ciphertext, sharedSecret } = await hybridKem.encapsulate(publicKey);

  // 3. The shared secret IS the hybrid KEK (already derived via HKDF in the provider)
  const hybridKEK = sharedSecret;

  // 4. Wrap file key with hybrid KEK
  const { wrappedKey } = await keyWrap.wrap(fileKey, hybridKEK);
  sharedSecret.fill(0); // Zero shared secret after wrapping

  // 5. Encrypt file content
  const iv = generateIV();
  const fileKeyHandle = await importFileKey(fileKey);
  fileKey.fill(0); // Zero raw file key after import

  // Read and encrypt file
  const fileData = await file.arrayBuffer();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toCleanUint8Array(iv) },
    fileKeyHandle,
    fileData
  );

  // Report progress
  if (onProgress) {
    onProgress({
      bytesProcessed: file.size,
      totalBytes: file.size,
      percentage: 100,
    });
  }

  // 6. Create CVEF v1.2 metadata
  const pqcParams: CVEFPqcParamsV1_2 = {
    kemAlgorithm: 'x25519-ml-kem-768',
    classicalCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.classical)),
    pqCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.postQuantum)),
    wrappedFileKey: arrayBufferToBase64(toArrayBuffer(wrappedKey)),
  };

  const metadata = createCVEFMetadataV1_2({
    salt: arrayBufferToBase64(new ArrayBuffer(32)), // Not used in hybrid mode, but required for format
    iv: arrayBufferToBase64(toArrayBuffer(iv)),
    kdfAlgorithm: 'argon2id', // Indicates new format
    kdfParams: { memoryCost: 0, timeCost: 0, parallelism: 0 }, // Not used in hybrid mode
    keyWrapAlgorithm: 'aes-kw',
    pqcParams,
  });

  // Create CVEF header
  const cvefHeader = createCVEFHeader(metadata);

  // Combine header and ciphertext
  // Convert cvefHeader to ArrayBuffer if needed for proper BlobPart type
  const headerBuffer = cvefHeader instanceof Uint8Array
    ? toArrayBuffer(cvefHeader)
    : cvefHeader;
  const blob = new Blob([headerBuffer, ciphertextBuffer], {
    type: 'application/octet-stream',
  });

  // Zero out sensitive data
  fileKey.fill(0);

  return {
    blob,
    metadata,
    originalSize: file.size,
  };
}

/**
 * Encrypt a large file using hybrid post-quantum encryption with streaming
 *
 * Uses chunked encryption for files larger than available memory.
 *
 * @param file - File to encrypt
 * @param options - Encryption options including hybrid public key
 * @returns Encrypted blob with CVEF header
 */
export async function encryptFileHybridStreaming(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  const { publicKey, onProgress } = options;

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // 1. Generate random file key
  const fileKey = generateFileKey();

  // 2. Hybrid encapsulate
  const { ciphertext, sharedSecret } = await hybridKem.encapsulate(publicKey);
  const hybridKEK = sharedSecret;

  // 3. Wrap file key
  const { wrappedKey } = await keyWrap.wrap(fileKey, hybridKEK);
  sharedSecret.fill(0); // Zero shared secret after wrapping

  // 4. Setup encryption
  const baseIv = generateIV();
  const fileKeyHandle = await importFileKey(fileKey);
  const hmacKey = await deriveManifestHmacKey(fileKey);
  fileKey.fill(0); // Zero raw file key after import

  // 5. Pre-compute chunk count (deterministic from file.size)
  const chunkCount = Math.ceil(file.size / CHUNK_SIZE) || 1;
  const totalBytes = file.size;

  // 6. PQC params (shared between phases)
  const pqcParams: CVEFPqcParamsV1_2 = {
    kemAlgorithm: 'x25519-ml-kem-768',
    classicalCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.classical)),
    pqCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.postQuantum)),
    wrappedFileKey: arrayBufferToBase64(toArrayBuffer(wrappedKey)),
  };

  // ── Phase 1: Encrypt all chunks, collect hashes and payload parts ──
  const encryptedParts: BlobPart[] = [];
  const chunkHashesRaw: ArrayBuffer[] = [];

  let offset = 0;
  let chunkIndex = 0;

  while (offset < file.size) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, chunkEnd);
    const chunkData = await chunk.arrayBuffer();

    const chunkIv = deriveChunkIV(baseIv, chunkIndex);

    const encryptedChunk = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toCleanUint8Array(chunkIv) },
      fileKeyHandle,
      chunkData,
    );

    // SHA-256 of encrypted chunk for integrity
    chunkHashesRaw.push(await crypto.subtle.digest('SHA-256', encryptedChunk));

    // Length-prefixed packet (4-byte big-endian + ciphertext)
    const packet = new Uint8Array(4 + encryptedChunk.byteLength);
    new DataView(packet.buffer).setUint32(0, encryptedChunk.byteLength, false);
    packet.set(new Uint8Array(encryptedChunk), 4);

    encryptedParts.push(packet);
    offset = chunkEnd;
    chunkIndex++;

    if (onProgress) {
      onProgress({
        bytesProcessed: offset,
        totalBytes,
        percentage: Math.round((offset / totalBytes) * 100),
      });
    }
  }

  // ── Phase 2: Compute HMAC, build trailing manifest, assemble blob ──

  // HMAC-SHA-256 over count(4B BE) || hash_0 || ... || hash_N
  const manifestData = new Uint8Array(4 + chunkHashesRaw.length * 32);
  new DataView(manifestData.buffer).setUint32(0, chunkCount, false);
  let mOffset = 4;
  for (const hash of chunkHashesRaw) {
    manifestData.set(new Uint8Array(hash), mOffset);
    mOffset += 32;
  }
  const manifestHMAC = await crypto.subtle.sign('HMAC', hmacKey, manifestData);

  // Build manifest payload: HMAC(32B) + count(4B BE) = 36 bytes
  const manifestPayload = new Uint8Array(36);
  manifestPayload.set(new Uint8Array(manifestHMAC), 0);
  new DataView(manifestPayload.buffer).setUint32(32, chunkCount, false);

  // Encrypt manifest with AES-GCM using IV at index chunkCount
  const manifestIv = deriveChunkIV(baseIv, chunkCount);
  const encryptedManifest = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toCleanUint8Array(manifestIv) },
    fileKeyHandle,
    toArrayBuffer(manifestPayload),
  );

  // Length-prefixed manifest packet
  const manifestPacket = new Uint8Array(4 + encryptedManifest.byteLength);
  new DataView(manifestPacket.buffer).setUint32(0, encryptedManifest.byteLength, false);
  manifestPacket.set(new Uint8Array(encryptedManifest), 4);

  const metadata = createCVEFMetadataV1_2({
    salt: arrayBufferToBase64(new ArrayBuffer(32)),
    iv: arrayBufferToBase64(toArrayBuffer(baseIv)),
    kdfAlgorithm: 'argon2id',
    kdfParams: { memoryCost: 0, timeCost: 0, parallelism: 0 },
    keyWrapAlgorithm: 'aes-kw',
    pqcParams,
    chunked: {
      count: chunkCount,
      chunkSize: CHUNK_SIZE,
      ivs: [],
    },
  });

  const cvefHeader = createCVEFHeader(metadata);
  const headerBuffer = cvefHeader instanceof Uint8Array
    ? toArrayBuffer(cvefHeader)
    : cvefHeader;

  // Trailing manifest goes AFTER all chunk packets
  const blob = new Blob([headerBuffer, ...encryptedParts, manifestPacket], {
    type: 'application/octet-stream',
  });

  // Zero out sensitive data
  fileKey.fill(0);

  return {
    blob,
    metadata,
    originalSize: file.size,
  };
}

// ============ Hybrid Decryption ============

/**
 * Decrypt a hybrid-encrypted file
 *
 * Flow:
 * 1. Parse CVEF v1.2 header
 * 2. Hybrid decapsulate using secret key → get shared secret
 * 3. Derive hybrid KEK from shared secret
 * 4. Unwrap file key using hybrid KEK
 * 5. Decrypt file content with file key
 *
 * @param encryptedData - Encrypted file data (with CVEF header)
 * @param options - Decryption options including hybrid secret key
 * @returns Decrypted file as ArrayBuffer
 */
export async function decryptFileHybrid(
  encryptedData: ArrayBuffer,
  options: HybridDecryptionOptions
): Promise<ArrayBuffer> {
  const { secretKey, onProgress } = options;

  // 1. Parse CVEF header
  const dataView = new Uint8Array(encryptedData);
  const { metadata, dataOffset } = parseCVEFHeader(dataView);

  // Verify it's a v1.2 or v1.3 (signed) hybrid file
  if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata)) {
    throw new Error('Not a hybrid-encrypted file (CVEF v1.2/v1.3 required)');
  }

  // 1b. Verify signature BEFORE decryption if file is signed and public key provided
  if (isCVEFMetadataV1_3(metadata) && options.signerPublicKey) {
    const { verifySignedFile } = await import('./signedFileCrypto');
    const blob = new Blob([encryptedData]);
    const result = await verifySignedFile(blob, { publicKey: options.signerPublicKey });
    if (!result.valid) {
      throw new Error(`Signature verification failed: ${result.error || 'invalid signature'}`);
    }
  }

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // 2. Reconstruct hybrid ciphertext
  const hybridCiphertext: HybridCiphertext = {
    classical: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.classicalCiphertext)),
    postQuantum: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.pqCiphertext)),
  };

  // 3. Hybrid decapsulate
  const sharedSecret = await hybridKem.decapsulate(hybridCiphertext, secretKey);
  const hybridKEK = sharedSecret;

  // 4. Unwrap file key
  const wrappedFileKey = new Uint8Array(
    base64ToArrayBuffer(metadata.pqcParams.wrappedFileKey)
  );
  const { masterKey: fileKey } = await keyWrap.unwrap(wrappedFileKey, hybridKEK, 1);
  sharedSecret.fill(0); // Zero shared secret after unwrapping

  // 5. Decrypt file content
  const iv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
  const ciphertextData = dataView.slice(dataOffset);
  const fileKeyHandle = await importFileKey(fileKey);
  const hmacKey = metadata.chunked ? await deriveManifestHmacKey(fileKey) : undefined;
  fileKey.fill(0); // Zero raw file key after import

  let decryptedData: ArrayBuffer;

  if (metadata.chunked) {
    const stream = decryptChunkedToStream(
      ciphertextData,
      fileKeyHandle,
      iv,
      metadata.chunked.count,
      onProgress,
      hmacKey,
    );
    const decryptBlob = await new Response(stream).blob();
    decryptedData = await decryptBlob.arrayBuffer();
  } else {
    // Single-pass decryption
    try {
      decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toCleanUint8Array(iv) },
        fileKeyHandle,
        toArrayBuffer(ciphertextData)
      );
    } catch {
      throw new Error('File decryption failed: invalid key or corrupted data');
    }

    if (onProgress) {
      onProgress({
        bytesProcessed: decryptedData.byteLength,
        totalBytes: decryptedData.byteLength,
        percentage: 100,
      });
    }
  }

  // Zero out sensitive data
  fileKey.fill(0);

  return decryptedData;
}

/**
 * Decrypt chunked data
 */
export async function decryptChunked(
  data: Uint8Array,
  key: CryptoKey,
  baseIv: Uint8Array,
  chunkCount: number,
  onProgress?: (progress: EncryptionProgress) => void,
  hmacKey?: CryptoKey,
): Promise<ArrayBuffer> {
  const decryptedChunks: ArrayBuffer[] = [];
  const chunkHashes: ArrayBuffer[] = [];
  let offset = 0;
  let bytesDecrypted = 0;

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    // Read chunk length
    const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
    const chunkLength = lengthView.getUint32(0, false);
    offset += 4;

    // Read encrypted chunk
    const encryptedChunk = data.slice(offset, offset + chunkLength);
    offset += chunkLength;

    // Hash encrypted chunk for integrity manifest verification
    if (hmacKey) {
      chunkHashes.push(await crypto.subtle.digest('SHA-256', toArrayBuffer(encryptedChunk)));
    }

    // Derive chunk IV
    const chunkIv = deriveChunkIV(baseIv, chunkIndex);

    // Decrypt chunk
    let decryptedChunk: ArrayBuffer;
    try {
      decryptedChunk = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toCleanUint8Array(chunkIv) },
        key,
        toArrayBuffer(encryptedChunk)
      );
    } catch {
      throw new Error(`Chunk ${chunkIndex} decryption failed: invalid key or corrupted data`);
    }

    decryptedChunks.push(decryptedChunk);
    bytesDecrypted += decryptedChunk.byteLength;

    if (onProgress) {
      onProgress({
        bytesProcessed: bytesDecrypted,
        totalBytes: bytesDecrypted, // We don't know total until done
        percentage: Math.round(((chunkIndex + 1) / chunkCount) * 100),
      });
    }
  }

  // Verify integrity manifest
  if (hmacKey) {
    const manifestLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
    const manifestLength = manifestLengthView.getUint32(0, false);
    offset += 4;
    const manifestCiphertext = data.slice(offset, offset + manifestLength);
    await verifyChunkManifest(manifestCiphertext, key, hmacKey, baseIv, chunkCount, chunkHashes);
  }

  // Combine decrypted chunks
  const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let resultOffset = 0;

  for (const chunk of decryptedChunks) {
    result.set(new Uint8Array(chunk), resultOffset);
    resultOffset += chunk.byteLength;
  }

  return toArrayBuffer(result);
}

/**
 * Streaming variant of decryptChunked — yields a ReadableStream<Uint8Array>
 * instead of accumulating ArrayBuffer[]. Emits chunks immediately after
 * AES-GCM decryption (which authenticates each chunk). Trailing manifest
 * is verified at end as defense-in-depth.
 */
export function decryptChunkedToStream(
  data: Uint8Array,
  key: CryptoKey,
  baseIv: Uint8Array,
  chunkCount: number,
  onProgress?: (progress: EncryptionProgress) => void,
  hmacKey?: CryptoKey,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let offset = 0;
        let bytesDecrypted = 0;
        const chunkHashes: ArrayBuffer[] = [];

        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
          const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
          const chunkLength = lengthView.getUint32(0, false);
          offset += 4;

          const encryptedChunk = data.slice(offset, offset + chunkLength);
          offset += chunkLength;

          // Hash encrypted chunk for integrity manifest verification
          if (hmacKey) {
            chunkHashes.push(await crypto.subtle.digest('SHA-256', toArrayBuffer(encryptedChunk)));
          }

          const chunkIv = deriveChunkIV(baseIv, chunkIndex);

          let decryptedChunk: ArrayBuffer;
          try {
            decryptedChunk = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: toCleanUint8Array(chunkIv) },
              key,
              toArrayBuffer(encryptedChunk)
            );
          } catch {
            throw new Error(`Chunk ${chunkIndex} decryption failed: invalid key or corrupted data`);
          }

          const plaintext = new Uint8Array(decryptedChunk);
          bytesDecrypted += plaintext.byteLength;

          // Emit immediately — AES-GCM authenticates each chunk
          controller.enqueue(plaintext);

          if (onProgress) {
            onProgress({
              bytesProcessed: bytesDecrypted,
              totalBytes: bytesDecrypted,
              percentage: Math.round(((chunkIndex + 1) / chunkCount) * 100),
            });
          }
        }

        // Verify trailing manifest (defense-in-depth)
        if (hmacKey) {
          const manifestLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
          const manifestLength = manifestLengthView.getUint32(0, false);
          offset += 4;
          const manifestCiphertext = data.slice(offset, offset + manifestLength);
          await verifyChunkManifest(manifestCiphertext, key, hmacKey, baseIv, chunkCount, chunkHashes);
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Decrypt a hybrid-encrypted file from URL
 *
 * @param url - URL to fetch encrypted file from
 * @param options - Decryption options
 * @param mimeType - Original MIME type
 * @returns Decrypted file as Blob
 */
export async function decryptFileHybridFromUrl(
  url: string,
  options: HybridDecryptionOptions,
  mimeType: string
): Promise<Blob> {
  // Fetch encrypted file
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const encryptedData = await response.arrayBuffer();
  const decryptedData = await decryptFileHybrid(encryptedData, options);

  return new Blob([decryptedData], { type: mimeType });
}

// ============ Utility Functions ============

/**
 * Check if encrypted data is in hybrid format (CVEF v1.2 or v1.3 signed)
 */
export function isHybridEncrypted(data: ArrayBuffer): boolean {
  try {
    const dataView = new Uint8Array(data);
    const { metadata } = parseCVEFHeader(dataView);
    return isCVEFMetadataV1_2(metadata) || isCVEFMetadataV1_3(metadata);
  } catch {
    return false;
  }
}

/**
 * Get metadata from encrypted file
 */
export function getEncryptionMetadata(data: ArrayBuffer): CVEFMetadata {
  const dataView = new Uint8Array(data);
  const { metadata } = parseCVEFHeader(dataView);
  return metadata;
}

/**
 * Determine if a file should use streaming encryption
 */
export function shouldUseStreamingEncryption(file: File): boolean {
  return file.size > STREAMING.THRESHOLD_BYTES;
}

/**
 * Encrypt a file with hybrid KEM, automatically choosing streaming for large files
 */
export async function encryptFileHybridAuto(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  if (shouldUseStreamingEncryption(file)) {
    return encryptFileHybridStreaming(file, options);
  }
  return encryptFileHybrid(file, options);
}

// ============ V4 File Key Extraction (for Sharing) ============

export interface ExtractedFileKey {
  /** Raw 32-byte file key */
  fileKeyBytes: Uint8Array;
  /** Zeroes the key bytes in memory */
  zeroBytes: () => void;
}

/**
 * Extract the raw 32-byte file key from a V4 (hybrid) encrypted file.
 *
 * This fetches only the CVEF header from the presigned URL to extract
 * the wrapped file key, then unwraps it using the user's hybrid secret key.
 * The file content itself is NOT decrypted — only the file key is returned.
 *
 * Used by the sharing system to re-wrap the file key for recipients.
 *
 * @param presignedUrl - Presigned URL to fetch the encrypted file from R2
 * @param secretKey - User's hybrid secret key for decapsulation
 * @returns The raw 32-byte file key and a cleanup function
 */
export async function extractV4FileKey(
  presignedUrl: string,
  secretKey: HybridSecretKey,
): Promise<ExtractedFileKey> {
  // Stream the file and parse header incrementally
  const controller = new AbortController();
  const response = await fetch(presignedUrl, { signal: controller.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch file header: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Response body is null — streaming not supported');
  }

  // Parse just the CVEF header from the stream, then abort to avoid downloading the whole file
  const { metadata } = await parseCVEFHeaderFromStream(response.body);
  controller.abort();

  // Verify it's a v1.2 or v1.3 hybrid file
  if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata)) {
    throw new Error('Not a V4 hybrid-encrypted file (CVEF v1.2/v1.3 required)');
  }

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // Reconstruct hybrid ciphertext from metadata
  const hybridCiphertext: HybridCiphertext = {
    classical: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.classicalCiphertext)),
    postQuantum: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.pqCiphertext)),
  };

  // Decapsulate to get shared secret (hybrid KEK)
  const sharedSecret = await hybridKem.decapsulate(hybridCiphertext, secretKey);

  // Unwrap file key
  const wrappedFileKey = new Uint8Array(
    base64ToArrayBuffer(metadata.pqcParams.wrappedFileKey)
  );
  const { masterKey: fileKey } = await keyWrap.unwrap(wrappedFileKey, sharedSecret, 1);
  sharedSecret.fill(0); // Zero hybrid KEK after unwrapping file key

  return {
    fileKeyBytes: fileKey,
    zeroBytes: () => fileKey.fill(0),
  };
}
