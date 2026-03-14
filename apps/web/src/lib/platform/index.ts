/**
 * Platform Providers - Web Implementation
 *
 * Barrel exports for all web platform providers and shared crypto utilities.
 */

// Argon2 Provider (Phase 0 Sovereign - new KDF)
export {
    WebArgon2Provider,
    getArgon2Provider,
    createArgon2Provider,
} from './webArgon2Provider';

// Key Wrap Provider (Phase 0 Sovereign - master key wrapping)
export {
    WebKeyWrapProvider,
    getKeyWrapProvider,
    createKeyWrapProvider,
} from './webKeyWrapProvider';

// Hybrid KEM Provider (Phase 1 Sovereign - post-quantum encryption)
export {
    WebHybridKemProvider,
    getHybridKemProvider,
    createHybridKemProvider,
} from './webHybridKemProvider';

// Download Provider
export {
    WebDownloadProvider,
    getDownloadProvider,
    createDownloadProvider,
    downloadBase64File,
    downloadBlobFile,
} from './webDownloadProvider';

// Streaming Download (Tier 1/2/3)
export {
    streamDownloadToDisk,
    detectStreamingTier,
    fallbackBlobDownload,
} from './streamingDownload';
export { isFileSystemAccessAvailable, streamToFileSystem } from './fileSystemAccessProvider';
export { isServiceWorkerStreamingAvailable, streamViaServiceWorker } from './swDownloadProvider';

// Re-export types from shared for convenience
export type {
    CryptoKeyLike,
    DerivedKeyResult,
    AESEncryptResult,
    RSAKeyPair,
    ECDHKeyPair,
    Argon2Provider,
    Argon2Params,
    Argon2DeriveResult,
    KeyWrapProvider,
    KeyWrapResult,
    KeyUnwrapResult,
    MasterKeyMetadata,
    HybridKemProvider,
    HybridKeyPair,
    HybridPublicKey,
    HybridSecretKey,
    HybridCiphertext,
    HybridEncapsulationResult,
    HybridPublicKeySerialized,
    HybridCiphertextSerialized,
} from '@cloudvault/shared/platform/crypto';

export type {
    DownloadProvider,
    DownloadOptions,
    DownloadResult,
    StreamingDownloadProgress,
    StreamingDownloadOptions,
    StreamingTier,
    StreamingDownloadResult,
} from '@cloudvault/shared/platform/download';

// Re-export utilities
export {
    arrayBufferToBase64,
    base64ToArrayBuffer,
    toArrayBuffer,
    base64ToUint8Array,
    arrayBufferToHex,
    hexToArrayBuffer,
    deriveChunkIV,
    formatFingerprint,
    CRYPTO_CONSTANTS,
    ARGON2_PARAMS,
    ARGON2_PARAMS_CONSTRAINED,
    KEY_WRAP_CONSTANTS,
    HYBRID_KEM_SIZES,
    HYBRID_KEM_ALGORITHMS,
    HYBRID_KEM_HKDF_INFO,
    validateArgon2Params,
    mergeArgon2Params,
    validateHybridPublicKey,
    validateHybridSecretKey,
    validateHybridCiphertext,
    serializeHybridPublicKey,
    deserializeHybridPublicKey,
    serializeHybridCiphertext,
    deserializeHybridCiphertext,
} from '@cloudvault/shared/platform/crypto';
