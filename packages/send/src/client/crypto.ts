/// <reference lib="dom" />
/**
 * Public Send — Client-side AES-256-GCM crypto helpers.
 *
 * Intentionally simpler than main-app vault crypto (no Master Key, no CVEF,
 * no PQC). Just AES-256-GCM with a random key per file, zero friction for
 * anonymous users. The per-chunk AEAD primitive comes from
 * @stenvault/aead-stream; the fragment-key format from @stenvault/send/core.
 *
 * V2 chunk format: [ciphertext + 16-byte auth tag] (IV derived from
 * baseIv + chunkIndex). V2 uses deriveChunkIV for structural anti-reordering:
 * swapping chunks causes GCM auth failure since each chunk's IV is bound
 * to its position.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from "@stenvault/shared/platform/crypto";
import { SEND_PART_SIZE } from "@stenvault/shared";
import {
    encryptChunk,
    decryptChunk,
    encryptSendChunk,
    decryptSendChunk,
    hashEncryptedChunk,
} from "@stenvault/aead-stream";
import {
    generateSendKey,
    keyToFragment,
    fragmentToKey,
} from "@stenvault/send/core/fragment";
import type { BundleManifest } from "@stenvault/send/core";

// Re-export so consumers have one canonical import for the Send client surface.
export { SEND_PART_SIZE };
export { encryptChunk, decryptChunk, encryptSendChunk, decryptSendChunk, hashEncryptedChunk };
export { generateSendKey, keyToFragment, fragmentToKey };

const IV_LENGTH = 12;
const AUTH_TAG_SIZE = 16;

/** Encryption overhead per chunk: auth tag only (IV derived from baseIv + chunkIndex). */
export const SEND_ENCRYPTION_OVERHEAD = AUTH_TAG_SIZE;

/**
 * Encrypt the receiver-facing bundle manifest with AES-GCM under the
 * session key. The V2 manifest shape (see {@link BundleManifest}) lists
 * every file's plaintext name + size + type. Only the receiver (who has
 * the session key from the URL fragment) can read it.
 */
export async function encryptMetadata(
    manifest: BundleManifest,
    key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(JSON.stringify(manifest));

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
 * Decrypt the V2 bundle manifest back to {@link BundleManifest}.
 */
export async function decryptMetadata(
    ciphertext: string,
    iv: string,
    key: CryptoKey,
): Promise<BundleManifest> {
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(iv)) as BufferSource },
        key,
        new Uint8Array(base64ToArrayBuffer(ciphertext)) as BufferSource,
    );

    return JSON.parse(new TextDecoder().decode(decrypted)) as BundleManifest;
}

/**
 * Generate a random base IV for chunk IV derivation.
 * One baseIv per send session — stored alongside session metadata.
 */
export function generateBaseIv(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Get the encrypted size of a chunk given its original size.
 */
export function getEncryptedChunkSize(originalSize: number): number {
    return originalSize + SEND_ENCRYPTION_OVERHEAD;
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
 * Derive a purpose-separated HMAC key from the send AES-GCM key via HKDF.
 * Prevents key reuse across encryption and integrity domains (NIST SP 800-108).
 */
async function deriveManifestHmacKey(
    key: CryptoKey,
    usage: "sign" | "verify",
): Promise<CryptoKey> {
    const rawKey = await crypto.subtle.exportKey("raw", key);
    const hkdfKey = await crypto.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveKey"]);
    new Uint8Array(rawKey).fill(0);
    return crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("stenvault-send-manifest-v1"),
            info: new Uint8Array(0),
        },
        hkdfKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        [usage],
    );
}

/**
 * Compute HMAC-SHA256 over concatenated chunk hashes using an HKDF-derived key.
 * This proves that all chunks belong together and haven't been tampered with.
 */
export async function computeChunkManifest(
    chunkHashes: string[],
    key: CryptoKey,
): Promise<string> {
    const hmacKey = await deriveManifestHmacKey(key, "sign");
    const data = new TextEncoder().encode(chunkHashes.join(":"));
    const sig = await crypto.subtle.sign("HMAC", hmacKey, data);
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Verify chunk manifest HMAC against expected value.
 */
export async function verifyChunkManifest(
    chunkHashes: string[],
    key: CryptoKey,
    expectedManifest: string,
): Promise<boolean> {
    const hmacKey = await deriveManifestHmacKey(key, "verify");
    const data = new TextEncoder().encode(chunkHashes.join(":"));
    const expectedBytes = new Uint8Array(expectedManifest.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    return crypto.subtle.verify("HMAC", hmacKey, expectedBytes as BufferSource, data as BufferSource);
}
