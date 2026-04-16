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

export interface HybridEncryptionOptions {
  /** User's hybrid public key for encryption */
  publicKey: HybridPublicKey;
  /** Progress callback */
  onProgress?: (progress: EncryptionProgress) => void;
  /** Optional signing — sign at encrypt time (v1.4 two-block header) */
  signing?: SigningOptions;
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
}
