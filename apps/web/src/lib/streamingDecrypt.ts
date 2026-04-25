/**
 * Streaming Decryption Module
 *
 * Provides streaming decryption for V4 (CVEF) chunked files.
 * Decrypts each chunk individually and streams plaintext to a ReadableStream,
 * keeping memory usage at ~128KB (one encrypted + one plaintext chunk).
 *
 * V3 files are single AES-GCM blobs that require full ciphertext for WebCrypto.
 * They are handled at the integration layer by wrapping the decrypted ArrayBuffer
 * in a one-chunk ReadableStream.
 */

import {
  parseCVEFHeader,
  isCVEFMetadataV1_2,
  isCVEFMetadataV1_3,
  isCVEFMetadataV1_4,
  hasValidSignatureMetadata,
  validateSignatureMetadata,
  CVEF_HEADER_SIZE,
  CVEF_MAGIC,
  CVEF_CONTAINER_V1,
  CVEF_CONTAINER_V2,
  CVEF_MAX_METADATA_SIZE,
  CVEF_MIN_METADATA_SIZE,
  CRYPTO_CONSTANTS,
  type CVEFMetadata,
  type CVEFSignatureMetadata,
} from '@stenvault/shared/platform/crypto';
import { base64ToArrayBuffer, toArrayBuffer } from '@stenvault/shared/platform/crypto';
import { deriveChunkIV } from '@stenvault/aead-stream/iv';
import { BufferedStreamReader } from '@stenvault/aead-stream';
import { verifyChunkManifest } from './hybridFile';
import { VaultError } from '@stenvault/shared/errors';

/** Maximum allowed chunk size to prevent memory exhaustion from corrupted headers */
const CVEF_MAX_CHUNK_SIZE = CRYPTO_CONSTANTS.MAX_CHUNK_SIZE;

// ============ Types ============

export interface StreamingDecryptProgress {
  chunkIndex: number;
  chunkCount: number;
  bytesDecrypted: number;
}

export interface StreamingDecryptOptions {
  fileKey: CryptoKey;
  hmacKey?: CryptoKey;
  onProgress?: (progress: StreamingDecryptProgress) => void;
  signal?: AbortSignal;
  /** Signer's public key — if file is signed, verification happens before chunk decryption */
  signerPublicKey?: import('@stenvault/shared/platform/crypto').HybridSignaturePublicKey;
}

export interface ParsedCVEFStream {
  metadata: CVEFMetadata;
  reader: BufferedStreamReader;
  /** Raw core metadata JSON bytes (for signature verification in v1.4) */
  coreMetadataBytes: Uint8Array;
  /** Parsed signature metadata from second block (v1.4 container v2 only) */
  signatureMetadata?: CVEFSignatureMetadata;
  /** Full header bytes from start to data offset (= AAD for AES-GCM in v1.4) */
  headerBytes: Uint8Array;
}

// ============ Streaming Uint32 Reader ============

/** Read a 4-byte big-endian unsigned integer from bytes */
function readUint32BE(bytes: Uint8Array): number {
  return ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
}

// ============ CVEF Header Streaming Parse ============

/**
 * Parse CVEF header from a stream without buffering the entire file.
 *
 * Supports both container v1 (single block) and v2 (two-block with signature).
 * Returns the parsed metadata, a BufferedStreamReader positioned at the
 * start of the encrypted data, and the raw header bytes for AAD.
 */
export async function parseCVEFHeaderFromStream(
  stream: ReadableStream<Uint8Array>,
): Promise<ParsedCVEFStream> {
  const rawReader = stream.getReader();
  const buffered = new BufferedStreamReader(rawReader);

  // Read 9-byte fixed header: magic (4) + container version (1) + first length (4)
  const fixedHeader = await buffered.readExact(CVEF_HEADER_SIZE);

  // Validate magic
  for (let i = 0; i < 4; i++) {
    if (fixedHeader[i] !== CVEF_MAGIC[i]) {
      throw new Error('Not a valid CVEF file: missing magic header');
    }
  }

  const containerVersion = fixedHeader[4];

  if (containerVersion === CVEF_CONTAINER_V1) {
    return parseCVEFHeaderFromStreamV1(fixedHeader, buffered);
  } else if (containerVersion === CVEF_CONTAINER_V2) {
    return parseCVEFHeaderFromStreamV2(fixedHeader, buffered);
  } else {
    throw new Error(`Unsupported CVEF container version: ${containerVersion}`);
  }
}

/**
 * Parse container v1 header from stream (single metadata block, v1.0–v1.3)
 */
async function parseCVEFHeaderFromStreamV1(
  fixedHeader: Uint8Array,
  buffered: BufferedStreamReader,
): Promise<ParsedCVEFStream> {
  // Read metadata length (big-endian, unsigned)
  const metadataLength = readUint32BE(fixedHeader.subarray(5, 9));

  if (metadataLength < CVEF_MIN_METADATA_SIZE) {
    throw new Error(`Metadata too small: ${metadataLength} bytes`);
  }

  if (metadataLength > CVEF_MAX_METADATA_SIZE) {
    throw new Error(`Metadata too large: ${metadataLength} bytes`);
  }

  // Read metadata JSON
  const coreMetadataBytes = await buffered.readExact(metadataLength);

  // Combine into full header for parseCVEFHeader (which validates + normalizes)
  const headerBytes = new Uint8Array(CVEF_HEADER_SIZE + metadataLength);
  headerBytes.set(fixedHeader, 0);
  headerBytes.set(coreMetadataBytes, CVEF_HEADER_SIZE);

  const { metadata } = parseCVEFHeader(headerBytes);

  return { metadata, reader: buffered, coreMetadataBytes, headerBytes };
}

/**
 * Parse container v2 header from stream (two-block, v1.4)
 *
 * Format: [9B fixed] [N core JSON] [4B sigLen] [M sig JSON] [encrypted data]
 */
async function parseCVEFHeaderFromStreamV2(
  fixedHeader: Uint8Array,
  buffered: BufferedStreamReader,
): Promise<ParsedCVEFStream> {
  // Read core metadata length (big-endian, unsigned)
  const coreMetadataLength = readUint32BE(fixedHeader.subarray(5, 9));

  if (coreMetadataLength < CVEF_MIN_METADATA_SIZE) {
    throw new Error(`Core metadata too small: ${coreMetadataLength} bytes`);
  }

  if (coreMetadataLength > CVEF_MAX_METADATA_SIZE) {
    throw new Error(`Core metadata too large: ${coreMetadataLength} bytes`);
  }

  // Read core metadata JSON
  const coreMetadataBytes = await buffered.readExact(coreMetadataLength);

  // Read signature metadata length (4 bytes)
  const sigLenBytes = await buffered.readExact(4);
  const sigMetadataLength = readUint32BE(sigLenBytes);

  if (sigMetadataLength > CVEF_MAX_METADATA_SIZE) {
    throw new Error(`Signature metadata too large: ${sigMetadataLength} bytes`);
  }

  // Read signature metadata JSON (if present)
  let sigMetadataBytes: Uint8Array | undefined;
  let signatureMetadata: CVEFSignatureMetadata | undefined;

  if (sigMetadataLength > 0) {
    sigMetadataBytes = await buffered.readExact(sigMetadataLength);
    const sigJson = new TextDecoder().decode(sigMetadataBytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(sigJson);
    } catch {
      throw new Error('Invalid CVEF signature metadata: not valid JSON');
    }
    signatureMetadata = validateSignatureMetadata(parsed);
  }

  // Assemble full header bytes (= AAD)
  const totalHeaderSize = CVEF_HEADER_SIZE + coreMetadataLength + 4 + sigMetadataLength;
  const headerBytes = new Uint8Array(totalHeaderSize);
  let offset = 0;

  headerBytes.set(fixedHeader, offset);
  offset += CVEF_HEADER_SIZE;

  headerBytes.set(coreMetadataBytes, offset);
  offset += coreMetadataLength;

  headerBytes.set(sigLenBytes, offset);
  offset += 4;

  if (sigMetadataBytes) {
    headerBytes.set(sigMetadataBytes, offset);
  }

  // Parse core metadata (validate + normalize)
  const { metadata } = parseCVEFHeader(headerBytes);

  return { metadata, reader: buffered, coreMetadataBytes, signatureMetadata, headerBytes };
}

// ============ V4 Chunked Streaming Decrypt ============

/**
 * Decrypt a V4 chunked CVEF stream to a plaintext ReadableStream.
 *
 * The returned stream yields decrypted Uint8Array chunks with no accumulation.
 * Memory usage: ~128KB (one encrypted chunk + one plaintext chunk).
 *
 * @param encryptedStream - The raw encrypted fetch stream
 * @param options - Decryption options with the file key
 * @returns ReadableStream of plaintext chunks
 */
export function decryptV4ChunkedToStream(
  encryptedStream: ReadableStream<Uint8Array>,
  options: StreamingDecryptOptions,
): ReadableStream<Uint8Array> {
  const { fileKey, hmacKey, onProgress, signal } = options;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Parse CVEF header from stream
        const { metadata, reader, headerBytes, signatureMetadata, coreMetadataBytes } = await parseCVEFHeaderFromStream(encryptedStream);

        // Verify it's a V4 hybrid file
        if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata) && !isCVEFMetadataV1_4(metadata)) {
          throw new Error('Not a V4 hybrid-encrypted file (CVEF v1.2/v1.3/v1.4 required)');
        }

        // Signature verification (fail-closed) — before any chunk decryption
        if (isCVEFMetadataV1_4(metadata) && hasValidSignatureMetadata(signatureMetadata)) {
          if (!options.signerPublicKey) {
            throw new Error('Signed file requires signerPublicKey for streaming verification — decryption blocked');
          }
          const sig = signatureMetadata!;
          const { verifyContentHash } = await import('./signedFileCrypto');
          const { buildSignatureHash } = await import('./hybridFile');
          const hash = await buildSignatureHash(coreMetadataBytes, sig.signerFingerprint, sig.signerKeyVersion, sig.signedAt);
          const signature = {
            classical: new Uint8Array(base64ToArrayBuffer(sig.classicalSignature)),
            postQuantum: new Uint8Array(base64ToArrayBuffer(sig.pqSignature)),
            context: sig.signingContext,
            signedAt: sig.signedAt,
          };
          const result = await verifyContentHash(hash, signature, options.signerPublicKey);
          if (!result.valid) {
            throw new Error(`Streaming signature verification failed: ${result.error || 'invalid signature'}`);
          }
        }

        // Determine AAD: v1.4 uses headerBytes, older versions have no AAD
        const aad = isCVEFMetadataV1_4(metadata) ? headerBytes : undefined;

        if (!metadata.chunked) {
          // Non-chunked V4: single-pass AES-GCM (file < 50MB streaming threshold)
          const ncIv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
          const ciphertext = await reader.readRemaining();

          const cleanNcIv = new Uint8Array(12);
          cleanNcIv.set(ncIv);
          let decrypted: ArrayBuffer;
          try {
            decrypted = await crypto.subtle.decrypt(
              {
                name: 'AES-GCM',
                iv: cleanNcIv as Uint8Array<ArrayBuffer>,
                ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
              },
              fileKey,
              toArrayBuffer(ciphertext),
            );
          } catch {
            if (signal?.aborted) {
              controller.error(new DOMException('Decryption aborted', 'AbortError'));
              return;
            }
            throw new VaultError('FILE_CORRUPT', { layer: 'stream_non_chunked_aes_gcm' });
          }

          controller.enqueue(new Uint8Array(decrypted));

          if (onProgress) {
            onProgress({
              chunkIndex: 0,
              chunkCount: 1,
              bytesDecrypted: decrypted.byteLength,
            });
          }

          controller.close();
          return;
        }

        const baseIv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
        const chunkCount = metadata.chunked.count;
        let bytesDecrypted = 0;

        // Emit chunks immediately (AES-GCM authenticates each),
        // verify trailing manifest at end (defense-in-depth)
        const chunkHashes: ArrayBuffer[] = [];

        for (let i = 0; i < chunkCount; i++) {
          if (signal?.aborted) {
            controller.error(new DOMException('Decryption aborted', 'AbortError'));
            return;
          }

          const lengthBytes = await reader.readExact(4);
          const chunkLength = readUint32BE(lengthBytes);

          if (chunkLength <= 0 || chunkLength > CVEF_MAX_CHUNK_SIZE) {
            throw new Error(`Invalid CVEF chunk size: ${chunkLength} bytes (max ${CVEF_MAX_CHUNK_SIZE})`);
          }

          const encryptedChunk = await reader.readExact(chunkLength);

          if (hmacKey) {
            chunkHashes.push(await crypto.subtle.digest('SHA-256', toArrayBuffer(encryptedChunk)));
          }

          const chunkIv = deriveChunkIV(baseIv, i);
          const cleanIv = new Uint8Array(12);
          cleanIv.set(chunkIv);
          let decrypted: ArrayBuffer;
          try {
            decrypted = await crypto.subtle.decrypt(
              {
                name: 'AES-GCM',
                iv: cleanIv as Uint8Array<ArrayBuffer>,
                ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
              },
              fileKey,
              toArrayBuffer(encryptedChunk),
            );
          } catch {
            if (signal?.aborted) {
              controller.error(new DOMException('Decryption aborted', 'AbortError'));
              return;
            }
            throw new VaultError('FILE_CORRUPT', { layer: 'stream_chunked_aes_gcm', chunkIndex: i });
          }

          const plaintext = new Uint8Array(decrypted);
          bytesDecrypted += plaintext.byteLength;

          // Emit immediately — AES-GCM authenticates each chunk
          controller.enqueue(plaintext);

          if (onProgress) {
            onProgress({ chunkIndex: i, chunkCount, bytesDecrypted });
          }
        }

        // Verify trailing manifest (defense-in-depth)
        if (hmacKey) {
          const manifestLengthBytes = await reader.readExact(4);
          const manifestLength = readUint32BE(manifestLengthBytes);
          const manifestCiphertext = await reader.readExact(manifestLength);
          await verifyChunkManifest(manifestCiphertext, fileKey, hmacKey, baseIv, chunkCount, chunkHashes, aad ? headerBytes : undefined);
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
