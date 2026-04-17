/**
 * Browser implementation of Argon2id using hash-wasm (WebAssembly).
 * Used for deriving Key Encryption Keys (KEK) from the master password.
 *
 * Performance characteristics:
 * - First call ~200ms (WASM initialization)
 * - Subsequent calls: depends on parameters
 * - With OWASP 2024 params (46 MiB, t=1): ~500-1500ms depending on device
 */

import { argon2id } from 'hash-wasm';
import type { Argon2Provider, Argon2Params, Argon2DeriveResult } from '@stenvault/shared/platform/crypto';
import {
  ARGON2_PARAMS,
  mergeArgon2Params,
  validateArgon2Params,
} from '@stenvault/shared/platform/crypto';
import { constantTimeEqual } from '@stenvault/shared/platform/crypto';

// ============ Singleton ============

let argon2ProviderInstance: WebArgon2Provider | null = null;

/**
 * Get the singleton Argon2 provider instance
 */
export function getArgon2Provider(): Argon2Provider {
  if (!argon2ProviderInstance) {
    argon2ProviderInstance = new WebArgon2Provider();
  }
  return argon2ProviderInstance;
}

/**
 * Create a new Argon2 provider instance (for testing)
 */
export function createArgon2Provider(): Argon2Provider {
  return new WebArgon2Provider();
}

// ============ Implementation ============

export class WebArgon2Provider implements Argon2Provider {
  private wasmInitialized = false;

  /**
   * Check if Argon2id is available on this platform
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to initialize WASM with minimal params
      await argon2id({
        password: 'test',
        salt: new Uint8Array(16),
        memorySize: 1024, // 1 MiB - minimal for test
        iterations: 1,
        parallelism: 1,
        hashLength: 32,
        outputType: 'binary',
      });
      this.wasmInitialized = true;
      return true;
    } catch (error) {
      console.error('[WebArgon2Provider] WASM not available:', error);
      return false;
    }
  }

  /**
   * Derive a key from password using Argon2id
   */
  async deriveKey(
    password: string,
    salt: Uint8Array,
    params?: Partial<Argon2Params>
  ): Promise<Argon2DeriveResult> {
    const mergedParams = mergeArgon2Params(params);
    validateArgon2Params(mergedParams);

    // Validate salt
    if (salt.length < 16) {
      throw new Error('Salt must be at least 16 bytes (RFC 9106)');
    }

    try {
      const hash = await argon2id({
        password,
        salt,
        memorySize: mergedParams.memoryCost,
        iterations: mergedParams.timeCost,
        parallelism: mergedParams.parallelism,
        hashLength: mergedParams.hashLength,
        outputType: 'binary',
      });

      this.wasmInitialized = true;

      return {
        key: hash,
        salt,
        params: mergedParams,
      };
    } catch (error) {
      // Handle specific hash-wasm errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('memory')) {
        throw new Error(
          `Argon2id failed: insufficient memory. Try reducing memoryCost from ${mergedParams.memoryCost} KiB`
        );
      }

      throw new Error(`Argon2id key derivation failed: ${errorMessage}`);
    }
  }

  /**
   * Derive a key and generate new random salt
   */
  async deriveKeyWithNewSalt(
    password: string,
    params?: Partial<Argon2Params>
  ): Promise<Argon2DeriveResult> {
    const salt = this.generateSalt();
    return this.deriveKey(password, salt, params);
  }

  /**
   * Verify a password against a known hash
   */
  async verify(
    password: string,
    expectedKey: Uint8Array,
    salt: Uint8Array,
    params: Argon2Params
  ): Promise<boolean> {
    try {
      const result = await this.deriveKey(password, salt, params);
      return constantTimeEqual(result.key, expectedKey);
    } catch {
      // On any error, return false (don't leak info about what failed)
      return false;
    }
  }

  /**
   * Benchmark Argon2 on this device
   */
  async benchmark(params?: Partial<Argon2Params>): Promise<number> {
    const mergedParams = mergeArgon2Params(params);
    const testPassword = 'benchmark-test-password';
    const testSalt = this.generateSalt();

    const start = performance.now();
    await this.deriveKey(testPassword, testSalt, mergedParams);
    const end = performance.now();

    return end - start;
  }

  // ============ Private Methods ============

  /**
   * Generate random salt
   */
  private generateSalt(): Uint8Array {
    const salt = new Uint8Array(ARGON2_PARAMS.saltLength);
    crypto.getRandomValues(salt);
    return salt;
  }
}
