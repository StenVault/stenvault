/**
 * Crypto Types and Constants
 *
 * Shared cryptographic type definitions and constants used across the platform.
 */

// Global type declarations for Web Crypto API types
// These are available in browsers but need declaration for Node.js/React Native

/**
 * JsonWebKey type (standard Web Crypto API)
 * Represents a JSON Web Key for key import/export
 */
declare global {
    interface JsonWebKey {
        alg?: string;
        crv?: string;
        d?: string;
        dp?: string;
        dq?: string;
        e?: string;
        ext?: boolean;
        k?: string;
        key_ops?: string[];
        kty?: string;
        n?: string;
        oth?: RsaOtherPrimesInfo[];
        p?: string;
        q?: string;
        qi?: string;
        use?: string;
        x?: string;
        y?: string;
    }

    interface RsaOtherPrimesInfo {
        d?: string;
        r?: string;
        t?: string;
    }
}


export const CRYPTO_CONSTANTS = {
    /** PBKDF2 iterations (OWASP 2024 recommendation) */
    PBKDF2_ITERATIONS: 600_000,
    /** AES key length in bits */
    AES_KEY_LENGTH: 256,
    /** AES key length in bytes (256 bits = 32 bytes) */
    AES_KEY_LENGTH_BYTES: 32,
    /** GCM IV length in bytes (96 bits) */
    GCM_IV_LENGTH: 12,
    /** Salt length in bytes */
    SALT_LENGTH: 32,
    /** RSA modulus length for P2P */
    RSA_MODULUS_LENGTH: 2048,
    /** Chunk size for streaming encryption (64 KB) */
    STREAMING_CHUNK_SIZE: 64 * 1024,
    /** Maximum allowed chunk size for CVEF streaming decryption (128 MB) */
    MAX_CHUNK_SIZE: 128 * 1024 * 1024,
    /** Number of bytes from the base IV used in chunk IV derivation */
    DERIVE_IV_BASE_LENGTH: 8,
} as const;


/**
 * AES encryption result
 */
export interface AESEncryptResult {
    /** Encrypted data as ArrayBuffer */
    ciphertext: ArrayBuffer;
    /** Initialization vector (12 bytes for GCM) */
    iv: Uint8Array;
    /** Authentication tag (included in GCM ciphertext) */
}

/**
 * Key derivation result
 */
export interface DerivedKeyResult {
    /** The derived key (opaque, platform-specific) */
    key: CryptoKeyLike;
    /** Salt used for derivation */
    salt: Uint8Array;
}

/**
 * RSA key pair for P2P encryption
 */
export interface RSAKeyPair {
    /** Public key in JWK format (shareable) */
    publicKeyJwk: JsonWebKey;
    /** Private key (platform-specific, non-exportable if possible) */
    privateKey: CryptoKeyLike;
    /** Public key fingerprint (hex, for verification) */
    fingerprint: string;
}

/**
 * ECDH key pair for E2E chat
 */
export interface ECDHKeyPair {
    /** Public key in JWK format */
    publicKeyJwk: JsonWebKey;
    /** Private key in JWK format (stored in secure storage) */
    privateKeyJwk: JsonWebKey;
}

/**
 * Platform-specific crypto key type
 *
 * On web this is typically CryptoKey from the Web Crypto API.
 * Using a branded approach to allow any object type while preserving type safety
 * at the call site level.
 */
export type CryptoKeyLike = Uint8Array | (object & { readonly __brand?: 'CryptoKeyLike' });
