/**
 * Argon2id Key Derivation Interface
 *
 * Platform-agnostic abstraction for Argon2id password hashing. Used for
 * deriving Key Encryption Keys (KEK).
 *
 * Implementations:
 * - Web: argon2-browser (WebAssembly)
 * - React Native: react-native-argon2 (native)
 *
 * OWASP 2024 Reference:
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */

// ============ Constants ============

/**
 * Argon2id parameters following OWASP 2024 recommendations
 *
 * These parameters provide strong protection against:
 * - GPU attacks (memory-hard)
 * - ASIC attacks (memory-hard + time-hard)
 * - Side-channel attacks (Argon2id hybrid mode)
 *
 * Memory: 46 MiB (47104 KiB)
 * Time: 1 iteration
 * Parallelism: 1 lane
 * Output: 32 bytes (256 bits)
 */
export const ARGON2_PARAMS = {
  /** Algorithm type (Argon2id for hybrid defense) */
  type: 'argon2id' as const,
  /** Memory cost in KiB (46 MiB = 47104 KiB) */
  memoryCost: 47104,
  /** Time cost (iterations) */
  timeCost: 1,
  /** Degree of parallelism */
  parallelism: 1,
  /** Output hash length in bytes */
  hashLength: 32,
  /** Salt length in bytes */
  saltLength: 32,
} as const;

/**
 * Minimum acceptable parameters for legacy/constrained devices
 * Only use when ARGON2_PARAMS causes OOM or excessive latency
 */
export const ARGON2_PARAMS_CONSTRAINED = {
  type: 'argon2id' as const,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  saltLength: 32,
} as const;

// ============ Types ============

/**
 * Argon2 algorithm variant
 */
export type Argon2Type = 'argon2d' | 'argon2i' | 'argon2id';

/**
 * Parameters for Argon2 hashing
 */
export interface Argon2Params {
  /** Algorithm type (always 'argon2id' for new keys) */
  type: Argon2Type;
  /** Memory cost in KiB */
  memoryCost: number;
  /** Time cost (iterations) */
  timeCost: number;
  /** Degree of parallelism */
  parallelism: number;
  /** Output hash length in bytes */
  hashLength: number;
}

/**
 * Result of Argon2 key derivation
 */
export interface Argon2DeriveResult {
  /** The derived key bytes */
  key: Uint8Array;
  /** Salt used for derivation */
  salt: Uint8Array;
  /** Parameters used (for storage) */
  params: Argon2Params;
}

/**
 * Argon2 Provider Interface
 *
 * Platform-specific implementations must provide these methods.
 * All methods are async to support both WASM and native implementations.
 */
export interface Argon2Provider {
  /**
   * Check if Argon2id is available on this platform
   * Some older devices may not support WASM or the native module
   */
  isAvailable(): Promise<boolean>;

  /**
   * Derive a key from password using Argon2id
   *
   * @param password - User password (UTF-8 string)
   * @param salt - Salt bytes (32 bytes recommended)
   * @param params - Argon2 parameters (defaults to ARGON2_PARAMS)
   * @returns Derived key bytes and parameters used
   *
   * @throws Error if Argon2 is not available or parameters are invalid
   */
  deriveKey(
    password: string,
    salt: Uint8Array,
    params?: Partial<Argon2Params>
  ): Promise<Argon2DeriveResult>;

  /**
   * Derive a key and generate new random salt
   * Convenience method that generates a cryptographically random salt internally
   *
   * @param password - User password (UTF-8 string)
   * @param params - Argon2 parameters (defaults to ARGON2_PARAMS)
   * @returns Derived key bytes, generated salt, and parameters used
   */
  deriveKeyWithNewSalt(
    password: string,
    params?: Partial<Argon2Params>
  ): Promise<Argon2DeriveResult>;

  /**
   * Verify a password against a known hash
   * Uses constant-time comparison to prevent timing attacks
   *
   * @param password - Password to verify
   * @param expectedKey - Expected derived key
   * @param salt - Salt used for original derivation
   * @param params - Parameters used for original derivation
   * @returns true if password matches
   */
  verify(
    password: string,
    expectedKey: Uint8Array,
    salt: Uint8Array,
    params: Argon2Params
  ): Promise<boolean>;

  /**
   * Benchmark Argon2 on this device
   * Returns execution time in milliseconds
   * Useful for adaptive parameter selection
   *
   * @param params - Parameters to benchmark
   * @returns Execution time in ms
   */
  benchmark(params?: Partial<Argon2Params>): Promise<number>;
}

/**
 * Factory function type for creating Argon2 providers
 */
export type Argon2ProviderFactory = () => Argon2Provider;

// ============ Utility Functions ============

/**
 * Validate Argon2 parameters
 *
 * @param params - Parameters to validate
 * @throws Error if parameters are invalid or insecure
 */
export function validateArgon2Params(params: Argon2Params): void {
  if (params.type !== 'argon2id') {
    throw new Error('Only argon2id is supported for key derivation');
  }

  // Minimum security bounds (OWASP recommendations)
  if (params.memoryCost < 15360) { // 15 MiB minimum
    throw new Error('Memory cost too low (minimum 15 MiB / 15360 KiB)');
  }

  if (params.timeCost < 1) {
    throw new Error('Time cost must be at least 1');
  }

  if (params.parallelism < 1) {
    throw new Error('Parallelism must be at least 1');
  }

  if (params.hashLength < 32) {
    throw new Error('Hash length must be at least 32 bytes for AES-256');
  }

  // Reasonable upper bounds to prevent DoS
  if (params.memoryCost > 1048576) { // 1 GiB
    throw new Error('Memory cost too high (maximum 1 GiB / 1048576 KiB)');
  }

  if (params.timeCost > 10) {
    throw new Error('Time cost too high (maximum 10 iterations)');
  }
}

/**
 * Merge partial params with defaults
 */
export function mergeArgon2Params(partial?: Partial<Argon2Params>): Argon2Params {
  return {
    type: partial?.type ?? ARGON2_PARAMS.type,
    memoryCost: partial?.memoryCost ?? ARGON2_PARAMS.memoryCost,
    timeCost: partial?.timeCost ?? ARGON2_PARAMS.timeCost,
    parallelism: partial?.parallelism ?? ARGON2_PARAMS.parallelism,
    hashLength: partial?.hashLength ?? ARGON2_PARAMS.hashLength,
  };
}

/**
 * Serialize Argon2 params for storage
 */
export function serializeArgon2Params(params: Argon2Params): string {
  return JSON.stringify(params);
}

/**
 * Deserialize Argon2 params from storage
 */
export function deserializeArgon2Params(json: string): Argon2Params {
  const parsed = JSON.parse(json) as Argon2Params;
  validateArgon2Params(parsed);
  return parsed;
}
