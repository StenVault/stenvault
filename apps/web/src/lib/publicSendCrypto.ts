/**
 * Public Send - Client-side AES-256-GCM Crypto
 *
 * Intentionally simpler than main app crypto (no Master Key, no CVEF, no PQC).
 * Just AES-256-GCM with a random key per file. Zero friction for anonymous users.
 *
 * Each encrypted chunk = [12-byte IV][ciphertext + 16-byte auth tag]
 * Self-contained for stateless decryption.
 */

import { BufferedStreamReader } from './streamingDecrypt';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@stenvault/shared/platform/crypto';

/** Chunk size for splitting files before encryption (5MB) */
export const SEND_CHUNK_SIZE = 5 * 1024 * 1024;

const IV_LENGTH = 12;
const AUTH_TAG_SIZE = 16;

/** Encryption overhead per chunk: IV + auth tag */
export const SEND_ENCRYPTION_OVERHEAD = IV_LENGTH + AUTH_TAG_SIZE;

/**
 * Generate a random 256-bit AES key for encrypting a send session.
 */
export async function generateSendKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed for export to URL fragment
    ["encrypt", "decrypt"],
  );
}

/**
 * Export a CryptoKey to a base64url-encoded string (for URL fragment).
 */
export async function keyToFragment(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return base64urlEncode(new Uint8Array(raw));
}

/**
 * Import a CryptoKey from a base64url-encoded URL fragment.
 */
export async function fragmentToKey(fragment: string): Promise<CryptoKey> {
  const raw = base64urlDecode(fragment);
  if (raw.byteLength !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${raw.byteLength}`);
  }
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed for chunk manifest HMAC verification
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt file metadata (name + type) with AES-GCM.
 * Returns ciphertext (base64) and IV (base64).
 */
export async function encryptMetadata(
  meta: { name: string; type: string; isBundle?: boolean; manifest?: { files: Array<{ name: string; size: number; type: string }> } | null },
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(JSON.stringify(meta));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded,
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt file metadata from base64-encoded ciphertext + IV.
 */
export async function decryptMetadata(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<{ name: string; type: string; isBundle?: boolean; manifest?: { files: Array<{ name: string; size: number; type: string }> } | null }> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(iv)) as BufferSource },
    key,
    new Uint8Array(base64ToArrayBuffer(ciphertext)) as BufferSource,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * Encrypt a single chunk. Output: [12-byte IV][ciphertext + 16-byte auth tag]
 */
export async function encryptChunk(
  chunk: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    chunk as BufferSource,
  );

  // Prepend IV to ciphertext
  const result = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), IV_LENGTH);
  return result;
}

/**
 * Decrypt a single chunk. Input format: [12-byte IV][ciphertext + 16-byte auth tag]
 */
export async function decryptChunk(
  encrypted: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const iv = encrypted.slice(0, IV_LENGTH);
  const ciphertext = encrypted.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );

  return new Uint8Array(decrypted);
}

/**
 * Get the encrypted size of a chunk given its original size.
 */
export function getEncryptedChunkSize(originalSize: number): number {
  return originalSize + SEND_ENCRYPTION_OVERHEAD;
}

// ============ Streaming Decrypt ============

/**
 * Create a streaming decryption pipeline for public send files.
 *
 * Reads encrypted chunks from the network stream via BufferedStreamReader,
 * decrypts each one independently (AES-256-GCM auth tag verified per chunk),
 * and enqueues plaintext to the output ReadableStream.
 *
 * Memory: ~5MB (one chunk buffer) instead of entire file.
 */
export function decryptPublicSendStream(
  encryptedStream: ReadableStream<Uint8Array>,
  options: {
    key: CryptoKey;
    fileSize: number;
    totalParts: number;
    chunkSize: number;
    encryptionOverhead: number;
    onProgress?: (chunkIndex: number, totalParts: number) => void;
    signal?: AbortSignal;
    /** W3: Expected chunk hashes for integrity verification (colon-separated hex) */
    expectedChunkHashes?: string | null;
    /** W3: Expected HMAC manifest for inter-chunk integrity */
    expectedManifest?: string | null;
  },
): ReadableStream<Uint8Array> {
  const { key, fileSize, totalParts, chunkSize, encryptionOverhead, onProgress, signal,
    expectedChunkHashes, expectedManifest } = options;

  const expectedHashes = expectedChunkHashes?.split(':') ?? null;

  let rawReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        rawReader = encryptedStream.getReader();
        const reader = new BufferedStreamReader(rawReader);
        const computedHashes: string[] = [];

        for (let i = 0; i < totalParts; i++) {
          if (signal?.aborted) {
            controller.error(new DOMException('Download aborted', 'AbortError'));
            return;
          }

          const isLastPart = i === totalParts - 1;
          const originalPartSize = isLastPart
            ? fileSize - (totalParts - 1) * chunkSize
            : chunkSize;
          const encryptedPartSize = originalPartSize + encryptionOverhead;

          const encryptedChunkData = await reader.readExact(encryptedPartSize);

          // W3: Verify individual chunk hash if manifest is available
          if (expectedHashes && expectedHashes[i]) {
            const actualHash = await hashEncryptedChunk(encryptedChunkData);
            if (actualHash !== expectedHashes[i]) {
              controller.error(new Error(`Chunk ${i} integrity check failed`));
              return;
            }
            computedHashes.push(actualHash);
          }

          const decrypted = await decryptChunk(encryptedChunkData, key);

          controller.enqueue(decrypted);
          onProgress?.(i, totalParts);
        }

        // W3: Verify overall manifest HMAC after all chunks
        if (expectedManifest && computedHashes.length === totalParts) {
          const valid = await verifyChunkManifest(computedHashes, key, expectedManifest);
          if (!valid) {
            controller.error(new Error('Chunk manifest integrity check failed'));
            return;
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      rawReader?.cancel().catch(() => {});
    },
  });
}

// ============ Thumbnail / Snippet Crypto ============

/**
 * Encrypt a thumbnail blob (WebP/JPEG) with AES-GCM.
 * Returns base64 ciphertext + IV.
 */
export async function encryptThumbnail(
  blob: Blob,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = await blob.arrayBuffer();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data,
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt an encrypted thumbnail back to a Blob.
 */
export async function decryptThumbnail(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<Blob> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(iv)) as BufferSource },
    key,
    new Uint8Array(base64ToArrayBuffer(ciphertext)) as BufferSource,
  );
  return new Blob([decrypted], { type: "image/webp" });
}

/**
 * Encrypt a text snippet with AES-GCM.
 */
export async function encryptSnippet(
  text: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(text);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded,
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt an encrypted snippet back to string.
 */
export async function decryptSnippet(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(iv)) as BufferSource },
    key,
    new Uint8Array(base64ToArrayBuffer(ciphertext)) as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

// ============ Chunk Manifest (W3: inter-chunk integrity) ============

/**
 * Compute SHA-256 hash of an encrypted chunk.
 * Returns hex string for compact storage.
 */
export async function hashEncryptedChunk(encrypted: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encrypted as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute HMAC-SHA256 over concatenated chunk hashes using the send key.
 * This proves that all chunks belong together and haven't been tampered with.
 */
export async function computeChunkManifest(
  chunkHashes: string[],
  key: CryptoKey,
): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', key);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = new TextEncoder().encode(chunkHashes.join(':'));
  const sig = await crypto.subtle.sign('HMAC', hmacKey, data);
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify chunk manifest HMAC against expected value.
 */
export async function verifyChunkManifest(
  chunkHashes: string[],
  key: CryptoKey,
  expectedManifest: string,
): Promise<boolean> {
  const rawKey = await crypto.subtle.exportKey('raw', key);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(chunkHashes.join(':'));
  const expectedBytes = new Uint8Array(expectedManifest.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return crypto.subtle.verify('HMAC', hmacKey, expectedBytes as BufferSource, data as BufferSource);
}

// ============ Base64url Helpers ============

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  // Restore standard base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

