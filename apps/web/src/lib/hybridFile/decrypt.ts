import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getKeyWrapProvider } from '@/lib/platform/webKeyWrapProvider';
import {
  base64ToArrayBuffer,
  toArrayBuffer,
  deriveChunkIV,
} from '@stenvault/shared/platform/crypto';
import type { HybridCiphertext } from '@stenvault/shared/platform/crypto';
import {
  parseCVEFHeader,
  isCVEFMetadataV1_2,
  isCVEFMetadataV1_3,
  isCVEFMetadataV1_4,
  hasValidSignatureMetadata,
} from '@stenvault/shared/platform/crypto';
import type { HybridDecryptionOptions, EncryptionProgress } from './types';
import { toCleanUint8Array, importFileKey } from './helpers';
import { buildSignatureHash } from './signing';
import { deriveManifestHmacKey, verifyChunkManifest } from './integrity';
import { VaultError } from '@stenvault/shared/errors';

/**
 * Decrypt a hybrid-encrypted file (supports v1.2, v1.3, and v1.4)
 *
 * For v1.4: uses headerBytes as AAD for AES-GCM.
 * For v1.2/v1.3: no AAD (backward compat).
 */
export async function decryptFileHybrid(
  encryptedData: ArrayBuffer,
  options: HybridDecryptionOptions
): Promise<ArrayBuffer> {
  const { secretKey, onProgress } = options;

  // 1. Parse CVEF header
  const dataView = new Uint8Array(encryptedData);
  const { metadata, dataOffset, coreMetadataBytes, signatureMetadata, headerBytes } = parseCVEFHeader(dataView);

  // Verify it's a hybrid file
  if (!isCVEFMetadataV1_2(metadata) && !isCVEFMetadataV1_3(metadata) && !isCVEFMetadataV1_4(metadata)) {
    throw new VaultError('UNSUPPORTED_ENCRYPTION_VERSION', {
      op: 'decrypt',
      version: (metadata as { version?: unknown }).version,
    });
  }

  // 1b. Enforce signature verification: if file has a signature, require a public key (fail-closed)
  if (isCVEFMetadataV1_4(metadata) && hasValidSignatureMetadata(signatureMetadata) && !options.signerPublicKey) {
    throw new VaultError('SIGNATURE_INVALID', {
      op: 'decrypt',
      reason: 'signer_key_missing',
    });
  }

  if (isCVEFMetadataV1_4(metadata) && hasValidSignatureMetadata(signatureMetadata) && options.signerPublicKey) {
    // v1.4: verify with attribution-bound hash (fingerprint + keyVersion + signedAt in hash input)
    const sig = signatureMetadata!;
    const { verifyContentHash } = await import('../signedFileCrypto');
    const hash = await buildSignatureHash(coreMetadataBytes, sig.signerFingerprint, sig.signerKeyVersion, sig.signedAt);
    const signature = {
      classical: new Uint8Array(base64ToArrayBuffer(sig.classicalSignature)),
      postQuantum: new Uint8Array(base64ToArrayBuffer(sig.pqSignature)),
      context: sig.signingContext,
      signedAt: sig.signedAt,
    };
    const result = await verifyContentHash(hash, signature, options.signerPublicKey);
    if (!result.valid) {
      throw new VaultError('SIGNATURE_INVALID', {
        layer: 'v1.4',
        verifierError: result.error,
      });
    }
  } else if (isCVEFMetadataV1_3(metadata) && options.signerPublicKey) {
    // v1.3: legacy verification
    const { verifySignedFile } = await import('../signedFileCrypto');
    const blob = new Blob([encryptedData]);
    const result = await verifySignedFile(blob, { publicKey: options.signerPublicKey });
    if (!result.valid) {
      throw new VaultError('SIGNATURE_INVALID', {
        layer: 'v1.3',
        verifierError: result.error,
      });
    }
  }

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // 2. Reconstruct hybrid ciphertext
  const hybridCiphertext: HybridCiphertext = {
    classical: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.classicalCiphertext)),
    postQuantum: new Uint8Array(base64ToArrayBuffer(metadata.pqcParams.pqCiphertext)),
  };

  // 3. Hybrid decapsulate
  const sharedSecret = await hybridKem.decapsulate(hybridCiphertext, secretKey);
  let fileKey: Uint8Array | undefined;

  try {
    const hybridKEK = sharedSecret;

    // 4. Unwrap file key
    const wrappedFileKey = new Uint8Array(
      base64ToArrayBuffer(metadata.pqcParams.wrappedFileKey)
    );
    const unwrapResult = await keyWrap.unwrap(wrappedFileKey, hybridKEK, 1);
    fileKey = unwrapResult.masterKey;

    // 5. Decrypt file content
    const iv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
    const ciphertextData = dataView.slice(dataOffset);
    const fileKeyHandle = await importFileKey(fileKey);
    const hmacKey = metadata.chunked ? await deriveManifestHmacKey(fileKey) : undefined;

    // Determine AAD: v1.4 uses headerBytes, older versions have no AAD
    const aad = isCVEFMetadataV1_4(metadata) ? headerBytes : undefined;

    let decryptedData: ArrayBuffer;

    if (metadata.chunked) {
      const stream = decryptChunkedToStream(
        ciphertextData,
        fileKeyHandle,
        iv,
        metadata.chunked.count,
        onProgress,
        hmacKey,
        aad,
      );
      const decryptBlob = await new Response(stream).blob();
      decryptedData = await decryptBlob.arrayBuffer();
    } else {
      // Single-pass decryption
      const aadParam = aad ? { additionalData: toArrayBuffer(aad) } : {};
      try {
        decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: toCleanUint8Array(iv), ...aadParam },
          fileKeyHandle,
          toArrayBuffer(ciphertextData)
        );
      } catch {
        throw new VaultError('FILE_CORRUPT', { layer: 'body_decrypt' });
      }

      if (onProgress) {
        onProgress({
          bytesProcessed: decryptedData.byteLength,
          totalBytes: decryptedData.byteLength,
          percentage: 100,
        });
      }
    }

    return decryptedData;
  } finally {
    sharedSecret.fill(0);
    if (fileKey) fileKey.fill(0);
  }
}

/**
 * Decrypt chunked data
 */
export async function decryptChunked(
  data: Uint8Array,
  key: CryptoKey,
  baseIv: Uint8Array,
  chunkCount: number,
  onProgress?: (progress: EncryptionProgress) => void,
  hmacKey?: CryptoKey,
  headerBytes?: Uint8Array,
): Promise<ArrayBuffer> {
  const decryptedChunks: ArrayBuffer[] = [];
  const chunkHashes: ArrayBuffer[] = [];
  let offset = 0;
  let bytesDecrypted = 0;
  const aadParam = headerBytes ? { additionalData: toArrayBuffer(headerBytes) } : {};

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
    const chunkLength = lengthView.getUint32(0, false);
    offset += 4;

    const encryptedChunk = data.slice(offset, offset + chunkLength);
    offset += chunkLength;

    if (hmacKey) {
      chunkHashes.push(await crypto.subtle.digest('SHA-256', toArrayBuffer(encryptedChunk)));
    }

    const chunkIv = deriveChunkIV(baseIv, chunkIndex);

    let decryptedChunk: ArrayBuffer;
    try {
      decryptedChunk = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toCleanUint8Array(chunkIv), ...aadParam },
        key,
        toArrayBuffer(encryptedChunk)
      );
    } catch {
      throw new VaultError('FILE_CORRUPT', { layer: 'chunk_decrypt', chunkIndex });
    }

    decryptedChunks.push(decryptedChunk);
    bytesDecrypted += decryptedChunk.byteLength;

    if (onProgress) {
      onProgress({
        bytesProcessed: bytesDecrypted,
        totalBytes: bytesDecrypted,
        percentage: Math.round(((chunkIndex + 1) / chunkCount) * 100),
      });
    }
  }

  // Verify integrity manifest
  if (hmacKey) {
    const manifestLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
    const manifestLength = manifestLengthView.getUint32(0, false);
    offset += 4;
    const manifestCiphertext = data.slice(offset, offset + manifestLength);
    await verifyChunkManifest(manifestCiphertext, key, hmacKey, baseIv, chunkCount, chunkHashes, headerBytes);
  }

  // Combine decrypted chunks
  const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let resultOffset = 0;

  for (const chunk of decryptedChunks) {
    result.set(new Uint8Array(chunk), resultOffset);
    resultOffset += chunk.byteLength;
  }

  return toArrayBuffer(result);
}

/**
 * Streaming variant of decryptChunked -- yields a ReadableStream<Uint8Array>
 * instead of accumulating ArrayBuffer[]. Emits chunks immediately after
 * AES-GCM decryption (which authenticates each chunk). Trailing manifest
 * is verified at end as defense-in-depth.
 */
export function decryptChunkedToStream(
  data: Uint8Array,
  key: CryptoKey,
  baseIv: Uint8Array,
  chunkCount: number,
  onProgress?: (progress: EncryptionProgress) => void,
  hmacKey?: CryptoKey,
  headerBytes?: Uint8Array,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let offset = 0;
        let bytesDecrypted = 0;
        const chunkHashes: ArrayBuffer[] = [];
        const aadParam = headerBytes ? { additionalData: toArrayBuffer(headerBytes) } : {};

        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
          const lengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
          const chunkLength = lengthView.getUint32(0, false);
          offset += 4;

          const encryptedChunk = data.slice(offset, offset + chunkLength);
          offset += chunkLength;

          if (hmacKey) {
            chunkHashes.push(await crypto.subtle.digest('SHA-256', toArrayBuffer(encryptedChunk)));
          }

          const chunkIv = deriveChunkIV(baseIv, chunkIndex);

          let decryptedChunk: ArrayBuffer;
          try {
            decryptedChunk = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: toCleanUint8Array(chunkIv), ...aadParam },
              key,
              toArrayBuffer(encryptedChunk)
            );
          } catch {
            throw new VaultError('FILE_CORRUPT', { layer: 'chunk_decrypt_stream', chunkIndex });
          }

          const plaintext = new Uint8Array(decryptedChunk);
          bytesDecrypted += plaintext.byteLength;

          controller.enqueue(plaintext);

          if (onProgress) {
            onProgress({
              bytesProcessed: bytesDecrypted,
              totalBytes: bytesDecrypted,
              percentage: Math.round(((chunkIndex + 1) / chunkCount) * 100),
            });
          }
        }

        // Verify trailing manifest (defense-in-depth)
        if (hmacKey) {
          const manifestLengthView = new DataView(data.buffer, data.byteOffset + offset, 4);
          const manifestLength = manifestLengthView.getUint32(0, false);
          offset += 4;
          const manifestCiphertext = data.slice(offset, offset + manifestLength);
          await verifyChunkManifest(manifestCiphertext, key, hmacKey, baseIv, chunkCount, chunkHashes, headerBytes);
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Decrypt a hybrid-encrypted file from URL
 */
export async function decryptFileHybridFromUrl(
  url: string,
  options: HybridDecryptionOptions,
  mimeType: string
): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new VaultError('INFRA_NETWORK', {
      op: 'fetch_encrypted_file',
      status: response.status,
    });
  }

  const encryptedData = await response.arrayBuffer();
  const decryptedData = await decryptFileHybrid(encryptedData, options);

  return new Blob([decryptedData], { type: mimeType });
}
