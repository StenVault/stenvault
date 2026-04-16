// types
export type {
  SigningOptions,
  HybridEncryptionOptions,
  HybridDecryptionOptions,
  EncryptionProgress,
  HybridEncryptionResult,
} from './types';

// signing (public only — signCoreMetadata is internal)
export { buildSignatureHash } from './signing';

// integrity
export { deriveManifestHmacKey, verifyChunkManifest } from './integrity';

// encrypt
export {
  encryptFileHybrid,
  encryptFileHybridStreaming,
  encryptFileHybridAuto,
  shouldUseStreamingEncryption,
} from './encrypt';

// decrypt
export {
  decryptFileHybrid,
  decryptChunked,
  decryptChunkedToStream,
  decryptFileHybridFromUrl,
} from './decrypt';

// key extraction
export { extractV4FileKey, extractV4FileKeyWithMetadata } from './extractKey';
export type { ExtractedFileKey, ExtractedFileKeyWithMetadata } from './extractKey';

// utils
export { isHybridEncrypted, getEncryptionMetadata } from './utils';

// re-export from shared (was re-exported by the old monolith)
export { deriveChunkIV } from '@stenvault/shared/platform/crypto';
