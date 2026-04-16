import {
  parseCVEFHeader,
  isCVEFMetadataV1_2,
  isCVEFMetadataV1_3,
  isCVEFMetadataV1_4,
  type CVEFMetadata,
} from '@stenvault/shared/platform/crypto';

/**
 * Check if encrypted data is in hybrid format (CVEF v1.2, v1.3, or v1.4)
 */
export function isHybridEncrypted(data: ArrayBuffer): boolean {
  try {
    const dataView = new Uint8Array(data);
    const { metadata } = parseCVEFHeader(dataView);
    return isCVEFMetadataV1_2(metadata) || isCVEFMetadataV1_3(metadata) || isCVEFMetadataV1_4(metadata);
  } catch {
    return false;
  }
}

/**
 * Get metadata from encrypted file
 */
export function getEncryptionMetadata(data: ArrayBuffer): CVEFMetadata {
  const dataView = new Uint8Array(data);
  const { metadata } = parseCVEFHeader(dataView);
  return metadata;
}
