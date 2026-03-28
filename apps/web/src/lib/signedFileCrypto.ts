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
  hasValidSignature,
  parseCVEFHeader,
} from '@stenvault/shared/platform/crypto';

// ============ Constants ============

/** Max bytes to read when parsing CVEF header (metadata < 2KB typically) */
const CVEF_HEADER_READ_SIZE = 10_000;

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
 * Verify signature on an encrypted v1.3 file
 *
 * Checks that the hybrid signature is valid for the encrypted content.
 */
export async function verifySignedFile(
  signedBlob: Blob,
  options: VerificationOptions
): Promise<SignatureVerificationResult> {
  const { publicKey } = options;

  try {
    const fileData = await signedBlob.arrayBuffer();
    const fileBytes = new Uint8Array(fileData);
    const { metadata, dataOffset } = parseCVEFHeader(fileBytes);

    if (!isCVEFMetadataV1_3(metadata)) {
      return {
        valid: false,
        classicalValid: false,
        postQuantumValid: false,
        error: 'File is not CVEF v1.3 format (no signature)',
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
 * Check if a file has a valid v1.3 signature (quick metadata check, no full verification)
 */
export async function fileHasSignature(blob: Blob): Promise<boolean> {
  try {
    const headerData = await blob.slice(0, CVEF_HEADER_READ_SIZE).arrayBuffer();
    const headerBytes = new Uint8Array(headerData);
    const { metadata } = parseCVEFHeader(headerBytes);
    return isCVEFMetadataV1_3(metadata) && hasValidSignature(metadata);
  } catch {
    return false;
  }
}

/**
 * Get signature info from v1.3 file without full verification
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
    const { metadata } = parseCVEFHeader(headerBytes);

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
 * Compute SHA-256 hash of a file's encrypted content (hex string)
 */
export async function computeFileContentHash(blob: Blob): Promise<string> {
  const headerData = await blob.slice(0, CVEF_HEADER_READ_SIZE).arrayBuffer();
  const headerBytes = new Uint8Array(headerData);
  const { dataOffset } = parseCVEFHeader(headerBytes);

  const contentData = await blob.slice(dataOffset).arrayBuffer();
  const hash = await sha256(contentData);

  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
