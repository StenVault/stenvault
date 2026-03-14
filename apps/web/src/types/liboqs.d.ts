/**
 * Type declarations for @openforge-sh/liboqs
 *
 * This package provides WASM-based post-quantum cryptography primitives.
 * Methods are synchronous (backed by WASM), not Promise-returning.
 */

declare module '@openforge-sh/liboqs' {
  /**
   * ML-KEM-768 module interface (Key Encapsulation Mechanism)
   */
  export interface MLKEM768 {
    /**
     * Generate a new ML-KEM-768 key pair
     */
    generateKeyPair(): {
      publicKey: Uint8Array;
      secretKey: Uint8Array;
    };

    /**
     * Encapsulate a shared secret to a public key
     */
    encapsulate(publicKey: Uint8Array): {
      ciphertext: Uint8Array;
      sharedSecret: Uint8Array;
    };

    /**
     * Decapsulate a shared secret from ciphertext using a secret key
     */
    decapsulate(ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array;

    /**
     * Free WASM resources
     */
    destroy(): void;
  }

  /**
   * Create an ML-KEM-768 instance
   */
  export function createMLKEM768(): Promise<MLKEM768>;

  /**
   * ML-DSA-65 module interface (Digital Signature Algorithm - FIPS 204 Level 3)
   *
   * Key sizes:
   * - Public key: 1952 bytes
   * - Secret key: 4032 bytes
   * - Signature: 3309 bytes
   */
  export interface MLDSA65 {
    /**
     * Generate a new ML-DSA-65 key pair
     */
    generateKeyPair(): {
      publicKey: Uint8Array;
      secretKey: Uint8Array;
    };

    /**
     * Sign a message using the secret key
     *
     * @param message - The message to sign
     * @param secretKey - The ML-DSA-65 secret key (4032 bytes)
     * @returns The signature (up to 3309 bytes)
     */
    sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;

    /**
     * Verify a signature against a message and public key
     *
     * @param message - The original message
     * @param signature - The signature to verify
     * @param publicKey - The ML-DSA-65 public key (1952 bytes)
     * @returns true if signature is valid, false otherwise
     */
    verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;

    /**
     * Free WASM resources
     */
    destroy(): void;
  }

  /**
   * Create an ML-DSA-65 instance
   */
  export function createMLDSA65(): Promise<MLDSA65>;
}
