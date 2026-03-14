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
  CVEF_HEADER_SIZE,
  CVEF_MAGIC,
  CVEF_MAX_METADATA_SIZE,
  CRYPTO_CONSTANTS,
  type CVEFMetadata,
} from '@cloudvault/shared/platform/crypto';
import { deriveChunkIV, base64ToArrayBuffer, toArrayBuffer } from '@cloudvault/shared/platform/crypto';
import { verifyChunkManifest } from './hybridFileCrypto';

/** Maximum allowed chunk size to prevent memory exhaustion from corrupted headers */
const CVEF_MAX_CHUNK_SIZE = CRYPTO_CONSTANTS.MAX_CHUNK_SIZE;


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
}

export interface ParsedCVEFStream {
  metadata: CVEFMetadata;
  reader: BufferedStreamReader;
}


/**
 * Wraps a ReadableStreamDefaultReader with a pushback buffer.
 * Handles the fact that fetch().body yields arbitrarily-sized chunks
 * that don't align to CVEF framing boundaries.
 */
export class BufferedStreamReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer: Uint8Array;
  private bufferOffset: number;
  private done: boolean;

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>, initialBuffer?: Uint8Array) {
    this.reader = reader;
    this.buffer = initialBuffer ?? new Uint8Array(0);
    this.bufferOffset = 0;
    this.done = false;
  }

  /** Read exactly `n` bytes from the stream, buffering across chunk boundaries */
  async readExact(n: number): Promise<Uint8Array> {
    const result = new Uint8Array(n);
    let filled = 0;

    // Drain existing buffer first
    const available = this.buffer.length - this.bufferOffset;
    if (available > 0) {
      const toCopy = Math.min(available, n);
      result.set(this.buffer.subarray(this.bufferOffset, this.bufferOffset + toCopy), 0);
      this.bufferOffset += toCopy;
      filled += toCopy;

      // Free buffer if fully consumed
      if (this.bufferOffset >= this.buffer.length) {
        this.buffer = new Uint8Array(0);
        this.bufferOffset = 0;
      }
    }

    // Read from stream until we have enough
    while (filled < n) {
      if (this.done) {
        throw new Error(`Unexpected end of stream: needed ${n} bytes, got ${filled}`);
      }

      const { done, value } = await this.reader.read();
      if (done) {
        this.done = true;
        if (filled < n) {
          throw new Error(`Unexpected end of stream: needed ${n} bytes, got ${filled}`);
        }
        break;
      }

      const needed = n - filled;
      if (value.byteLength <= needed) {
        result.set(value, filled);
        filled += value.byteLength;
      } else {
        // Copy what we need, save the rest
        result.set(value.subarray(0, needed), filled);
        filled += needed;
        this.buffer = value.subarray(needed);
        this.bufferOffset = 0;
      }
    }

    return result;
  }

  /** Read all remaining bytes from the stream */
  async readRemaining(): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;

    // Drain existing buffer first
    const available = this.buffer.length - this.bufferOffset;
    if (available > 0) {
      chunks.push(this.buffer.subarray(this.bufferOffset, this.buffer.length));
      total += available;
      this.buffer = new Uint8Array(0);
      this.bufferOffset = 0;
    }

    // Read from stream until done
    while (!this.done) {
      const { done, value } = await this.reader.read();
      if (done) {
        this.done = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }

    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}


/**
 * Parse CVEF header from a stream without buffering the entire file.
 *
 * Reads the 9-byte fixed header, then the metadata JSON, then returns
 * the parsed metadata and a BufferedStreamReader positioned at the
 * start of the encrypted data.
 */
export async function parseCVEFHeaderFromStream(
  stream: ReadableStream<Uint8Array>,
): Promise<ParsedCVEFStream> {
  const rawReader = stream.getReader();
  const buffered = new BufferedStreamReader(rawReader);

  // Read 9-byte fixed header: magic (4) + version (1) + metadata length (4)
  const fixedHeader = await buffered.readExact(CVEF_HEADER_SIZE);

  // Validate magic
  for (let i = 0; i < 4; i++) {
    if (fixedHeader[i] !== CVEF_MAGIC[i]) {
      throw new Error('Not a valid CVEF file: missing magic header');
    }
  }

  // Validate version
  if (fixedHeader[4] !== 1) {
    throw new Error(`Unsupported CVEF version: ${fixedHeader[4]}`);
  }

  // Read metadata length (big-endian)
  const metadataLength =
    (fixedHeader[5]! << 24) | (fixedHeader[6]! << 16) | (fixedHeader[7]! << 8) | fixedHeader[8]!;

  if (metadataLength > CVEF_MAX_METADATA_SIZE) {
    throw new Error(`Metadata too large: ${metadataLength} bytes`);
  }

  // Read metadata JSON
  const metadataBytes = await buffered.readExact(metadataLength);

  // Combine into full header for parseCVEFHeader (which validates + normalizes)
  const fullHeader = new Uint8Array(CVEF_HEADER_SIZE + metadataLength);
  fullHeader.set(fixedHeader, 0);
  fullHeader.set(metadataBytes, CVEF_HEADER_SIZE);

  const { metadata } = parseCVEFHeader(fullHeader);

  return { metadata, reader: buffered };
}


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
        const { metadata, reader } = await parseCVEFHeaderFromStream(encryptedStream);

        // Verify it's a V4 hybrid file
        if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata)) {
          throw new Error('Not a V4 hybrid-encrypted file (CVEF v1.2/v1.3 required)');
        }

        if (!metadata.chunked) {
          // Non-chunked V4: single-pass AES-GCM (file < 50MB streaming threshold)
          const ncIv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
          const ciphertext = await reader.readRemaining();

          const cleanNcIv = new Uint8Array(12);
          cleanNcIv.set(ncIv);
          let decrypted: ArrayBuffer;
          try {
            decrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: cleanNcIv as Uint8Array<ArrayBuffer> },
              fileKey,
              toArrayBuffer(ciphertext),
            );
          } catch {
            throw new Error('File decryption failed: invalid key or corrupted data');
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

        // v1.2/v1.3: emit chunks immediately (AES-GCM authenticates each),
        // verify trailing manifest at end (defense-in-depth)
        const chunkHashes: ArrayBuffer[] = [];

        for (let i = 0; i < chunkCount; i++) {
          if (signal?.aborted) {
            controller.error(new DOMException('Decryption aborted', 'AbortError'));
            return;
          }

          const lengthBytes = await reader.readExact(4);
          const chunkLength =
            (lengthBytes[0]! << 24) | (lengthBytes[1]! << 16) |
            (lengthBytes[2]! << 8) | lengthBytes[3]!;

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
              { name: 'AES-GCM', iv: cleanIv as Uint8Array<ArrayBuffer> },
              fileKey,
              toArrayBuffer(encryptedChunk),
            );
          } catch {
            throw new Error(`Chunk ${i} decryption failed: invalid key or corrupted data`);
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
          const manifestLength =
            (manifestLengthBytes[0]! << 24) | (manifestLengthBytes[1]! << 16) |
            (manifestLengthBytes[2]! << 8) | manifestLengthBytes[3]!;
          const manifestCiphertext = await reader.readExact(manifestLength);
          await verifyChunkManifest(manifestCiphertext, fileKey, hmacKey, baseIv, chunkCount, chunkHashes);
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
