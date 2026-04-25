import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getKeyWrapProvider } from '@/lib/platform/webKeyWrapProvider';
import { STREAMING } from '@/lib/constants';
import {
  arrayBufferToBase64,
  toArrayBuffer,
} from '@stenvault/shared/platform/crypto';
import { deriveChunkIV } from '@stenvault/aead-stream/iv';
import type { HybridCiphertext } from '@stenvault/shared/platform/crypto';
import {
  createCVEFMetadataV1_4,
  createCVEFHeader,
  type CVEFPqcParamsV1_2,
  type CVEFSignatureMetadata,
} from '@stenvault/shared/platform/crypto';
import type { HybridEncryptionOptions, HybridEncryptionResult } from './types';
import { toCleanUint8Array, generateFileKey, generateIV, importFileKey, CHUNK_SIZE } from './helpers';
import { signCoreMetadata } from './signing';
import { deriveManifestHmacKey } from './integrity';
import { sha256 } from './helpers';

function buildPqcParams(
  ciphertext: HybridCiphertext,
  wrappedKey: Uint8Array,
): CVEFPqcParamsV1_2 {
  return {
    kemAlgorithm: 'x25519-ml-kem-768',
    classicalCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.classical)),
    pqCiphertext: arrayBufferToBase64(toArrayBuffer(ciphertext.postQuantum)),
    wrappedFileKey: arrayBufferToBase64(toArrayBuffer(wrappedKey)),
  };
}

/**
 * Encrypt a file using hybrid post-quantum encryption (CVEF v1.4)
 *
 * Flow:
 * 1. Generate random file key (FK)
 * 2. Hybrid encapsulate to recipient's public key -> get shared secret
 * 3. Wrap file key with hybrid KEK using AES-KW
 * 4. Build v1.4 coreMetadata -> serialize -> coreMetadataBytes
 * 5. If signing: sign SHA-256(coreMetadataBytes) -> signatureMetadata
 * 6. Build two-block header -> headerBytes (= AAD)
 * 7. AES-GCM encrypt with AAD = headerBytes
 */
export async function encryptFileHybrid(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  const { publicKey, onProgress, signing } = options;

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // 1. Generate random file key
  const fileKey = generateFileKey();

  // 2. Hybrid encapsulate
  const { ciphertext, sharedSecret } = await hybridKem.encapsulate(publicKey);
  const hybridKEK = sharedSecret;

  try {
    // 3. Wrap file key
    const { wrappedKey } = await keyWrap.wrap(fileKey, hybridKEK);

    // 4. Build v1.4 core metadata
    const iv = generateIV();
    const pqcParams = buildPqcParams(ciphertext, wrappedKey);

    const metadata = createCVEFMetadataV1_4({
      salt: '',
      iv: arrayBufferToBase64(toArrayBuffer(iv)),
      kdfAlgorithm: 'none',
      kdfParams: { memoryCost: 0, timeCost: 0, parallelism: 0 },
      keyWrapAlgorithm: 'aes-kw',
      pqcParams,
    });

    // 5. Sign if requested
    // First create header without signature to get coreMetadataBytes
    const { coreMetadataBytes } = createCVEFHeader(metadata);

    let signatureMetadata: CVEFSignatureMetadata | undefined;
    if (signing) {
      signatureMetadata = await signCoreMetadata(coreMetadataBytes, signing);
    }

    // 6. Build final two-block header (with signature if present)
    const { header, headerBytes } = createCVEFHeader(metadata, signatureMetadata);

    // 7. Encrypt file content with AAD = headerBytes
    const fileKeyHandle = await importFileKey(fileKey);

    const fileData = await file.arrayBuffer();
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toCleanUint8Array(iv), additionalData: toArrayBuffer(headerBytes) },
      fileKeyHandle,
      fileData
    );

    if (onProgress) {
      onProgress({ bytesProcessed: file.size, totalBytes: file.size, percentage: 100 });
    }

    const blob = new Blob([toArrayBuffer(header), ciphertextBuffer], {
      type: 'application/octet-stream',
    });

    return { blob, metadata, signatureMetadata, originalSize: file.size };
  } finally {
    sharedSecret.fill(0);
    fileKey.fill(0);
  }
}

/**
 * Encrypt a large file using hybrid post-quantum encryption with streaming (CVEF v1.4)
 *
 * Uses chunked encryption for files larger than available memory.
 * AAD = headerBytes for every chunk + manifest. Manifest includes SHA-256(headerBytes).
 */
export async function encryptFileHybridStreaming(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  const { publicKey, onProgress, signing } = options;

  // Get providers
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  // 1. Generate random file key
  const fileKey = generateFileKey();

  // 2. Hybrid encapsulate
  const { ciphertext, sharedSecret } = await hybridKem.encapsulate(publicKey);
  const hybridKEK = sharedSecret;

  try {
    // 3. Wrap file key
    const { wrappedKey } = await keyWrap.wrap(fileKey, hybridKEK);

    // 4. Setup encryption
    const baseIv = generateIV();
    const fileKeyHandle = await importFileKey(fileKey);
    const hmacKey = await deriveManifestHmacKey(fileKey);

    // 5. Pre-compute chunk count
    const chunkCount = Math.ceil(file.size / CHUNK_SIZE) || 1;
    const totalBytes = file.size;

    // 6. Build v1.4 metadata
    const pqcParams = buildPqcParams(ciphertext, wrappedKey);

    const metadata = createCVEFMetadataV1_4({
      salt: '',
      iv: arrayBufferToBase64(toArrayBuffer(baseIv)),
      kdfAlgorithm: 'none',
      kdfParams: { memoryCost: 0, timeCost: 0, parallelism: 0 },
      keyWrapAlgorithm: 'aes-kw',
      pqcParams,
      chunked: { count: chunkCount, chunkSize: CHUNK_SIZE, ivs: [] },
    });

    // 7. Sign if requested
    const { coreMetadataBytes } = createCVEFHeader(metadata);
    let signatureMetadata: CVEFSignatureMetadata | undefined;
    if (signing) {
      signatureMetadata = await signCoreMetadata(coreMetadataBytes, signing);
    }

    // 8. Build final header (= AAD for all chunks)
    const { header, headerBytes } = createCVEFHeader(metadata, signatureMetadata);
    const aadBuffer = toArrayBuffer(headerBytes);

    // -- Step 1: encrypt each chunk --
    const encryptedParts: BlobPart[] = [];
    const chunkHashesRaw: ArrayBuffer[] = [];

    let offset = 0;
    let chunkIndex = 0;

    while (offset < file.size) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
      const chunk = file.slice(offset, chunkEnd);
      const chunkData = await chunk.arrayBuffer();

      const chunkIv = deriveChunkIV(baseIv, chunkIndex);

      const encryptedChunk = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toCleanUint8Array(chunkIv), additionalData: aadBuffer },
        fileKeyHandle,
        chunkData,
      );

      chunkHashesRaw.push(await crypto.subtle.digest('SHA-256', encryptedChunk));

      const packet = new Uint8Array(4 + encryptedChunk.byteLength);
      new DataView(packet.buffer).setUint32(0, encryptedChunk.byteLength, false);
      packet.set(new Uint8Array(encryptedChunk), 4);

      encryptedParts.push(packet);
      offset = chunkEnd;
      chunkIndex++;

      if (onProgress) {
        onProgress({
          bytesProcessed: offset,
          totalBytes,
          percentage: Math.round((offset / totalBytes) * 100),
        });
      }
    }

    // -- Step 2: build the trailing manifest --

    // v1.4 manifest HMAC input: count(4B BE) || hash_0 || ... || hash_N || SHA-256(headerBytes)
    const headerHash = await sha256(headerBytes);
    const manifestData = new Uint8Array(4 + chunkHashesRaw.length * 32 + 32);
    new DataView(manifestData.buffer).setUint32(0, chunkCount, false);
    let mOffset = 4;
    for (const hash of chunkHashesRaw) {
      manifestData.set(new Uint8Array(hash), mOffset);
      mOffset += 32;
    }
    manifestData.set(headerHash, mOffset);

    const manifestHMAC = await crypto.subtle.sign('HMAC', hmacKey, manifestData);

    // Manifest payload: HMAC(32B) + count(4B BE) + SHA-256(headerBytes)(32B) = 68 bytes
    const manifestPayload = new Uint8Array(68);
    manifestPayload.set(new Uint8Array(manifestHMAC), 0);
    new DataView(manifestPayload.buffer).setUint32(32, chunkCount, false);
    manifestPayload.set(headerHash, 36);

    // Encrypt manifest with AAD
    const manifestIv = deriveChunkIV(baseIv, chunkCount);
    const encryptedManifest = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toCleanUint8Array(manifestIv), additionalData: aadBuffer },
      fileKeyHandle,
      toArrayBuffer(manifestPayload),
    );

    const manifestPacket = new Uint8Array(4 + encryptedManifest.byteLength);
    new DataView(manifestPacket.buffer).setUint32(0, encryptedManifest.byteLength, false);
    manifestPacket.set(new Uint8Array(encryptedManifest), 4);

    const blob = new Blob([toArrayBuffer(header), ...encryptedParts, manifestPacket], {
      type: 'application/octet-stream',
    });

    return { blob, metadata, signatureMetadata, originalSize: file.size };
  } finally {
    sharedSecret.fill(0);
    fileKey.fill(0);
  }
}

/**
 * Determine if a file should use streaming encryption
 */
export function shouldUseStreamingEncryption(file: File): boolean {
  return file.size > STREAMING.THRESHOLD_BYTES;
}

/**
 * Encrypt a file with hybrid KEM, automatically choosing streaming for large files
 */
export async function encryptFileHybridAuto(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  if (shouldUseStreamingEncryption(file)) {
    return encryptFileHybridStreaming(file, options);
  }
  return encryptFileHybrid(file, options);
}
