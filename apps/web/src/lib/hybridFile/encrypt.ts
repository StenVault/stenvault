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
import type { HybridEncryptionOptions, HybridEncryptionResult, HybridEncryptionSeed } from './types';
import { toCleanUint8Array, generateFileKey, generateIV, importFileKey, CHUNK_SIZE } from './helpers';
import { signCoreMetadata } from './signing';
import { deriveManifestHmacKey } from './integrity';
import { sha256 } from './helpers';

/**
 * Generate fresh encryption material for a new upload. On resume, callers
 * pass `options.resumeSeed` instead of letting this run — that's the only
 * way to produce a byte-identical re-encryption (random encapsulation has
 * no determinism otherwise).
 */
async function generateEncryptionSeed(
  options: HybridEncryptionOptions,
): Promise<{ seed: HybridEncryptionSeed; sharedSecret: Uint8Array }> {
  const hybridKem = getHybridKemProvider();
  const keyWrap = getKeyWrapProvider();

  const fileKey = generateFileKey();
  const { ciphertext, sharedSecret } = await hybridKem.encapsulate(options.publicKey);
  const { wrappedKey } = await keyWrap.wrap(fileKey, sharedSecret);
  const baseIv = generateIV();

  return {
    seed: {
      fileKey,
      baseIv,
      wrappedFileKey: wrappedKey,
      classicalCiphertext: new Uint8Array(ciphertext.classical),
      pqCiphertext: new Uint8Array(ciphertext.postQuantum),
    },
    sharedSecret,
  };
}

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
 * 1. Generate or reuse seed: file key (FK), hybrid encapsulation, wrapped FK, baseIv
 * 2. Build v1.4 coreMetadata -> serialize -> coreMetadataBytes
 * 3. Reuse or compute signature metadata
 * 4. Build two-block header -> headerBytes (= AAD)
 * 5. AES-GCM encrypt with AAD = headerBytes
 */
export async function encryptFileHybrid(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  const { onProgress, signing, resumeSeed } = options;

  // 1. Reuse seed if provided, else generate fresh.
  let seed: HybridEncryptionSeed;
  let sharedSecret: Uint8Array | null = null;
  if (resumeSeed) {
    seed = resumeSeed;
  } else {
    const fresh = await generateEncryptionSeed(options);
    seed = fresh.seed;
    sharedSecret = fresh.sharedSecret;
  }

  try {
    // 2. Build v1.4 core metadata using the seed (single-block uses seed.baseIv as the IV)
    const ciphertextForMetadata: HybridCiphertext = {
      classical: seed.classicalCiphertext,
      postQuantum: seed.pqCiphertext,
    };
    const pqcParams = buildPqcParams(ciphertextForMetadata, seed.wrappedFileKey);

    const metadata = createCVEFMetadataV1_4({
      salt: '',
      iv: arrayBufferToBase64(toArrayBuffer(seed.baseIv)),
      kdfAlgorithm: 'none',
      kdfParams: { memoryCost: 0, timeCost: 0, parallelism: 0 },
      keyWrapAlgorithm: 'aes-kw',
      pqcParams,
    });

    // 3. Reuse signature from seed if present, otherwise sign now (if requested)
    const { coreMetadataBytes } = createCVEFHeader(metadata);

    let signatureMetadata: CVEFSignatureMetadata | undefined = seed.signatureMetadata;
    if (!signatureMetadata && signing) {
      signatureMetadata = await signCoreMetadata(coreMetadataBytes, signing);
    }

    // 4. Build final two-block header (with signature if present)
    const { header, headerBytes } = createCVEFHeader(metadata, signatureMetadata);

    // 5. Encrypt file content with AAD = headerBytes
    const fileKeyHandle = await importFileKey(seed.fileKey);

    const fileData = await file.arrayBuffer();
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toCleanUint8Array(seed.baseIv), additionalData: toArrayBuffer(headerBytes) },
      fileKeyHandle,
      fileData
    );

    if (onProgress) {
      onProgress({ bytesProcessed: file.size, totalBytes: file.size, percentage: 100 });
    }

    const blob = new Blob([toArrayBuffer(header), ciphertextBuffer], {
      type: 'application/octet-stream',
    });

    return {
      blob,
      metadata,
      signatureMetadata,
      originalSize: file.size,
      seed: { ...seed, signatureMetadata },
    };
  } finally {
    if (sharedSecret) sharedSecret.fill(0);
  }
}

/**
 * Encrypt a large file using hybrid post-quantum encryption with streaming (CVEF v1.4)
 *
 * Uses chunked encryption for files larger than available memory.
 * AAD = headerBytes for every chunk + manifest. Manifest includes SHA-256(headerBytes).
 *
 * Resume: if `options.resumeSeed` is provided, the seed (fileKey, baseIv,
 * encapsulation outputs, optional signature) is reused verbatim — output is
 * byte-identical to the original encryption pass. This is what makes
 * cross-session multipart resume safe: R2 already has parts whose ciphertext
 * was derived from the same seed, and the new pass produces the same bytes.
 */
export async function encryptFileHybridStreaming(
  file: File,
  options: HybridEncryptionOptions
): Promise<HybridEncryptionResult> {
  const { onProgress, signing, resumeSeed } = options;

  // 1. Reuse seed if provided, else generate fresh.
  let seed: HybridEncryptionSeed;
  let sharedSecret: Uint8Array | null = null;
  if (resumeSeed) {
    seed = resumeSeed;
  } else {
    const fresh = await generateEncryptionSeed(options);
    seed = fresh.seed;
    sharedSecret = fresh.sharedSecret;
  }

  try {
    // 2. Setup encryption
    const fileKeyHandle = await importFileKey(seed.fileKey);
    const hmacKey = await deriveManifestHmacKey(seed.fileKey);

    // 3. Pre-compute chunk count
    const chunkCount = Math.ceil(file.size / CHUNK_SIZE) || 1;
    const totalBytes = file.size;

    // 4. Build v1.4 metadata
    const ciphertextForMetadata: HybridCiphertext = {
      classical: seed.classicalCiphertext,
      postQuantum: seed.pqCiphertext,
    };
    const pqcParams = buildPqcParams(ciphertextForMetadata, seed.wrappedFileKey);

    const metadata = createCVEFMetadataV1_4({
      salt: '',
      iv: arrayBufferToBase64(toArrayBuffer(seed.baseIv)),
      kdfAlgorithm: 'none',
      kdfParams: { memoryCost: 0, timeCost: 0, parallelism: 0 },
      keyWrapAlgorithm: 'aes-kw',
      pqcParams,
      chunked: { count: chunkCount, chunkSize: CHUNK_SIZE, ivs: [] },
    });

    // 5. Reuse signature from seed if present, otherwise sign now (if requested)
    const { coreMetadataBytes } = createCVEFHeader(metadata);
    let signatureMetadata: CVEFSignatureMetadata | undefined = seed.signatureMetadata;
    if (!signatureMetadata && signing) {
      signatureMetadata = await signCoreMetadata(coreMetadataBytes, signing);
    }

    // 6. Build final header (= AAD for all chunks)
    const { header, headerBytes } = createCVEFHeader(metadata, signatureMetadata);
    const aadBuffer = toArrayBuffer(headerBytes);
    const baseIv = seed.baseIv;

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

    return {
      blob,
      metadata,
      signatureMetadata,
      originalSize: file.size,
      seed: { ...seed, signatureMetadata },
    };
  } finally {
    if (sharedSecret) sharedSecret.fill(0);
    // NOTE: We deliberately do NOT zero seed.fileKey here. The caller may need
    // to persist it for cross-session resume. Caller is responsible for
    // zeroing once it has either (a) saved the seed to IndexedDB, or
    // (b) finished the upload (success / explicit cancel) and cleared the seed.
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
