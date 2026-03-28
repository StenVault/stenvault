/**
 * Web Hybrid KEM Provider
 *
 * Browser implementation of hybrid post-quantum key encapsulation using:
 * - X25519: Web Crypto API (native)
 * - ML-KEM-768: @stenvault/pqc-wasm (RustCrypto WASM)
 *
 * Architecture:
 * ```
 * Encapsulation:
 *   1. Generate ephemeral X25519 key pair
 *   2. ECDH with recipient's X25519 public key → classical shared secret
 *   3. ML-KEM-768 encapsulate to recipient's PQ public key → PQ shared secret
 *   4. HKDF-SHA256(classical || pq) → hybrid KEK
 *
 * Decapsulation:
 *   1. X25519 ECDH with sender's ephemeral public key → classical shared secret
 *   2. ML-KEM-768 decapsulate → PQ shared secret
 *   3. HKDF-SHA256(classical || pq) → hybrid KEK
 * ```
 *
 * Fallback: If ML-KEM-768 WASM is not available, operations will fail
 * and the client should use server-side hybrid KEM instead.
 */

import type {
  HybridKemProvider,
  HybridKeyPair,
  HybridPublicKey,
  HybridSecretKey,
  HybridCiphertext,
  HybridEncapsulationResult,
} from '@stenvault/shared/platform/crypto';
import {
  HYBRID_KEM_SIZES,
  HYBRID_KEM_ALGORITHMS,
  HYBRID_KEM_HKDF_INFO,
  HYBRID_KEM_HKDF_SALT,
  validateHybridPublicKey,
  validateHybridSecretKey,
  validateHybridCiphertext,
} from '@stenvault/shared/platform/crypto';
import { toArrayBuffer } from '@stenvault/shared/platform/crypto';
import { PQCWorkerClient } from '../pqcWorkerClient';
import {
  generateKemKeyPair as pqcGenerateKemKeyPair,
  encapsulate as pqcEncapsulate,
  decapsulate as pqcDecapsulate,
} from '@stenvault/pqc-wasm';

// ============ Environment Detection ============

/**
 * Returns true when PQC operations should use @stenvault/pqc-wasm directly (not via PQC Worker).
 * Direct usage when: already inside a Web Worker, or Worker API unavailable (tests/SSR).
 * PQC Worker delegation only on main browser thread where Worker API exists.
 */
function shouldUseDirect(): boolean {
  // Worker API not available (Node.js / Vitest / SSR) → use directly
  if (typeof Worker === 'undefined') return true;
  // Already inside a Web Worker (e.g. fileEncryptor.worker) → already isolated
  if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') return true;
  // Main browser thread → delegate to PQC Worker
  return false;
}

// ============ Singleton ============

let hybridKemProviderInstance: WebHybridKemProvider | null = null;

/**
 * Get the singleton Hybrid KEM provider instance
 */
export function getHybridKemProvider(): HybridKemProvider {
  if (!hybridKemProviderInstance) {
    hybridKemProviderInstance = new WebHybridKemProvider();
  }
  return hybridKemProviderInstance;
}

/**
 * Create a new Hybrid KEM provider instance (for testing)
 */
export function createHybridKemProvider(): HybridKemProvider {
  return new WebHybridKemProvider();
}

// ============ Implementation ============

export class WebHybridKemProvider implements HybridKemProvider {
  readonly algorithmId = HYBRID_KEM_ALGORITHMS.X25519_MLKEM768;
  readonly algorithm = 'x25519-ml-kem-768' as const;

  /**
   * Check if hybrid KEM (both X25519 and ML-KEM-768) is available
   */
  async isAvailable(): Promise<boolean> {
    const [x25519Available, mlkemAvailable] = await Promise.all([
      this.isClassicalOnlyAvailable(),
      this.isMLKEM768Available(),
    ]);
    return x25519Available && mlkemAvailable;
  }

  /**
   * Check if only classical (X25519) is available
   */
  async isClassicalOnlyAvailable(): Promise<boolean> {
    try {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return false;
      }

      // Try to generate an X25519 key pair
      const keyPair = await crypto.subtle.generateKey(
        { name: 'X25519' },
        true,
        ['deriveKey', 'deriveBits']
      );

      return keyPair !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check if ML-KEM-768 WASM is available
   */
  private async isMLKEM768Available(): Promise<boolean> {
    try {
      // @stenvault/pqc-wasm is always available once imported (static WASM)
      return typeof pqcGenerateKemKeyPair === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Generate a hybrid key pair (X25519 + ML-KEM-768)
   */
  async generateKeyPair(): Promise<HybridKeyPair> {
    // Generate X25519 key pair
    const x25519KeyPair = await this.generateX25519KeyPair();

    // Generate ML-KEM-768 key pair
    const mlkem768KeyPair = await this.generateMLKEM768KeyPair();

    return {
      publicKey: {
        classical: x25519KeyPair.publicKey,
        postQuantum: mlkem768KeyPair.publicKey,
      },
      secretKey: {
        classical: x25519KeyPair.secretKey,
        postQuantum: mlkem768KeyPair.secretKey,
      },
    };
  }

  /**
   * Encapsulate a shared secret to a recipient's hybrid public key
   */
  async encapsulate(publicKey: HybridPublicKey): Promise<HybridEncapsulationResult> {
    validateHybridPublicKey(publicKey);

    // Generate ephemeral X25519 key pair for ECDH
    const ephemeralX25519 = await this.generateX25519KeyPair();

    // Perform X25519 ECDH to get classical shared secret
    const classicalSecret = await this.x25519ECDH(
      ephemeralX25519.secretKey,
      publicKey.classical
    );

    // Zero ephemeral private key — no longer needed after ECDH
    ephemeralX25519.secretKey.fill(0);

    // Perform ML-KEM-768 encapsulation
    const { ciphertext: pqCiphertext, sharedSecret: pqSecret } =
      await this.mlkem768Encapsulate(publicKey.postQuantum);

    // Combine secrets via HKDF
    const hybridKEK = await this.deriveHybridKEK(classicalSecret, pqSecret);

    return {
      ciphertext: {
        classical: ephemeralX25519.publicKey,
        postQuantum: pqCiphertext,
      },
      sharedSecret: hybridKEK,
    };
  }

  /**
   * Decapsulate a shared secret using our hybrid secret key
   */
  async decapsulate(
    ciphertext: HybridCiphertext,
    secretKey: HybridSecretKey
  ): Promise<Uint8Array> {
    validateHybridCiphertext(ciphertext);
    validateHybridSecretKey(secretKey);

    let classicalSecret: Uint8Array | null = null;
    let pqSecret: Uint8Array | null = null;
    try {
      // Perform X25519 ECDH with sender's ephemeral public key
      classicalSecret = await this.x25519ECDH(
        secretKey.classical,
        ciphertext.classical
      );

      // Perform ML-KEM-768 decapsulation
      pqSecret = await this.mlkem768Decapsulate(
        ciphertext.postQuantum,
        secretKey.postQuantum
      );

      // Combine secrets via HKDF (zeroes classicalSecret + pqSecret internally)
      return await this.deriveHybridKEK(classicalSecret, pqSecret);
    } catch (e) {
      // Zero intermediates on error (deriveHybridKEK won't have zeroed them)
      classicalSecret?.fill(0);
      pqSecret?.fill(0);
      throw e;
    }
  }

  /**
   * Derive hybrid KEK from combined secrets using HKDF-SHA256
   */
  async deriveHybridKEK(
    classicalSecret: Uint8Array,
    postQuantumSecret: Uint8Array
  ): Promise<Uint8Array> {
    // Concatenate both secrets as IKM (Input Keying Material)
    const ikm = new Uint8Array(classicalSecret.length + postQuantumSecret.length);
    ikm.set(classicalSecret, 0);
    ikm.set(postQuantumSecret, classicalSecret.length);

    // Import IKM as HKDF key
    const ikmKey = await crypto.subtle.importKey(
      'raw',
      ikm,
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    // Derive 256-bit (32-byte) key using HKDF-SHA256
    const info = new TextEncoder().encode(HYBRID_KEM_HKDF_INFO);
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: HYBRID_KEM_HKDF_SALT,
        info,
      },
      ikmKey,
      256 // 32 bytes
    );

    // Zero sensitive key material after HKDF import
    ikm.fill(0);
    classicalSecret.fill(0);
    postQuantumSecret.fill(0);

    return new Uint8Array(derivedBits);
  }

  // ============ X25519 Methods ============

  /**
   * Generate X25519 key pair
   */
  private async generateX25519KeyPair(): Promise<{
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }> {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'X25519' },
      true,
      ['deriveKey', 'deriveBits']
    ) as CryptoKeyPair;

    // Export public key as raw bytes
    const publicKeyBuffer = await crypto.subtle.exportKey(
      'raw',
      keyPair.publicKey
    );

    // Export private key as PKCS8 and extract raw bytes
    const privateKeyPkcs8 = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey
    );

    // PKCS8 format for X25519 has the raw key at offset 16 (32 bytes)
    const secretKey = new Uint8Array(privateKeyPkcs8).slice(16, 48);
    if (secretKey.length !== 32) {
      throw new Error(`X25519 secret key extraction failed: expected 32 bytes, got ${secretKey.length}`);
    }

    return {
      publicKey: new Uint8Array(publicKeyBuffer),
      secretKey,
    };
  }

  /**
   * Perform X25519 ECDH to derive shared secret
   */
  private async x25519ECDH(
    privateKeyRaw: Uint8Array,
    peerPublicKeyRaw: Uint8Array
  ): Promise<Uint8Array> {
    // Import private key from raw bytes
    // We need to wrap it in PKCS8 format for importKey
    const pkcs8Header = new Uint8Array([
      0x30, 0x2e, // SEQUENCE, 46 bytes
      0x02, 0x01, 0x00, // INTEGER 0 (version)
      0x30, 0x05, // SEQUENCE, 5 bytes
      0x06, 0x03, 0x2b, 0x65, 0x6e, // OID 1.3.101.110 (X25519)
      0x04, 0x22, // OCTET STRING, 34 bytes
      0x04, 0x20, // OCTET STRING, 32 bytes (the key)
    ]);

    const pkcs8Key = new Uint8Array(pkcs8Header.length + privateKeyRaw.length);
    pkcs8Key.set(pkcs8Header, 0);
    pkcs8Key.set(privateKeyRaw, pkcs8Header.length);

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(pkcs8Key),
      { name: 'X25519' },
      false,
      ['deriveBits']
    );

    // Import peer's public key
    const peerPublicKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(peerPublicKeyRaw),
      { name: 'X25519' },
      false,
      []
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveBits(
      {
        name: 'X25519',
        public: peerPublicKey,
      },
      privateKey,
      256 // 32 bytes
    );

    return new Uint8Array(sharedSecret);
  }

  // ============ ML-KEM-768 Methods ============

  /**
   * Generate ML-KEM-768 key pair
   */
  private async generateMLKEM768KeyPair(): Promise<{
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }> {
    const direct = shouldUseDirect();
    console.warn('[HybridKEM] generateMLKEM768KeyPair', { direct });

    // Main browser thread → delegate to PQC Worker (WASM memory isolation)
    if (!direct) {
      return PQCWorkerClient.getInstance().mlkem768GenerateKeyPair();
    }

    // Already in worker context or tests → use @stenvault/pqc-wasm directly
    const { publicKey, secretKey } = await pqcGenerateKemKeyPair();

    if (publicKey.length !== HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY) {
      throw new Error(
        `Invalid ML-KEM-768 public key size: expected ${HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY}, got ${publicKey.length}`
      );
    }
    if (secretKey.length !== HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY) {
      throw new Error(
        `Invalid ML-KEM-768 secret key size: expected ${HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY}, got ${secretKey.length}`
      );
    }

    return { publicKey, secretKey };
  }

  /**
   * Perform ML-KEM-768 encapsulation
   */
  private async mlkem768Encapsulate(publicKey: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    sharedSecret: Uint8Array;
  }> {
    const direct = shouldUseDirect();
    console.warn('[HybridKEM] mlkem768Encapsulate', { direct, pkLen: publicKey.length });

    // Main browser thread → delegate to PQC Worker (WASM memory isolation)
    if (!direct) {
      return PQCWorkerClient.getInstance().mlkem768Encapsulate(publicKey);
    }

    // Already in worker context or tests → use @stenvault/pqc-wasm directly
    const { ciphertext, sharedSecret } = await pqcEncapsulate(publicKey);

    if (ciphertext.length !== HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT) {
      throw new Error(
        `Invalid ML-KEM-768 ciphertext size: expected ${HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT}, got ${ciphertext.length}`
      );
    }
    if (sharedSecret.length !== HYBRID_KEM_SIZES.MLKEM768_SHARED_SECRET) {
      throw new Error(
        `Invalid ML-KEM-768 shared secret size: expected ${HYBRID_KEM_SIZES.MLKEM768_SHARED_SECRET}, got ${sharedSecret.length}`
      );
    }

    return { ciphertext, sharedSecret };
  }

  /**
   * Perform ML-KEM-768 decapsulation
   */
  private async mlkem768Decapsulate(
    ciphertext: Uint8Array,
    secretKey: Uint8Array
  ): Promise<Uint8Array> {
    // Main browser thread → delegate to PQC Worker (WASM memory isolation)
    if (!shouldUseDirect()) {
      return PQCWorkerClient.getInstance().mlkem768Decapsulate(ciphertext, secretKey);
    }

    // Already in worker context or tests → use @stenvault/pqc-wasm directly
    const sharedSecret = await pqcDecapsulate(ciphertext, secretKey);

    if (sharedSecret.length !== HYBRID_KEM_SIZES.MLKEM768_SHARED_SECRET) {
      throw new Error(
        `Invalid ML-KEM-768 shared secret size: expected ${HYBRID_KEM_SIZES.MLKEM768_SHARED_SECRET}, got ${sharedSecret.length}`
      );
    }

    return sharedSecret;
  }
}
