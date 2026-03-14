/**
 * Hybrid KEM (Key Encapsulation Mechanism) Interface
 *
 * Platform-agnostic abstraction for hybrid post-quantum key encapsulation.
 * Combines classical (X25519 ECDH) and post-quantum (ML-KEM-768) algorithms
 * for defense in depth against quantum attacks.
 *
 * Architecture:
 * ```
 * File Key (FK) - 32 bytes (random per file)
 *         ↓
 * ┌───────┴───────┐
 * │               │
 * X25519-ECDH   ML-KEM-768
 * (32 bytes)    (1088 bytes ciphertext)
 * │               │
 * └───────┬───────┘
 *         ↓
 *     HKDF-SHA256 (combine both secrets)
 *         ↓
 *     Hybrid KEK (32 bytes)
 *         ↓
 *     AES-KW Wrap (RFC 3394)
 *         ↓
 *     Wrapped File Key (40 bytes)
 * ```
 *
 * Implementations:
 * - Web: Uses Web Crypto API (X25519) + liboqs-js (ML-KEM-768)
 * - Server: Uses Node.js crypto + liboqs bindings
 *
 * References:
 * - ML-KEM (FIPS 203): https://csrc.nist.gov/pubs/fips/203/final
 * - X25519 (RFC 7748): https://datatracker.ietf.org/doc/html/rfc7748
 * - Hybrid PQ TLS: https://datatracker.ietf.org/doc/html/draft-ietf-tls-hybrid-design
 */


/**
 * Key sizes for hybrid KEM components
 */
export const HYBRID_KEM_SIZES = {
  /** X25519 public key size (32 bytes) */
  X25519_PUBLIC_KEY: 32,
  /** X25519 secret key size (32 bytes) */
  X25519_SECRET_KEY: 32,
  /** X25519 shared secret size (32 bytes) */
  X25519_SHARED_SECRET: 32,

  /** ML-KEM-768 public key size (1184 bytes) */
  MLKEM768_PUBLIC_KEY: 1184,
  /** ML-KEM-768 secret key size (2400 bytes) */
  MLKEM768_SECRET_KEY: 2400,
  /** ML-KEM-768 ciphertext size (1088 bytes) */
  MLKEM768_CIPHERTEXT: 1088,
  /** ML-KEM-768 shared secret size (32 bytes) */
  MLKEM768_SHARED_SECRET: 32,

  /** Combined hybrid shared secret size (32 bytes after HKDF) */
  HYBRID_SHARED_SECRET: 32,
} as const;

/**
 * Algorithm identifiers for CVEF format
 */
export const HYBRID_KEM_ALGORITHMS = {
  /** No hybrid KEM (legacy) */
  NONE: 0x00,
  /** X25519 + ML-KEM-768 hybrid */
  X25519_MLKEM768: 0x01,
} as const;

/**
 * HKDF domain separator for hybrid key derivation
 * Prevents cross-protocol attacks by binding the key to this context
 */
export const HYBRID_KEM_HKDF_INFO = 'CloudVault-Hybrid-KEM-v1';

/**
 * HKDF salt for hybrid key derivation (SHA-256 of domain string).
 * Non-trivial salt adds extra domain separation per RFC 5869 §3.1.
 * Pre-computed: SHA-256("CloudVault-Hybrid-KEM-Salt-v1")
 */
export const HYBRID_KEM_HKDF_SALT = new Uint8Array([
  0x03, 0x71, 0x4a, 0xfb, 0xfd, 0x44, 0x99, 0xdc,
  0x15, 0xb5, 0x47, 0x13, 0xa5, 0x11, 0x74, 0x79,
  0xa9, 0xe0, 0xf5, 0xe4, 0xf8, 0x2d, 0x04, 0x8e,
  0xe0, 0x0a, 0x87, 0xa2, 0x73, 0x77, 0x79, 0x0c,
]);


/**
 * Hybrid KEM algorithm type
 */
export type HybridKemAlgorithm = 'x25519-ml-kem-768' | 'none';

/**
 * Hybrid public key containing both classical and post-quantum components
 */
export interface HybridPublicKey {
  /** X25519 public key (32 bytes) */
  classical: Uint8Array;
  /** ML-KEM-768 public key (1184 bytes) */
  postQuantum: Uint8Array;
}

/**
 * Hybrid secret key containing both classical and post-quantum components
 */
export interface HybridSecretKey {
  /** X25519 secret key (32 bytes) */
  classical: Uint8Array;
  /** ML-KEM-768 secret key (2400 bytes) */
  postQuantum: Uint8Array;
}

/**
 * Hybrid key pair for key encapsulation
 */
export interface HybridKeyPair {
  /** Public key (shareable) */
  publicKey: HybridPublicKey;
  /** Secret key (must be protected) */
  secretKey: HybridSecretKey;
}

/**
 * Hybrid ciphertext containing both classical and post-quantum components
 */
export interface HybridCiphertext {
  /** X25519 ephemeral public key (32 bytes) */
  classical: Uint8Array;
  /** ML-KEM-768 ciphertext (1088 bytes) */
  postQuantum: Uint8Array;
}

/**
 * Result of hybrid encapsulation
 */
export interface HybridEncapsulationResult {
  /** Combined ciphertext from both KEMs */
  ciphertext: HybridCiphertext;
  /** Combined shared secret (32 bytes, derived via HKDF) */
  sharedSecret: Uint8Array;
}

/**
 * Serializable hybrid public key (for storage/transmission)
 */
export interface HybridPublicKeySerialized {
  /** X25519 public key (Base64) */
  classical: string;
  /** ML-KEM-768 public key (Base64) */
  postQuantum: string;
  /** Algorithm identifier */
  algorithm: HybridKemAlgorithm;
}

/**
 * Serializable hybrid secret key (for encrypted storage)
 */
export interface HybridSecretKeySerialized {
  /** X25519 secret key (Base64, encrypted) */
  classical: string;
  /** ML-KEM-768 secret key (Base64, encrypted) */
  postQuantum: string;
  /** Algorithm identifier */
  algorithm: HybridKemAlgorithm;
}

/**
 * Serializable hybrid ciphertext (for CVEF metadata)
 */
export interface HybridCiphertextSerialized {
  /** X25519 ephemeral public key (Base64) */
  classical: string;
  /** ML-KEM-768 ciphertext (Base64) */
  postQuantum: string;
}

/**
 * Hybrid KEM Provider Interface
 *
 * Platform-specific implementations for hybrid post-quantum key encapsulation.
 * All methods are async to support both WASM and native implementations.
 */
export interface HybridKemProvider {
  /**
   * Check if hybrid KEM is available on this platform
   *
   * Returns true if both X25519 and ML-KEM-768 are supported.
   * If ML-KEM-768 is not available, clients should fall back to server-side KEM.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Check if only classical (X25519) is available
   * Useful for graceful degradation when liboqs is not available
   */
  isClassicalOnlyAvailable(): Promise<boolean>;

  /**
   * Generate a hybrid key pair
   *
   * Creates both X25519 and ML-KEM-768 key pairs.
   * The secret key should be wrapped with the user's master key before storage.
   *
   * @returns Hybrid key pair with both components
   * @throws Error if key generation fails
   */
  generateKeyPair(): Promise<HybridKeyPair>;

  /**
   * Encapsulate a shared secret to a recipient's public key
   *
   * Performs both X25519 ECDH and ML-KEM-768 encapsulation,
   * then combines the shared secrets using HKDF-SHA256.
   *
   * @param publicKey - Recipient's hybrid public key
   * @returns Ciphertext and combined shared secret
   * @throws Error if encapsulation fails
   */
  encapsulate(publicKey: HybridPublicKey): Promise<HybridEncapsulationResult>;

  /**
   * Decapsulate a shared secret using our secret key
   *
   * Performs both X25519 ECDH and ML-KEM-768 decapsulation,
   * then combines the shared secrets using HKDF-SHA256.
   *
   * @param ciphertext - Hybrid ciphertext from encapsulation
   * @param secretKey - Our hybrid secret key
   * @returns Combined shared secret (32 bytes)
   * @throws Error if decapsulation fails (integrity check or invalid key)
   */
  decapsulate(ciphertext: HybridCiphertext, secretKey: HybridSecretKey): Promise<Uint8Array>;

  /**
   * Derive HKDF from combined secrets
   *
   * Combines classical and post-quantum shared secrets using HKDF-SHA256.
   * Uses domain separator to prevent cross-protocol attacks.
   *
   * @param classicalSecret - X25519 shared secret (32 bytes)
   * @param postQuantumSecret - ML-KEM-768 shared secret (32 bytes)
   * @returns Combined hybrid KEK (32 bytes)
   */
  deriveHybridKEK(classicalSecret: Uint8Array, postQuantumSecret: Uint8Array): Promise<Uint8Array>;

  /**
   * Algorithm identifier for this provider
   */
  readonly algorithmId: typeof HYBRID_KEM_ALGORITHMS[keyof typeof HYBRID_KEM_ALGORITHMS];

  /**
   * Algorithm name for this provider
   */
  readonly algorithm: HybridKemAlgorithm;
}

/**
 * Factory function type for creating Hybrid KEM providers
 */
export type HybridKemProviderFactory = () => HybridKemProvider;


/**
 * Validate hybrid public key structure and sizes
 *
 * @param publicKey - Public key to validate
 * @throws Error if public key is invalid
 */
export function validateHybridPublicKey(publicKey: HybridPublicKey): void {
  if (!publicKey.classical || publicKey.classical.length !== HYBRID_KEM_SIZES.X25519_PUBLIC_KEY) {
    throw new Error(
      `Invalid X25519 public key: expected ${HYBRID_KEM_SIZES.X25519_PUBLIC_KEY} bytes, got ${publicKey.classical?.length ?? 0}`
    );
  }

  if (!publicKey.postQuantum || publicKey.postQuantum.length !== HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY) {
    throw new Error(
      `Invalid ML-KEM-768 public key: expected ${HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY} bytes, got ${publicKey.postQuantum?.length ?? 0}`
    );
  }
}

/**
 * Validate hybrid secret key structure and sizes
 *
 * @param secretKey - Secret key to validate
 * @throws Error if secret key is invalid
 */
export function validateHybridSecretKey(secretKey: HybridSecretKey): void {
  if (!secretKey.classical || secretKey.classical.length !== HYBRID_KEM_SIZES.X25519_SECRET_KEY) {
    throw new Error(
      `Invalid X25519 secret key: expected ${HYBRID_KEM_SIZES.X25519_SECRET_KEY} bytes, got ${secretKey.classical?.length ?? 0}`
    );
  }

  if (!secretKey.postQuantum || secretKey.postQuantum.length !== HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY) {
    throw new Error(
      `Invalid ML-KEM-768 secret key: expected ${HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY} bytes, got ${secretKey.postQuantum?.length ?? 0}`
    );
  }
}

/**
 * Validate hybrid ciphertext structure and sizes
 *
 * @param ciphertext - Ciphertext to validate
 * @throws Error if ciphertext is invalid
 */
export function validateHybridCiphertext(ciphertext: HybridCiphertext): void {
  if (!ciphertext.classical || ciphertext.classical.length !== HYBRID_KEM_SIZES.X25519_PUBLIC_KEY) {
    throw new Error(
      `Invalid X25519 ciphertext: expected ${HYBRID_KEM_SIZES.X25519_PUBLIC_KEY} bytes, got ${ciphertext.classical?.length ?? 0}`
    );
  }

  if (!ciphertext.postQuantum || ciphertext.postQuantum.length !== HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT) {
    throw new Error(
      `Invalid ML-KEM-768 ciphertext: expected ${HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT} bytes, got ${ciphertext.postQuantum?.length ?? 0}`
    );
  }
}


/**
 * Serialize hybrid public key for storage/transmission
 */
export function serializeHybridPublicKey(publicKey: HybridPublicKey): HybridPublicKeySerialized {
  validateHybridPublicKey(publicKey);
  return {
    classical: uint8ArrayToBase64(publicKey.classical),
    postQuantum: uint8ArrayToBase64(publicKey.postQuantum),
    algorithm: 'x25519-ml-kem-768',
  };
}

/**
 * Deserialize hybrid public key from storage/transmission
 */
export function deserializeHybridPublicKey(serialized: HybridPublicKeySerialized): HybridPublicKey {
  const publicKey: HybridPublicKey = {
    classical: base64ToUint8Array(serialized.classical),
    postQuantum: base64ToUint8Array(serialized.postQuantum),
  };
  validateHybridPublicKey(publicKey);
  return publicKey;
}

/**
 * Serialize hybrid ciphertext for CVEF metadata
 */
export function serializeHybridCiphertext(ciphertext: HybridCiphertext): HybridCiphertextSerialized {
  validateHybridCiphertext(ciphertext);
  return {
    classical: uint8ArrayToBase64(ciphertext.classical),
    postQuantum: uint8ArrayToBase64(ciphertext.postQuantum),
  };
}

/**
 * Deserialize hybrid ciphertext from CVEF metadata
 */
export function deserializeHybridCiphertext(serialized: HybridCiphertextSerialized): HybridCiphertext {
  const ciphertext: HybridCiphertext = {
    classical: base64ToUint8Array(serialized.classical),
    postQuantum: base64ToUint8Array(serialized.postQuantum),
  };
  validateHybridCiphertext(ciphertext);
  return ciphertext;
}


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
