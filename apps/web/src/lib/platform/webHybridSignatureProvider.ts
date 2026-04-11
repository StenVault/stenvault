/**
 * Web Hybrid Signature Provider (Phase 3.4 Sovereign)
 *
 * Browser implementation of hybrid post-quantum digital signatures using:
 * - Ed25519: Web Crypto API (native)
 * - ML-DSA-65: @stenvault/pqc-wasm (RustCrypto WASM)
 *
 * Architecture:
 * ```
 * Signing:
 *   1. Create contextual message (context || 0x00 || message)
 *   2. Sign with Ed25519 → classical signature
 *   3. Sign with ML-DSA-65 → post-quantum signature
 *   4. Return combined hybrid signature
 *
 * Verification:
 *   1. Recreate contextual message
 *   2. Verify Ed25519 signature
 *   3. Verify ML-DSA-65 signature
 *   4. Both must pass for overall validity
 * ```
 *
 * Fallback: If ML-DSA-65 WASM is not available, operations will fail
 * and the client should use server-side signing instead.
 */

import type {
  HybridSignatureProvider,
  HybridSignatureKeyPair,
  HybridSignaturePublicKey,
  HybridSignatureSecretKey,
  HybridSignature,
  SignatureVerificationResult,
  SignatureContext,
} from '@stenvault/shared/platform/crypto';
import {
  HYBRID_SIGNATURE_SIZES,
  HYBRID_SIGNATURE_ALGORITHMS,
  SIGNATURE_CONTEXTS,
  validateHybridSignaturePublicKey,
  validateHybridSignatureSecretKey,
  validateHybridSignature,
  createContextualMessage,
} from '@stenvault/shared/platform/crypto';
import { toArrayBuffer } from '@stenvault/shared/platform/crypto';
import { PQCWorkerClient } from '../pqcWorkerClient';
import { devWarn } from '@/lib/debugLogger';
import {
  generateSignatureKeyPair as pqcGenerateSignatureKeyPair,
  sign as pqcSign,
  verify as pqcVerify,
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
  // Already inside a Web Worker → already isolated
  if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') return true;
  // Main browser thread → delegate to PQC Worker
  return false;
}

// ============ Singleton ============

let hybridSignatureProviderInstance: WebHybridSignatureProvider | null = null;

/**
 * Get the singleton Hybrid Signature provider instance
 */
export function getHybridSignatureProvider(): HybridSignatureProvider {
  if (!hybridSignatureProviderInstance) {
    hybridSignatureProviderInstance = new WebHybridSignatureProvider();
  }
  return hybridSignatureProviderInstance;
}

/**
 * Create a new Hybrid Signature provider instance (for testing)
 */
export function createHybridSignatureProvider(): HybridSignatureProvider {
  return new WebHybridSignatureProvider();
}

// ============ Implementation ============

export class WebHybridSignatureProvider implements HybridSignatureProvider {
  readonly algorithmId = HYBRID_SIGNATURE_ALGORITHMS.ED25519_MLDSA65;
  readonly algorithm = 'ed25519-ml-dsa-65' as const;

  /**
   * Check if hybrid signatures (both Ed25519 and ML-DSA-65) are available
   */
  async isAvailable(): Promise<boolean> {
    const [ed25519Available, mldsa65Available] = await Promise.all([
      this.isClassicalOnlyAvailable(),
      this.isMLDSA65Available(),
    ]);
    return ed25519Available && mldsa65Available;
  }

  /**
   * Check if only classical (Ed25519) is available
   */
  async isClassicalOnlyAvailable(): Promise<boolean> {
    try {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return false;
      }

      // Try to generate an Ed25519 key pair
      const keyPair = await crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true,
        ['sign', 'verify']
      );

      return keyPair !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check if ML-DSA-65 WASM is available
   */
  private async isMLDSA65Available(): Promise<boolean> {
    try {
      return typeof pqcGenerateSignatureKeyPair === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Generate a hybrid signature key pair (Ed25519 + ML-DSA-65)
   */
  async generateKeyPair(): Promise<HybridSignatureKeyPair> {
    // Generate Ed25519 key pair
    const ed25519KeyPair = await this.generateEd25519KeyPair();

    // Generate ML-DSA-65 key pair
    const mldsa65KeyPair = await this.generateMLDSA65KeyPair();

    return {
      publicKey: {
        classical: ed25519KeyPair.publicKey,
        postQuantum: mldsa65KeyPair.publicKey,
      },
      secretKey: {
        classical: ed25519KeyPair.secretKey,
        postQuantum: mldsa65KeyPair.secretKey,
      },
    };
  }

  /**
   * Sign a message with both classical and post-quantum algorithms
   */
  async sign(
    message: Uint8Array,
    secretKey: HybridSignatureSecretKey,
    context: SignatureContext
  ): Promise<HybridSignature> {
    validateHybridSignatureSecretKey(secretKey);

    // Create contextual message with domain separator
    const contextualMessage = createContextualMessage(message, context);

    // Sign with Ed25519
    const classicalSignature = await this.signEd25519(contextualMessage, secretKey.classical);

    // Sign with ML-DSA-65
    const postQuantumSignature = await this.signMLDSA65(contextualMessage, secretKey.postQuantum);

    return {
      classical: classicalSignature,
      postQuantum: postQuantumSignature,
      context,
      signedAt: Date.now(),
    };
  }

  /**
   * Verify a hybrid signature
   *
   * Both signatures must be valid for the verification to pass.
   */
  async verify(
    message: Uint8Array,
    signature: HybridSignature,
    publicKey: HybridSignaturePublicKey
  ): Promise<SignatureVerificationResult> {
    try {
      validateHybridSignature(signature);
      validateHybridSignaturePublicKey(publicKey);

      // Recreate contextual message
      const contextualMessage = createContextualMessage(message, signature.context);

      // Verify both signatures in parallel
      const [classicalValid, postQuantumValid] = await Promise.all([
        this.verifyEd25519(contextualMessage, signature.classical, publicKey.classical),
        this.verifyMLDSA65(contextualMessage, signature.postQuantum, publicKey.postQuantum),
      ]);

      return {
        valid: classicalValid && postQuantumValid,
        classicalValid,
        postQuantumValid,
      };
    } catch (error) {
      return {
        valid: false,
        classicalValid: false,
        postQuantumValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sign with only classical (Ed25519) algorithm
   */
  async signClassicalOnly(
    message: Uint8Array,
    secretKey: Uint8Array,
    context: SignatureContext
  ): Promise<Uint8Array> {
    const contextualMessage = createContextualMessage(message, context);
    return this.signEd25519(contextualMessage, secretKey);
  }

  /**
   * Verify classical (Ed25519) signature only
   */
  async verifyClassicalOnly(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    context: SignatureContext
  ): Promise<boolean> {
    const contextualMessage = createContextualMessage(message, context);
    return this.verifyEd25519(contextualMessage, signature, publicKey);
  }

  // ============ Ed25519 Methods ============

  /**
   * Generate Ed25519 key pair
   */
  private async generateEd25519KeyPair(): Promise<{
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }> {
    const keyPair = (await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;

    // Export public key as raw bytes
    const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);

    // Export private key as PKCS8
    const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    // PKCS8 format for Ed25519: the raw 32-byte seed is at a specific offset
    // The full secret key is seed (32 bytes) + public key (32 bytes) = 64 bytes
    const pkcs8Array = new Uint8Array(privateKeyPkcs8);

    // Extract seed from PKCS8 (last 32 bytes before any padding)
    const seed = pkcs8Array.slice(-32);

    // Combine seed + public key to form the standard Ed25519 secret key format (64 bytes)
    const publicKeyArray = new Uint8Array(publicKeyBuffer);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(publicKeyArray, 32);

    return {
      publicKey: publicKeyArray,
      secretKey,
    };
  }

  /**
   * Sign message with Ed25519
   */
  private async signEd25519(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
    // Extract the seed (first 32 bytes) from the secret key
    const seed = secretKey.slice(0, 32);

    // Build PKCS8 wrapper for the seed
    const pkcs8Header = new Uint8Array([
      0x30,
      0x2e, // SEQUENCE, 46 bytes
      0x02,
      0x01,
      0x00, // INTEGER 0 (version)
      0x30,
      0x05, // SEQUENCE, 5 bytes
      0x06,
      0x03,
      0x2b,
      0x65,
      0x70, // OID 1.3.101.112 (Ed25519)
      0x04,
      0x22, // OCTET STRING, 34 bytes
      0x04,
      0x20, // OCTET STRING, 32 bytes (the seed)
    ]);

    const pkcs8Key = new Uint8Array(pkcs8Header.length + seed.length);
    pkcs8Key.set(pkcs8Header, 0);
    pkcs8Key.set(seed, pkcs8Header.length);

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(pkcs8Key),
      { name: 'Ed25519' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('Ed25519', privateKey, toArrayBuffer(message));

    return new Uint8Array(signature);
  }

  /**
   * Verify Ed25519 signature
   */
  private async verifyEd25519(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(publicKey),
        { name: 'Ed25519' },
        false,
        ['verify']
      );

      return await crypto.subtle.verify('Ed25519', key, toArrayBuffer(signature), toArrayBuffer(message));
    } catch (error) {
      // Log verification errors to help debug crypto issues vs invalid signatures
      devWarn(
        '[WebHybridSignatureProvider] Ed25519 verification error:',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  // ============ ML-DSA-65 Methods ============

  /**
   * Generate ML-DSA-65 key pair
   */
  private async generateMLDSA65KeyPair(): Promise<{
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }> {
    // Main browser thread → delegate to PQC Worker (WASM memory isolation)
    if (!shouldUseDirect()) {
      return PQCWorkerClient.getInstance().mldsa65GenerateKeyPair();
    }

    // Already in worker context or tests → use @stenvault/pqc-wasm directly
    const { publicKey, secretKey } = await pqcGenerateSignatureKeyPair();

    if (publicKey.length !== HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY) {
      throw new Error(
        `Invalid ML-DSA-65 public key size: expected ${HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY}, got ${publicKey.length}`
      );
    }
    if (secretKey.length !== HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY) {
      throw new Error(
        `Invalid ML-DSA-65 secret key size: expected ${HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY}, got ${secretKey.length}`
      );
    }

    return { publicKey, secretKey };
  }

  /**
   * Sign message with ML-DSA-65
   */
  private async signMLDSA65(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
    // Main browser thread → delegate to PQC Worker (WASM memory isolation)
    if (!shouldUseDirect()) {
      return PQCWorkerClient.getInstance().mldsa65Sign(message, secretKey);
    }

    // Already in worker context or tests → use @stenvault/pqc-wasm directly
    const signature = await pqcSign(message, secretKey);

    if (signature.length !== HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE) {
      throw new Error(
        `Invalid ML-DSA-65 signature size: expected ${HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE}, got ${signature.length}`
      );
    }

    return signature;
  }

  /**
   * Verify ML-DSA-65 signature
   */
  private async verifyMLDSA65(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    // Main browser thread → delegate to PQC Worker (WASM memory isolation)
    if (!shouldUseDirect()) {
      try {
        return await PQCWorkerClient.getInstance().mldsa65Verify(message, signature, publicKey);
      } catch (error) {
        devWarn(
          '[WebHybridSignatureProvider] ML-DSA-65 worker verification error:',
          error instanceof Error ? error.message : String(error)
        );
        return false;
      }
    }

    // Already in worker context or tests → use @stenvault/pqc-wasm directly
    try {
      return await pqcVerify(message, signature, publicKey);
    } catch (error) {
      devWarn(
        '[WebHybridSignatureProvider] ML-DSA-65 verification error:',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }
}
