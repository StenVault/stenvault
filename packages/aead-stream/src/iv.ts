import { GCM_IV_LENGTH, DERIVE_IV_BASE_LENGTH } from "./constants";

export { GCM_IV_LENGTH, DERIVE_IV_BASE_LENGTH };

/**
 * Derive a per-chunk AES-GCM IV from a fixed base IV and a chunk index.
 *
 * Layout: `baseIv[0..DERIVE_IV_BASE_LENGTH] || be32(chunkIndex)`.
 *
 * Rationale: binding each chunk's IV to its position makes reordering
 * chunks a decryption failure (GCM tag verifies) without needing a
 * separate MAC over the chunk order. Same base IV + same index always
 * produces the same IV, which is what enables deterministic re-encryption
 * for resumable uploads.
 *
 * @param baseIv - Session base IV. Must be at least `DERIVE_IV_BASE_LENGTH` bytes.
 * @param chunkIndex - 0-based chunk index. Caller must ensure uniqueness within a session.
 * @returns A fresh `GCM_IV_LENGTH`-byte IV. Never mutates `baseIv`.
 */
export function deriveChunkIV(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
    const chunkIv = new Uint8Array(GCM_IV_LENGTH);
    chunkIv.set(baseIv.slice(0, DERIVE_IV_BASE_LENGTH));
    const indexView = new DataView(new ArrayBuffer(4));
    indexView.setUint32(0, chunkIndex, false); // big endian
    chunkIv.set(new Uint8Array(indexView.buffer), DERIVE_IV_BASE_LENGTH);
    return chunkIv;
}

/**
 * Derive a per-chunk IV for Public Send V2 bundles, binding both
 * `fileIndex` and `chunkIndex` into the IV so ciphertexts never collide
 * across files under a shared session key.
 *
 * Layout: `baseIv[0..DERIVE_IV_BASE_LENGTH] || be16(fileIndex) || be16(chunkIndex)`.
 *
 * This is deliberately a separate function from {@link deriveChunkIV} so
 * the vault path (single-file CVEF contract) stays at zero risk of crypto
 * change. The two functions produce byte-identical IVs only when
 * `fileIndex === 0` and `chunkIndex < 2^16`; for any other input they
 * diverge.
 *
 * @param baseIv - Session base IV. Must be at least `DERIVE_IV_BASE_LENGTH` bytes.
 * @param fileIndex - 0-based file position within the bundle. Max 65535.
 * @param chunkIndex - 0-based chunk index within the file. Max 65535.
 * @returns A fresh `GCM_IV_LENGTH`-byte IV. Never mutates `baseIv`.
 * @throws RangeError if either index falls outside uint16.
 */
export function deriveSendChunkIV(
    baseIv: Uint8Array,
    fileIndex: number,
    chunkIndex: number,
): Uint8Array {
    if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex > 0xffff) {
        throw new RangeError(`fileIndex must fit in uint16, got ${fileIndex}`);
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffff) {
        throw new RangeError(`chunkIndex must fit in uint16, got ${chunkIndex}`);
    }
    const chunkIv = new Uint8Array(GCM_IV_LENGTH);
    chunkIv.set(baseIv.slice(0, DERIVE_IV_BASE_LENGTH));
    const view = new DataView(chunkIv.buffer, chunkIv.byteOffset, chunkIv.byteLength);
    view.setUint16(DERIVE_IV_BASE_LENGTH, fileIndex, false);      // bytes 8..10
    view.setUint16(DERIVE_IV_BASE_LENGTH + 2, chunkIndex, false); // bytes 10..12
    return chunkIv;
}
