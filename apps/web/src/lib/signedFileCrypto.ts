/**
 * Signed File Cryptography (Phase 3.4 Sovereign)
 *
 * Provides hybrid digital signatures for files using Ed25519 + ML-DSA-65.
 * This module extends the existing hybrid encryption with non-repudiation signatures.
 *
 * Architecture:
 * ```
 * Encrypted File (CVEF v1.2)
 *         ↓
 *     SHA-256 Hash
 *         ↓
 * ┌───────┴───────┐
 * │               │
 * Ed25519       ML-DSA-65
 * (64 bytes)   (3309 bytes)
 * │               │
 * └───────┬───────┘
 *         ↓
 * CVEF v1.3 Metadata (adds signatureParams)
 * ```
 *
 * The signature is computed over the encrypted content (zero-knowledge),
 * not the plaintext. This provides proof that:
 * 1. The signer possessed the file at signing time
 * 2. The file has not been modified since signing
 * 3. The signer cannot deny having signed
 *
 * @module signedFileCrypto
 */

import { getHybridSignatureProvider } from '@/lib/platform/webHybridSignatureProvider';
import { arrayBufferToBase64, base64ToArrayBuffer, toArrayBuffer } from '@/lib/platform';
import type {
  HybridSignatureSecretKey,
  HybridSignaturePublicKey,
  HybridSignature,
  SignatureContext,
} from '@cloudvault/shared/platform/crypto';
import {
  createCVEFMetadataV1_3,
  addSignatureToMetadata,
  isCVEFMetadataV1_3,
  hasValidSignature,
  parseCVEFHeader,
  createCVEFHeader,
  type CVEFMetadataV1_2,
  type CVEFMetadataV1_3,
  type CVEFSignatureParamsV1_3,
} from '@cloudvault/shared/platform/crypto';


/**
 * Maximum bytes to read when parsing CVEF header.
 * This should be larger than any reasonable metadata size but small enough
 * to avoid reading too much of large files.
 *
 * Current value: 10KB (metadata is typically < 2KB, max allowed is 2MB)
 */
const CVEF_HEADER_READ_SIZE = 10_000;


export interface SigningOptions {
  /** User's signature secret key (client-side, decrypted) */
  secretKey: HybridSignatureSecretKey;
  /** Key fingerprint for verification reference */
  fingerprint: string;
  /** Key version at signing time */
  keyVersion: number;
  /** Signing context (default: FILE) */
  context?: SignatureContext;
}

export interface VerificationOptions {
  /** User's signature public key */
  publicKey: HybridSignaturePublicKey;
}

export interface SignedFileResult {
  /** Signed file blob with CVEF v1.3 header */
  blob: Blob;
  /** CVEF v1.3 metadata with signature */
  metadata: CVEFMetadataV1_3;
  /** Signature details */
  signature: HybridSignature;
}

export interface SignatureVerificationResult {
  /** Overall signature validity */
  valid: boolean;
  /** Ed25519 signature valid */
  classicalValid: boolean;
  /** ML-DSA-65 signature valid */
  postQuantumValid: boolean;
  /** Signing timestamp (if valid) */
  signedAt?: number;
  /** Signer fingerprint (if valid) */
  signerFingerprint?: string;
  /** Signer key version (if valid) */
  signerKeyVersion?: number;
  /** Error message (if invalid) */
  error?: string;
}


/**
 * Compute SHA-256 hash of data
 */
async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/**
 * Extract encrypted content from CVEF file (everything after header)
 */
function extractEncryptedContent(
  fileData: ArrayBuffer,
  dataOffset: number
): ArrayBuffer {
  return fileData.slice(dataOffset);
}


/**
 * Sign an already-encrypted file
 *
 * Takes a CVEF v1.2 encrypted file and adds a hybrid signature,
 * upgrading it to CVEF v1.3 format.
 *
 * @param encryptedBlob - Encrypted file blob (CVEF v1.2)
 * @param options - Signing options with secret key
 * @returns Signed file with CVEF v1.3 header
 */
export async function signEncryptedFile(
  encryptedBlob: Blob,
  options: SigningOptions
): Promise<SignedFileResult> {
  const { secretKey, fingerprint, keyVersion, context = 'FILE' } = options;

  // Read encrypted file
  const fileData = await encryptedBlob.arrayBuffer();
  const fileBytes = new Uint8Array(fileData);

  // Parse existing CVEF header
  const { metadata: existingMetadata, dataOffset } = parseCVEFHeader(fileBytes);

  // Extract encrypted content (what we'll sign)
  const encryptedContent = extractEncryptedContent(fileData, dataOffset);

  // Compute SHA-256 hash of encrypted content
  const contentHash = await sha256(encryptedContent);

  // Get signature provider
  const signatureProvider = getHybridSignatureProvider();

  // Sign the hash
  const signature = await signatureProvider.sign(contentHash, secretKey, context);

  // Create signature params for CVEF v1.3
  const signatureParams: CVEFSignatureParamsV1_3 = {
    signatureAlgorithm: 'ed25519-ml-dsa-65',
    classicalSignature: arrayBufferToBase64(toArrayBuffer(signature.classical)),
    pqSignature: arrayBufferToBase64(toArrayBuffer(signature.postQuantum)),
    signingContext: context,
    signedAt: signature.signedAt,
    signerFingerprint: fingerprint,
    signerKeyVersion: keyVersion,
  };

  // Add signature to metadata (v1.2 upgrades to v1.3, v1.3 gets updated)
  let newMetadata: CVEFMetadataV1_3;

  if (isCVEFMetadataV1_3(existingMetadata)) {
    // Already v1.3, just update signature
    newMetadata = {
      ...existingMetadata,
      signatureParams,
    };
  } else {
    // Upgrade from v1.2
    newMetadata = addSignatureToMetadata(
      existingMetadata as CVEFMetadataV1_2,
      signatureParams
    );
  }

  // Create new CVEF header
  const newHeader = createCVEFHeader(newMetadata);

  // Combine new header with original encrypted content
  const signedBlob = new Blob(
    [toArrayBuffer(newHeader), encryptedContent],
    { type: 'application/octet-stream' }
  );

  return {
    blob: signedBlob,
    metadata: newMetadata,
    signature,
  };
}

/**
 * Sign file content hash directly
 *
 * Use this when you have the hash already (e.g., from streaming encryption).
 *
 * @param contentHash - SHA-256 hash of encrypted content
 * @param options - Signing options
 * @returns Hybrid signature
 */
export async function signContentHash(
  contentHash: Uint8Array,
  options: SigningOptions
): Promise<HybridSignature> {
  const { secretKey, context = 'FILE' } = options;

  const signatureProvider = getHybridSignatureProvider();
  return signatureProvider.sign(contentHash, secretKey, context);
}

/**
 * Create signature params from a hybrid signature
 *
 * Use this to add signature to CVEF metadata manually.
 */
export function createSignatureParams(
  signature: HybridSignature,
  fingerprint: string,
  keyVersion: number
): CVEFSignatureParamsV1_3 {
  return {
    signatureAlgorithm: 'ed25519-ml-dsa-65',
    classicalSignature: arrayBufferToBase64(toArrayBuffer(signature.classical)),
    pqSignature: arrayBufferToBase64(toArrayBuffer(signature.postQuantum)),
    signingContext: signature.context,
    signedAt: signature.signedAt,
    signerFingerprint: fingerprint,
    signerKeyVersion: keyVersion,
  };
}


/**
 * Verify signature on an encrypted file
 *
 * Checks that the signature is valid for the encrypted content.
 *
 * @param signedBlob - Signed file blob (CVEF v1.3)
 * @param options - Verification options with public key
 * @returns Verification result
 */
export async function verifySignedFile(
  signedBlob: Blob,
  options: VerificationOptions
): Promise<SignatureVerificationResult> {
  const { publicKey } = options;

  try {
    // Read file
    const fileData = await signedBlob.arrayBuffer();
    const fileBytes = new Uint8Array(fileData);

    // Parse CVEF header
    const { metadata, dataOffset } = parseCVEFHeader(fileBytes);

    // Check if file has signature (v1.3)
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

    // Verify signature algorithm is hybrid (type narrowing for discriminated union)
    if (sigParams.signatureAlgorithm !== 'ed25519-ml-dsa-65') {
      return {
        valid: false,
        classicalValid: false,
        postQuantumValid: false,
        error: 'File has no hybrid signature (algorithm: ' + sigParams.signatureAlgorithm + ')',
      };
    }

    // Extract encrypted content
    const encryptedContent = extractEncryptedContent(fileData, dataOffset);

    // Compute SHA-256 hash
    const contentHash = await sha256(encryptedContent);

    // Reconstruct signature object (sigParams is now narrowed to CVEFSignatureParamsHybrid)
    const signature: HybridSignature = {
      classical: new Uint8Array(base64ToArrayBuffer(sigParams.classicalSignature)),
      postQuantum: new Uint8Array(base64ToArrayBuffer(sigParams.pqSignature)),
      context: sigParams.signingContext,
      signedAt: sigParams.signedAt,
    };

    // Verify signature
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
 * Verify signature against content hash directly
 *
 * Use this when you have the hash already.
 *
 * @param contentHash - SHA-256 hash of encrypted content
 * @param signature - Hybrid signature to verify
 * @param publicKey - Signer's public key
 * @returns Verification result
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


/**
 * Check if a file has a valid signature
 *
 * Quick check without full verification (just checks metadata).
 *
 * @param blob - File blob to check
 * @returns True if file has signature params
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
 * Get signature info from file without full verification
 *
 * @param blob - File blob
 * @returns Signature info or null if not signed
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
 * Compute SHA-256 hash of a file's encrypted content
 *
 * Useful for signing files in chunks or verifying without loading entire file.
 *
 * @param blob - CVEF encrypted file
 * @returns SHA-256 hash as hex string
 */
export async function computeFileContentHash(blob: Blob): Promise<string> {
  // Read header to find data offset
  const headerData = await blob.slice(0, CVEF_HEADER_READ_SIZE).arrayBuffer();
  const headerBytes = new Uint8Array(headerData);
  const { dataOffset } = parseCVEFHeader(headerBytes);

  // Read encrypted content
  const contentData = await blob.slice(dataOffset).arrayBuffer();

  // Compute hash
  const hash = await sha256(contentData);

  // Convert to hex
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Remove signature from a signed file
 *
 * Downgrades from v1.3 to v1.2 format.
 *
 * @param signedBlob - Signed file (CVEF v1.3)
 * @returns Unsigned file (CVEF v1.2)
 */
export async function removeSignature(signedBlob: Blob): Promise<Blob> {
  const fileData = await signedBlob.arrayBuffer();
  const fileBytes = new Uint8Array(fileData);

  const { metadata, dataOffset } = parseCVEFHeader(fileBytes);

  if (!isCVEFMetadataV1_3(metadata)) {
    // Already unsigned
    return signedBlob;
  }

  // Remove signature; v1.3 downgrades to v1.2
  const { signatureParams, ...restFields } = metadata;
  const v12Metadata = { ...restFields, version: '1.2' } as CVEFMetadataV1_2;

  // Create new header
  const newHeader = createCVEFHeader(v12Metadata);

  // Extract encrypted content
  const encryptedContent = fileData.slice(dataOffset);

  // Combine
  return new Blob([toArrayBuffer(newHeader), encryptedContent], {
    type: 'application/octet-stream',
  });
}
