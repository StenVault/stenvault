/**
 * Hybrid Signature Interface (Phase 3.4 Sovereign)
 *
 * Platform-agnostic abstraction for hybrid post-quantum digital signatures.
 * Combines classical (Ed25519) and post-quantum (ML-DSA-65) algorithms
 * for defense in depth against quantum attacks.
 *
 * Architecture:
 * ```
 * File Hash (SHA-256)
 *       │
 *       ├──────────────────┬──────────────────┐
 *       ▼                  ▼                  ▼
 *    Ed25519           ML-DSA-65         Combined
 *   (Classical)     (Post-Quantum)       Signature
 *    64 bytes         3309 bytes        ~3400 bytes
 * ```
 *
 * Implementations:
 * - Web: Uses Web Crypto API (Ed25519) + liboqs-js (ML-DSA-65)
 * - Server: Uses Node.js crypto + liboqs bindings
 *
 * References:
 * - ML-DSA (FIPS 204): https://csrc.nist.gov/pubs/fips/204/final
 * - Ed25519 (RFC 8032): https://datatracker.ietf.org/doc/html/rfc8032
 * - BSI TR-02102-1: Hybrid signature requirements for EU compliance
 */

// ============ Constants ============

/**
 * Key and signature sizes for hybrid signature components (FIPS 204 - ML-DSA-65)
 */
export const HYBRID_SIGNATURE_SIZES = {
  // Ed25519 (Classical)
  /** Ed25519 public key size (32 bytes) */
  ED25519_PUBLIC_KEY: 32,
  /** Ed25519 secret key size (64 bytes - includes public key) */
  ED25519_SECRET_KEY: 64,
  /** Ed25519 signature size (64 bytes) */
  ED25519_SIGNATURE: 64,

  // ML-DSA-65 (Post-Quantum, FIPS 204 Level 3)
  /** ML-DSA-65 public key size (1952 bytes) */
  MLDSA65_PUBLIC_KEY: 1952,
  /** ML-DSA-65 secret key size (4032 bytes) */
  MLDSA65_SECRET_KEY: 4032,
  /** ML-DSA-65 signature size (3309 bytes, FIPS 204) */
  MLDSA65_SIGNATURE: 3309,

  /** Combined hybrid signature size (approximate: 64 + 3309 + overhead) */
  HYBRID_SIGNATURE: 3400,
} as const;

/**
 * Algorithm identifiers for CVEF format
 */
export const HYBRID_SIGNATURE_ALGORITHMS = {
  /** No signature */
  NONE: 0x00,
  /** Ed25519 + ML-DSA-65 hybrid */
  ED25519_MLDSA65: 0x01,
} as const;

/**
 * Signing contexts (domain separators) to prevent cross-protocol attacks
 */
export const SIGNATURE_CONTEXTS = {
  /** File content signing */
  FILE: 'StenVault-Sig-FILE-v1',
  /** Timestamp proof signing */
  TIMESTAMP: 'StenVault-Sig-TIMESTAMP-v1',
  /** Share link signing */
  SHARE: 'StenVault-Sig-SHARE-v1',
} as const;

/**
 * Signing context type
 */
export type SignatureContext = keyof typeof SIGNATURE_CONTEXTS;

// ============ Types ============

/**
 * Hybrid signature algorithm type
 */
export type HybridSignatureAlgorithm = 'ed25519-ml-dsa-65' | 'none';

/**
 * Hybrid public key containing both classical and post-quantum components
 */
export interface HybridSignaturePublicKey {
  /** Ed25519 public key (32 bytes) */
  classical: Uint8Array;
  /** ML-DSA-65 public key (1952 bytes) */
  postQuantum: Uint8Array;
}

/**
 * Hybrid secret key containing both classical and post-quantum components
 */
export interface HybridSignatureSecretKey {
  /** Ed25519 secret key (64 bytes) */
  classical: Uint8Array;
  /** ML-DSA-65 secret key (4032 bytes) */
  postQuantum: Uint8Array;
}

/**
 * Hybrid signature key pair
 */
export interface HybridSignatureKeyPair {
  /** Public key (shareable) */
  publicKey: HybridSignaturePublicKey;
  /** Secret key (must be protected) */
  secretKey: HybridSignatureSecretKey;
}

/**
 * Combined hybrid signature
 */
export interface HybridSignature {
  /** Ed25519 signature (64 bytes) */
  classical: Uint8Array;
  /** ML-DSA-65 signature (3309 bytes) */
  postQuantum: Uint8Array;
  /** Signing context used */
  context: SignatureContext;
  /** Timestamp of signing (Unix ms) */
  signedAt: number;
}

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  /** Overall validity (both signatures must pass) */
  valid: boolean;
  /** Classical (Ed25519) signature validity */
  classicalValid: boolean;
  /** Post-quantum (ML-DSA-65) signature validity */
  postQuantumValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Serializable hybrid public key (for storage/transmission)
 */
export interface HybridSignaturePublicKeySerialized {
  /** Ed25519 public key (Base64) */
  classical: string;
  /** ML-DSA-65 public key (Base64) */
  postQuantum: string;
  /** Algorithm identifier */
  algorithm: HybridSignatureAlgorithm;
}

/**
 * Serializable hybrid secret key (for encrypted storage)
 */
export interface HybridSignatureSecretKeySerialized {
  /** Ed25519 secret key (Base64, encrypted) */
  classical: string;
  /** ML-DSA-65 secret key (Base64, encrypted) */
  postQuantum: string;
  /** Algorithm identifier */
  algorithm: HybridSignatureAlgorithm;
}

/**
 * Serializable hybrid signature (for CVEF metadata)
 */
export interface HybridSignatureSerialized {
  /** Ed25519 signature (Base64) */
  classical: string;
  /** ML-DSA-65 signature (Base64) */
  postQuantum: string;
  /** Signing context */
  context: SignatureContext;
  /** Timestamp of signing (Unix ms) */
  signedAt: number;
}

/**
 * Hybrid Signature Provider Interface
 *
 * Platform-specific implementations for hybrid post-quantum digital signatures.
 * All methods are async to support both WASM and native implementations.
 */
export interface HybridSignatureProvider {
  /**
   * Check if hybrid signatures are available on this platform
   *
   * Returns true if both Ed25519 and ML-DSA-65 are supported.
   * If ML-DSA-65 is not available, clients should fall back to server-side signing.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Check if only classical (Ed25519) is available
   * Useful for graceful degradation when liboqs is not available
   */
  isClassicalOnlyAvailable(): Promise<boolean>;

  /**
   * Generate a hybrid signature key pair
   *
   * Creates both Ed25519 and ML-DSA-65 key pairs.
   * The secret key should be wrapped with the user's master key before storage.
   *
   * @returns Hybrid key pair with both components
   * @throws Error if key generation fails
   */
  generateKeyPair(): Promise<HybridSignatureKeyPair>;

  /**
   * Sign a message with both classical and post-quantum algorithms
   *
   * @param message - Message to sign (typically a SHA-256 hash)
   * @param secretKey - Hybrid secret key
   * @param context - Signing context (domain separator)
   * @returns Combined hybrid signature
   * @throws Error if signing fails
   */
  sign(
    message: Uint8Array,
    secretKey: HybridSignatureSecretKey,
    context: SignatureContext
  ): Promise<HybridSignature>;

  /**
   * Verify a hybrid signature
   *
   * Both signatures must be valid for the verification to pass.
   *
   * @param message - Original message that was signed
   * @param signature - Hybrid signature to verify
   * @param publicKey - Hybrid public key
   * @returns Verification result with details
   */
  verify(
    message: Uint8Array,
    signature: HybridSignature,
    publicKey: HybridSignaturePublicKey
  ): Promise<SignatureVerificationResult>;

  /**
   * Sign with only classical (Ed25519) algorithm
   * Used when ML-DSA-65 is not available
   *
   * @param message - Message to sign
   * @param secretKey - Ed25519 secret key only
   * @param context - Signing context
   * @returns Classical signature only
   */
  signClassicalOnly(
    message: Uint8Array,
    secretKey: Uint8Array,
    context: SignatureContext
  ): Promise<Uint8Array>;

  /**
   * Verify classical (Ed25519) signature only
   *
   * @param message - Original message
   * @param signature - Ed25519 signature
   * @param publicKey - Ed25519 public key
   * @param context - Signing context
   * @returns Whether signature is valid
   */
  verifyClassicalOnly(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    context: SignatureContext
  ): Promise<boolean>;

  /**
   * Algorithm identifier for this provider
   */
  readonly algorithmId: typeof HYBRID_SIGNATURE_ALGORITHMS[keyof typeof HYBRID_SIGNATURE_ALGORITHMS];

  /**
   * Algorithm name for this provider
   */
  readonly algorithm: HybridSignatureAlgorithm;
}

/**
 * Factory function type for creating Hybrid Signature providers
 */
export type HybridSignatureProviderFactory = () => HybridSignatureProvider;

// ============ Validation Functions ============

/**
 * Validate hybrid public key structure and sizes
 *
 * @param publicKey - Public key to validate
 * @throws Error if public key is invalid
 */
export function validateHybridSignaturePublicKey(publicKey: HybridSignaturePublicKey): void {
  if (!publicKey.classical || publicKey.classical.length !== HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY) {
    throw new Error(
      `Invalid Ed25519 public key: expected ${HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY} bytes, got ${publicKey.classical?.length ?? 0}`
    );
  }

  if (!publicKey.postQuantum || publicKey.postQuantum.length !== HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY) {
    throw new Error(
      `Invalid ML-DSA-65 public key: expected ${HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY} bytes, got ${publicKey.postQuantum?.length ?? 0}`
    );
  }
}

/**
 * Validate hybrid secret key structure and sizes
 *
 * @param secretKey - Secret key to validate
 * @throws Error if secret key is invalid
 */
export function validateHybridSignatureSecretKey(secretKey: HybridSignatureSecretKey): void {
  if (!secretKey.classical || secretKey.classical.length !== HYBRID_SIGNATURE_SIZES.ED25519_SECRET_KEY) {
    throw new Error(
      `Invalid Ed25519 secret key: expected ${HYBRID_SIGNATURE_SIZES.ED25519_SECRET_KEY} bytes, got ${secretKey.classical?.length ?? 0}`
    );
  }

  if (!secretKey.postQuantum || secretKey.postQuantum.length !== HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY) {
    throw new Error(
      `Invalid ML-DSA-65 secret key: expected ${HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY} bytes, got ${secretKey.postQuantum?.length ?? 0}`
    );
  }
}

/**
 * Validate hybrid signature structure and sizes
 *
 * @param signature - Signature to validate
 * @throws Error if signature is invalid
 */
export function validateHybridSignature(signature: HybridSignature): void {
  if (!signature.classical || signature.classical.length !== HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE) {
    throw new Error(
      `Invalid Ed25519 signature: expected ${HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE} bytes, got ${signature.classical?.length ?? 0}`
    );
  }

  if (!signature.postQuantum || signature.postQuantum.length !== HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE) {
    throw new Error(
      `Invalid ML-DSA-65 signature: expected ${HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE} bytes, got ${signature.postQuantum?.length ?? 0}`
    );
  }

  if (!signature.context || !SIGNATURE_CONTEXTS[signature.context]) {
    throw new Error(
      `Invalid signature context: expected one of ${Object.keys(SIGNATURE_CONTEXTS).join(', ')}, got ${signature.context}`
    );
  }

  if (typeof signature.signedAt !== 'number' || signature.signedAt <= 0) {
    throw new Error('Invalid signedAt timestamp');
  }
}

/**
 * Validate signing context
 *
 * @param context - Context to validate
 * @throws Error if context is invalid
 */
export function validateSignatureContext(context: string): asserts context is SignatureContext {
  if (!SIGNATURE_CONTEXTS[context as SignatureContext]) {
    throw new Error(
      `Invalid signature context: expected one of ${Object.keys(SIGNATURE_CONTEXTS).join(', ')}, got ${context}`
    );
  }
}

// ============ Serialization Functions ============

/**
 * Serialize hybrid public key for storage/transmission
 */
export function serializeHybridSignaturePublicKey(
  publicKey: HybridSignaturePublicKey
): HybridSignaturePublicKeySerialized {
  validateHybridSignaturePublicKey(publicKey);
  return {
    classical: uint8ArrayToBase64(publicKey.classical),
    postQuantum: uint8ArrayToBase64(publicKey.postQuantum),
    algorithm: 'ed25519-ml-dsa-65',
  };
}

/**
 * Deserialize hybrid public key from storage/transmission
 */
export function deserializeHybridSignaturePublicKey(
  serialized: HybridSignaturePublicKeySerialized
): HybridSignaturePublicKey {
  const publicKey: HybridSignaturePublicKey = {
    classical: base64ToUint8Array(serialized.classical),
    postQuantum: base64ToUint8Array(serialized.postQuantum),
  };
  validateHybridSignaturePublicKey(publicKey);
  return publicKey;
}

/**
 * Serialize hybrid signature for CVEF metadata
 */
export function serializeHybridSignature(signature: HybridSignature): HybridSignatureSerialized {
  validateHybridSignature(signature);
  return {
    classical: uint8ArrayToBase64(signature.classical),
    postQuantum: uint8ArrayToBase64(signature.postQuantum),
    context: signature.context,
    signedAt: signature.signedAt,
  };
}

/**
 * Deserialize hybrid signature from CVEF metadata
 */
export function deserializeHybridSignature(serialized: HybridSignatureSerialized): HybridSignature {
  validateSignatureContext(serialized.context);

  const signature: HybridSignature = {
    classical: base64ToUint8Array(serialized.classical),
    postQuantum: base64ToUint8Array(serialized.postQuantum),
    context: serialized.context,
    signedAt: serialized.signedAt,
  };
  validateHybridSignature(signature);
  return signature;
}

// ============ Utility Functions ============

/**
 * Generate fingerprint from hybrid public key
 * SHA-256 of concatenated public keys, first 16 bytes as hex
 *
 * Works in both browser (crypto.subtle) and Node.js (crypto module)
 */
export async function generateSignatureKeyFingerprint(
  publicKey: HybridSignaturePublicKey
): Promise<string> {
  validateHybridSignaturePublicKey(publicKey);

  // Concatenate both public keys
  const combined = new Uint8Array(
    publicKey.classical.length + publicKey.postQuantum.length
  );
  combined.set(publicKey.classical, 0);
  combined.set(publicKey.postQuantum, publicKey.classical.length);

  // Compute SHA-256 hash using available crypto API
  let hashBuffer: ArrayBuffer;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Browser environment - use Web Crypto API
    hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  } else {
    // Node.js environment - use crypto module
    // Dynamic import to avoid bundling issues in browser
    const nodeCrypto = await import('crypto');
    const hash = nodeCrypto.createHash('sha256').update(combined).digest();
    hashBuffer = hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
  }

  // Take first 16 bytes and convert to hex string
  const hashArray = new Uint8Array(hashBuffer);
  const first16Bytes = hashArray.slice(0, 16);

  // Convert to hex string
  let hexString = '';
  for (let i = 0; i < first16Bytes.length; i++) {
    hexString += first16Bytes[i]!.toString(16).padStart(2, '0');
  }

  return hexString;
}

/**
 * Create the signed message with context prefix
 * This prevents cross-context signature reuse attacks
 */
export function createContextualMessage(
  message: Uint8Array,
  context: SignatureContext
): Uint8Array {
  const contextBytes = new TextEncoder().encode(SIGNATURE_CONTEXTS[context]);
  const result = new Uint8Array(contextBytes.length + 1 + message.length);
  result.set(contextBytes, 0);
  result[contextBytes.length] = 0x00; // Separator byte
  result.set(message, contextBytes.length + 1);
  return result;
}

// ============ Base64 Helpers ============

import { base64ToUint8Array } from './utils';

/**
 * Convert Uint8Array to Base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  } else {
    return Buffer.from(bytes).toString('base64');
  }
}
