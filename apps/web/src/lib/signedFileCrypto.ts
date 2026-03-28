/**
 * Signed File Cryptography
 *
 * Provides hybrid digital signature verification for CVEF files.
 *
 * - v1.3 files: signature embedded in metadata (signatureParams), verified via SHA-256(ciphertext)
 * - v1.4 files: signature in separate header block, verified via SHA-256(coreMetadataBytes)
 *   (v1.4 verification happens in hybridFileCrypto.ts at decrypt time)
 *
 * @module signedFileCrypto
 */

import { getHybridSignatureProvider } from '@/lib/platform/webHybridSignatureProvider';
import { base64ToArrayBuffer } from '@/lib/platform';
import type {
  HybridSignaturePublicKey,
  HybridSignature,
  SignatureContext,
} from '@stenvault/shared/platform/crypto';
import {
  isCVEFMetadataV1_3,
  isCVEFMetadataV1_4,
  hasValidSignature,
  hasValidSignatureMetadata,
  parseCVEFHeader,
} from '@stenvault/shared/platform/crypto';
import { toArrayBuffer } from '@stenvault/shared/platform/crypto';
import { buildSignatureHash } from './hybridFileCrypto';

// ============ Constants ============

/**
 * Max bytes to read when parsing CVEF header.
 * v1.4 container v2 headers with ML-DSA-65 signatures can reach ~6KB,
 * so we read 20KB to be safe.
 */
const CVEF_HEADER_READ_SIZE = 20_000;

// ============ Types ============

export interface VerificationOptions {
  /** User's signature public key */
  publicKey: HybridSignaturePublicKey;
}

export interface SignatureVerificationResult {
  valid: boolean;
  classicalValid: boolean;
  postQuantumValid: boolean;
  signedAt?: number;
  signerFingerprint?: string;
  signerKeyVersion?: number;
  error?: string;
}

// ============ Helper Functions ============

async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

function extractEncryptedContent(fileData: ArrayBuffer, dataOffset: number): ArrayBuffer {
  return fileData.slice(dataOffset);
}

// ============ Verification Functions ============

/**
 * Verify signature on an encrypted file (v1.3 or v1.4)
 *
 * - v1.3: signature embedded in metadata, verified via SHA-256(encrypted content)
 * - v1.4: signature in separate header block, verified via SHA-256(coreMetadataBytes)
 */
export async function verifySignedFile(
  signedBlob: Blob,
  options: VerificationOptions
): Promise<SignatureVerificationResult> {
  const { publicKey } = options;

  try {
    const fileData = await signedBlob.arrayBuffer();
    const fileBytes = new Uint8Array(fileData);
    const parsed = parseCVEFHeader(fileBytes);
    const { metadata, dataOffset, coreMetadataBytes, signatureMetadata } = parsed;

    // ── v1.4: signature in separate header block ──
    if (isCVEFMetadataV1_4(metadata)) {
      if (!hasValidSignatureMetadata(signatureMetadata)) {
        return {
          valid: false,
          classicalValid: false,
          postQuantumValid: false,
          error: 'v1.4 file has no valid signature metadata',
        };
      }

      const sig = signatureMetadata!;

      if (sig.signingContext !== 'FILE' && sig.signingContext !== 'TIMESTAMP' && sig.signingContext !== 'SHARE') {
        return {
          valid: false,
          classicalValid: false,
          postQuantumValid: false,
          error: `Invalid signing context: ${sig.signingContext}`,
        };
      }

      const metadataHash = await buildSignatureHash(coreMetadataBytes, sig.signerFingerprint, sig.signerKeyVersion, sig.signedAt);

      const signature: HybridSignature = {
        classical: new Uint8Array(base64ToArrayBuffer(sig.classicalSignature)),
        postQuantum: new Uint8Array(base64ToArrayBuffer(sig.pqSignature)),
        context: sig.signingContext,
        signedAt: sig.signedAt,
      };

      const signatureProvider = getHybridSignatureProvider();
      const result = await signatureProvider.verify(metadataHash, signature, publicKey);

      return {
        valid: result.valid,
        classicalValid: result.classicalValid,
        postQuantumValid: result.postQuantumValid,
        signedAt: sig.signedAt,
        signerFingerprint: sig.signerFingerprint,
        signerKeyVersion: sig.signerKeyVersion,
        error: result.error,
      };
    }

    // ── v1.3: signature embedded in metadata ──
    if (!isCVEFMetadataV1_3(metadata)) {
      return {
        valid: false,
        classicalValid: false,
        postQuantumValid: false,
        error: 'File is not a signed format (CVEF v1.3 or v1.4 required)',
      };
    }

    if (!hasValidSignature(metadata)) {
      return {
        valid: false,
        classicalValid: false,
        postQuantumValid: false,
        error: 'File has no valid signature params',
      };
    }

    const sigParams = metadata.signatureParams!;

    if (sigParams.signatureAlgorithm !== 'ed25519-ml-dsa-65') {
      return {
        valid: false,
        classicalValid: false,
        postQuantumValid: false,
        error: 'File has no hybrid signature (algorithm: ' + sigParams.signatureAlgorithm + ')',
      };
    }

    const encryptedContent = extractEncryptedContent(fileData, dataOffset);
    const contentHash = await sha256(encryptedContent);

    const signature: HybridSignature = {
      classical: new Uint8Array(base64ToArrayBuffer(sigParams.classicalSignature)),
      postQuantum: new Uint8Array(base64ToArrayBuffer(sigParams.pqSignature)),
      context: sigParams.signingContext,
      signedAt: sigParams.signedAt,
    };

    const signatureProvider = getHybridSignatureProvider();
    const result = await signatureProvider.verify(contentHash, signature, publicKey);

    return {
      valid: result.valid,
      classicalValid: result.classicalValid,
      postQuantumValid: result.postQuantumValid,
      signedAt: sigParams.signedAt,
      signerFingerprint: sigParams.signerFingerprint,
      signerKeyVersion: sigParams.signerKeyVersion,
      error: result.error,
    };
  } catch (error) {
    return {
      valid: false,
      classicalValid: false,
      postQuantumValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Verify signature against content hash directly (used by v1.4 decrypt path)
 */
export async function verifyContentHash(
  contentHash: Uint8Array,
  signature: HybridSignature,
  publicKey: HybridSignaturePublicKey
): Promise<SignatureVerificationResult> {
  try {
    const signatureProvider = getHybridSignatureProvider();
    const result = await signatureProvider.verify(contentHash, signature, publicKey);

    return {
      valid: result.valid,
      classicalValid: result.classicalValid,
      postQuantumValid: result.postQuantumValid,
      signedAt: signature.signedAt,
      error: result.error,
    };
  } catch (error) {
    return {
      valid: false,
      classicalValid: false,
      postQuantumValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============ Utility Functions ============

/**
 * Check if a file has a valid signature (v1.3 or v1.4, quick metadata check)
 */
export async function fileHasSignature(blob: Blob): Promise<boolean> {
  try {
    const headerData = await blob.slice(0, CVEF_HEADER_READ_SIZE).arrayBuffer();
    const headerBytes = new Uint8Array(headerData);
    const { metadata, signatureMetadata } = parseCVEFHeader(headerBytes);

    // v1.4: signature in separate header block
    if (isCVEFMetadataV1_4(metadata)) {
      return hasValidSignatureMetadata(signatureMetadata);
    }

    // v1.3: signature embedded in metadata
    return isCVEFMetadataV1_3(metadata) && hasValidSignature(metadata);
  } catch {
    return false;
  }
}

/**
 * Get signature info from file without full verification (v1.3 or v1.4)
 */
export async function getSignatureInfo(
  blob: Blob
): Promise<{
  signerFingerprint: string;
  signerKeyVersion: number;
  signedAt: number;
  context: SignatureContext;
} | null> {
  try {
    const headerData = await blob.slice(0, CVEF_HEADER_READ_SIZE).arrayBuffer();
    const headerBytes = new Uint8Array(headerData);
    const { metadata, signatureMetadata } = parseCVEFHeader(headerBytes);

    // v1.4: signature in separate header block
    if (isCVEFMetadataV1_4(metadata) && hasValidSignatureMetadata(signatureMetadata)) {
      const sig = signatureMetadata!;
      return {
        signerFingerprint: sig.signerFingerprint,
        signerKeyVersion: sig.signerKeyVersion,
        signedAt: sig.signedAt,
        context: sig.signingContext,
      };
    }

    // v1.3: signature embedded in metadata
    if (!isCVEFMetadataV1_3(metadata) || !metadata.signatureParams) {
      return null;
    }

    const sig = metadata.signatureParams;
    return {
      signerFingerprint: sig.signerFingerprint,
      signerKeyVersion: sig.signerKeyVersion,
      signedAt: sig.signedAt,
      context: sig.signingContext,
    };
  } catch {
    return null;
  }
}

/**
 * Compute SHA-256 hash of the signed data for a CVEF file (hex string).
 *
 * - v1.4: hashes coreMetadataBytes (signature covers metadata, not content)
 * - v1.2/v1.3: hashes encrypted content (everything after header)
 */
export async function computeFileContentHash(blob: Blob): Promise<string> {
  const headerData = await blob.slice(0, CVEF_HEADER_READ_SIZE).arrayBuffer();
  const headerBytes = new Uint8Array(headerData);
  const { metadata, dataOffset, coreMetadataBytes } = parseCVEFHeader(headerBytes);

  let hash: Uint8Array;
  if (isCVEFMetadataV1_4(metadata)) {
    hash = await sha256(toArrayBuffer(coreMetadataBytes));
  } else {
    const contentData = await blob.slice(dataOffset).arrayBuffer();
    hash = await sha256(contentData);
  }

  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
