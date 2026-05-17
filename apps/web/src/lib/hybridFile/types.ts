import type {
  HybridPublicKey,
  HybridSecretKey,
  HybridSignaturePublicKey,
  HybridSignatureSecretKey,
} from '@stenvault/shared/platform/crypto';
import type { CVEFMetadataV1_4, CVEFSignatureMetadata } from '@stenvault/shared/platform/crypto';

export interface SigningOptions {
  secretKey: HybridSignatureSecretKey;
  fingerprint: string;
  keyVersion: number;
}

/**
 * Pre-computed encryption material captured on the first encryption pass and
 * persisted to IndexedDB so a cross-session resume can rebuild a byte-
 * identical encrypted blob from the same plaintext file.
 *
 * Without this, a resume after a tab refresh/close would force a fresh
 * encapsulation → different ciphertext → R2 multipart parts no longer match.
 *
 * Storage shape mirrors what already lives in CVEF metadata (raw bytes here
 * for compactness — `IDBPDatabase` stores Uint8Array natively).
 */
export interface HybridEncryptionSeed {
  /** 32B AES-256 file content key. */
  fileKey: Uint8Array;
  /** 12B base IV for chunk IV derivation. */
  baseIv: Uint8Array;
  /** 40B AES-KW wrapped file key (raw, not base64). */
  wrappedFileKey: Uint8Array;
  /** 32B X25519 ephemeral ciphertext from the original encapsulation. */
  classicalCiphertext: Uint8Array;
  /** 1088B ML-KEM-768 ciphertext from the original encapsulation. */
  pqCiphertext: Uint8Array;
  /** Optional signature metadata from the first pass — re-used verbatim. */
  signatureMetadata?: CVEFSignatureMetadata;
}

export interface HybridEncryptionOptions {
  /** User's hybrid public key for encryption */
  publicKey: HybridPublicKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
  /** Optional signing — sign at encrypt time (v1.4 two-block header) */
  signing?: SigningOptions;
  /**
   * Pre-computed seed for resuming a previous encryption. When present:
   * - Skips fileKey generation, hybrid encapsulation, and AES-KW wrap
   * - Skips signing (uses the seed's `signatureMetadata` if present)
   * Result is byte-identical to the original encryption pass.
   */
  resumeSeed?: HybridEncryptionSeed;
}

export interface HybridDecryptionOptions {
  /** User's hybrid secret key for decryption */
  secretKey: HybridSecretKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
  /** Signer's public key — if provided and file is signed, signature is verified */
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
  /** CVEF v1.4 metadata (core block) */
  metadata: CVEFMetadataV1_4;
  /** Signature metadata from second header block (if signed) */
  signatureMetadata?: CVEFSignatureMetadata;
  /** Original file size */
  originalSize: number;
  /**
   * Material the caller can persist (in IndexedDB) to enable a cross-session
   * resume — passing this back as `options.resumeSeed` reproduces the same
   * encrypted blob bit-for-bit.
   *
   * The `fileKey` field MUST be wrapped with a master-key-derived KEK before
   * being persisted to any client-side store. See
   * `apps/web/src/lib/uploadResume.ts` (`saveUploadResumeRecord`) for the
   * canonical wrap. Do not write `seed.fileKey` directly to IndexedDB,
   * localStorage, or any other persistent surface.
   */
  seed: HybridEncryptionSeed;
}
