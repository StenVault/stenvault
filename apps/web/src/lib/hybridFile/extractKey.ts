import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getKeyWrapProvider } from '@/lib/platform/webKeyWrapProvider';
import {
  base64ToArrayBuffer,
} from '@stenvault/shared/platform/crypto';
import type { HybridCiphertext, HybridSecretKey } from '@stenvault/shared/platform/crypto';
import {
  isCVEFMetadataV1_2,
  isCVEFMetadataV1_3,
  isCVEFMetadataV1_4,
} from '@stenvault/shared/platform/crypto';
import type { CVEFMetadata } from '@stenvault/shared/platform/crypto';
import { parseCVEFHeaderFromStream } from '../streamingDecrypt';

export interface ExtractedFileKey {
  /** Raw 32-byte file key */
  fileKeyBytes: Uint8Array;
  /** Zeroes the key bytes in memory */
  zeroBytes: () => void;
}

export interface ExtractedFileKeyWithMetadata extends ExtractedFileKey {
  /** Parsed CVEF metadata (contains iv, chunked info, pqcParams) */
  metadata: CVEFMetadata;
  /** Full header bytes (used as AAD for v1.4) */
  headerBytes: Uint8Array;
  /** Total encrypted file size from R2 Content-Length */
  encryptedFileSize: number;
}

/**
 * Extract the raw 32-byte file key from a V4 (hybrid) encrypted file.
 *
 * This fetches only the CVEF header from the presigned URL to extract
 * the wrapped file key, then unwraps it using the user's hybrid secret key.
 * The file content itself is NOT decrypted -- only the file key is returned.
 *
 * Used by the sharing system to re-wrap the file key for recipients.
 */
export async function extractV4FileKey(
  presignedUrl: string,
  secretKey: HybridSecretKey,
): Promise<ExtractedFileKey> {
  const controller = new AbortController();
  const response = await fetch(presignedUrl, { signal: controller.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch file header: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Response body is null — streaming not supported');
  }

  const { metadata } = await parseCVEFHeaderFromStream(response.body);
  controller.abort();

  // Verify it's a hybrid file
  if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata) && !isCVEFMetadataV1_4(metadata)) {
    throw new Error('Not a V4 hybrid-encrypted file (CVEF v1.2/v1.3/v1.4 required)');
  }

  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  const hybridCiphertext: HybridCiphertext = {
    classical: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.classicalCiphertext)),
    postQuantum: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.pqCiphertext)),
  };

  const sharedSecret = await hybridKem.decapsulate(hybridCiphertext, secretKey);
  try {
    const wrappedFileKey = new Uint8Array(
      base64ToArrayBuffer(metadata.pqcParams.wrappedFileKey)
    );
    const { masterKey: fileKey } = await keyWrap.unwrap(wrappedFileKey, sharedSecret, 1);

    return {
      fileKeyBytes: fileKey,
      zeroBytes: () => fileKey.fill(0),
    };
  } finally {
    sharedSecret.fill(0);
  }
}

/**
 * Extract file key AND metadata from a V4 hybrid encrypted file.
 *
 * Same as extractV4FileKey but also returns metadata (iv, chunk info)
 * and headerBytes (AAD). Used by the streaming video SW provider to
 * avoid double-fetching the CVEF header.
 */
export async function extractV4FileKeyWithMetadata(
  presignedUrl: string,
  secretKey: HybridSecretKey,
): Promise<ExtractedFileKeyWithMetadata> {
  // Fetch only the first 16KB to extract the CVEF header (typically ~2KB).
  // This avoids starting a download of the entire multi-GB file just for the header.
  const HEADER_RANGE_BYTES = 16384;
  const controller = new AbortController();
  const response = await fetch(presignedUrl, {
    signal: controller.signal,
    headers: { Range: `bytes=0-${HEADER_RANGE_BYTES - 1}` },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch file header: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Response body is null — streaming not supported');
  }

  // Get total encrypted file size from Content-Range (206) or Content-Length (200 fallback)
  let encryptedFileSize: number;
  if (response.status === 206) {
    const contentRange = response.headers.get('Content-Range') || '';
    const totalMatch = contentRange.match(/\/(\d+)$/);
    encryptedFileSize = totalMatch?.[1] ? parseInt(totalMatch[1], 10) : 0;
  } else {
    encryptedFileSize = parseInt(response.headers.get('Content-Length') || '0', 10);
  }

  const { metadata, headerBytes } = await parseCVEFHeaderFromStream(response.body);
  controller.abort();

  if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata) && !isCVEFMetadataV1_4(metadata)) {
    throw new Error('Not a V4 hybrid-encrypted file (CVEF v1.2/v1.3/v1.4 required)');
  }

  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  const hybridCiphertext: HybridCiphertext = {
    classical: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.classicalCiphertext)),
    postQuantum: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.pqCiphertext)),
  };

  const sharedSecret = await hybridKem.decapsulate(hybridCiphertext, secretKey);
  try {
    const wrappedFileKey = new Uint8Array(
      base64ToArrayBuffer(metadata.pqcParams.wrappedFileKey)
    );
    const { masterKey: fileKey } = await keyWrap.unwrap(wrappedFileKey, sharedSecret, 1);

    return {
      fileKeyBytes: fileKey,
      zeroBytes: () => fileKey.fill(0),
      metadata,
      headerBytes,
      encryptedFileSize,
    };
  } finally {
    sharedSecret.fill(0);
  }
}
