import { deriveChunkIV, deriveSendChunkIV } from "./iv";

/**
 * Encrypt a single chunk with AES-256-GCM using a derived IV.
 *
 * Output layout: `[ciphertext || 16-byte auth tag]`. The IV is NOT
 * prepended — it is derived from `baseIv` + `chunkIndex` at decrypt
 * time, so swapping chunk order fails GCM authentication.
 *
 * Deterministic for fixed `(key, baseIv, chunkIndex, chunk)` — required
 * by resumable-upload reconciliation where the same chunk must re-encrypt
 * to byte-identical output on retry.
 */
export async function encryptChunk(
    chunk: Uint8Array,
    key: CryptoKey,
    baseIv: Uint8Array,
    chunkIndex: number,
): Promise<Uint8Array> {
    const iv = deriveChunkIV(baseIv, chunkIndex);
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        chunk as BufferSource,
    );
    return new Uint8Array(encrypted);
}

/**
 * Decrypt a single chunk. Input layout matches {@link encryptChunk}'s
 * output: `[ciphertext || auth tag]`. Throws if the tag fails to verify
 * or if the IV derivation doesn't match what the sender used.
 */
export async function decryptChunk(
    encrypted: Uint8Array,
    key: CryptoKey,
    baseIv: Uint8Array,
    chunkIndex: number,
): Promise<Uint8Array> {
    const iv = deriveChunkIV(baseIv, chunkIndex);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        encrypted as BufferSource,
    );
    return new Uint8Array(decrypted);
}

/**
 * Send-V2 variant of {@link encryptChunk} that binds each chunk to both
 * its file position and its chunk index. Uses {@link deriveSendChunkIV}.
 *
 * Deterministic for fixed `(key, baseIv, fileIndex, chunkIndex, chunk)` —
 * the resume protocol relies on byte-identical re-encryption.
 */
export async function encryptSendChunk(
    chunk: Uint8Array,
    key: CryptoKey,
    baseIv: Uint8Array,
    fileIndex: number,
    chunkIndex: number,
): Promise<Uint8Array> {
    const iv = deriveSendChunkIV(baseIv, fileIndex, chunkIndex);
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        chunk as BufferSource,
    );
    return new Uint8Array(encrypted);
}

/**
 * Send-V2 variant of {@link decryptChunk}. Fails GCM authentication if
 * the declared `(fileIndex, chunkIndex)` doesn't match what the sender
 * used — the position binding is the reordering guard.
 */
export async function decryptSendChunk(
    encrypted: Uint8Array,
    key: CryptoKey,
    baseIv: Uint8Array,
    fileIndex: number,
    chunkIndex: number,
): Promise<Uint8Array> {
    const iv = deriveSendChunkIV(baseIv, fileIndex, chunkIndex);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        encrypted as BufferSource,
    );
    return new Uint8Array(decrypted);
}

/**
 * Compute SHA-256 of an encrypted chunk, returned as lowercase hex.
 * Used by chunk-manifest integrity checks.
 */
export async function hashEncryptedChunk(encrypted: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", encrypted as BufferSource);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
