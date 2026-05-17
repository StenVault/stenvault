// @stenvault/aead-stream
//
// Per-chunk AEAD streaming primitive (AES-256-GCM with deterministic
// per-chunk IVs derived from a base IV + chunk index).
//
// Consumers today: vault CVEF (hybridFile/*) and Public Send. Both rely
// on the same IV-derivation contract so that a chunk re-encrypted with
// the same key + base IV + index produces byte-identical ciphertext —
// a prerequisite for resumable uploads and cross-implementation parity.
//
// This package intentionally has no internal dependencies. It must stay
// framework-agnostic (Node, browser, service worker) and must not reach
// back into @stenvault/shared or any app-specific module.

export { GCM_IV_LENGTH, DERIVE_IV_BASE_LENGTH, AUTH_TAG_SIZE } from "./constants";
export { deriveChunkIV, deriveSendChunkIV } from "./iv";
export {
    encryptChunk,
    decryptChunk,
    encryptSendChunk,
    decryptSendChunk,
    hashEncryptedChunk,
} from "./chunk";
export { BufferedStreamReader } from "./reader";
