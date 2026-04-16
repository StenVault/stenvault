import {
  arrayBufferToBase64,
  toArrayBuffer,
} from '@stenvault/shared/platform/crypto';
import type { CVEFSignatureMetadata } from '@stenvault/shared/platform/crypto';
import type { HybridEncryptionOptions } from './types';
import { sha256 } from './helpers';

/**
 * Sign coreMetadataBytes at encrypt time using hybrid signature provider.
 * Returns CVEFSignatureMetadata for the second header block.
 */
export async function signCoreMetadata(
  coreMetadataBytes: Uint8Array,
  signing: NonNullable<HybridEncryptionOptions['signing']>,
): Promise<CVEFSignatureMetadata> {
  const { getHybridSignatureProvider } = await import('@/lib/platform/webHybridSignatureProvider');
  const signatureProvider = getHybridSignatureProvider();

  // Generate signedAt before hashing so it's bound to the signature
  const signedAt = Date.now();

  // Hash includes attribution fields to prevent forgery in verify-only scenarios:
  // attacker can't swap signerFingerprint/signedAt without invalidating the signature
  const hash = await buildSignatureHash(coreMetadataBytes, signing.fingerprint, signing.keyVersion, signedAt);
  const signature = await signatureProvider.sign(hash, signing.secretKey, 'FILE');

  return {
    signatureAlgorithm: 'ed25519-ml-dsa-65',
    classicalSignature: arrayBufferToBase64(toArrayBuffer(signature.classical)),
    pqSignature: arrayBufferToBase64(toArrayBuffer(signature.postQuantum)),
    signingContext: 'FILE',
    signedAt,
    signerFingerprint: signing.fingerprint,
    signerKeyVersion: signing.keyVersion,
  };
}

/**
 * Build the hash input for v1.4 signature, binding attribution fields.
 *
 * hash = SHA-256(coreMetadataBytes || fingerprint || keyVersion(4B BE) || signedAt(8B BE))
 *
 * This prevents an attacker from re-signing coreMetadataBytes with their own key
 * and swapping signerFingerprint, because the hash would be different.
 */
export async function buildSignatureHash(
  coreMetadataBytes: Uint8Array,
  fingerprint: string,
  keyVersion: number,
  signedAt: number,
): Promise<Uint8Array> {
  const fingerprintBytes = new TextEncoder().encode(fingerprint);
  const versionBuf = new Uint8Array(4);
  new DataView(versionBuf.buffer).setUint32(0, keyVersion, false);
  const timestampBuf = new Uint8Array(8);
  const tsView = new DataView(timestampBuf.buffer);
  // Split signedAt (ms since epoch) into two 32-bit words for BE encoding
  tsView.setUint32(0, Math.floor(signedAt / 0x100000000), false);
  tsView.setUint32(4, signedAt >>> 0, false);

  const combined = new Uint8Array(
    coreMetadataBytes.length + fingerprintBytes.length + 4 + 8,
  );
  let offset = 0;
  combined.set(coreMetadataBytes, offset); offset += coreMetadataBytes.length;
  combined.set(fingerprintBytes, offset); offset += fingerprintBytes.length;
  combined.set(versionBuf, offset); offset += 4;
  combined.set(timestampBuf, offset);

  return sha256(combined);
}
