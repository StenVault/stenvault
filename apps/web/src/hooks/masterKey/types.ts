import type { MasterKeyBundle, DerivedFileKeyWithBytes } from '../masterKeyCrypto';
import type { HybridSecretKey, HybridPublicKey } from '@stenvault/shared/platform/crypto';
import type { Argon2Params } from '@stenvault/shared/platform/crypto';

// ============ Device Key Store Types ============

export interface DeviceWrappedMK {
  /** Master Key wrapped with Device-KEK (Base64) */
  wrappedKey: string;
  /** User ID this key belongs to */
  userId: number;
  /** Device fingerprint hash at wrap time (invalidates if device changes) */
  deviceFingerprint: string;
  /** Timestamp of when this was created */
  createdAt: number;
}

// ============ Config & Hook Return Types ============

export interface MasterKeyConfig {
  isConfigured: boolean;
  kdfAlgorithm: 'argon2id' | null;
  salt: string | null;
  argon2Params: Argon2Params | null;
  masterKeyEncrypted: string | null;
  masterKeyVersion: number | null;
  passwordHint: string | null;
  emailSendFailed?: boolean;
  deviceVerificationRequired?: boolean;
}

export interface UseMasterKeyReturn {
  /** Encryption config from server */
  config: MasterKeyConfig | null;
  /** Whether config is loading */
  isLoading: boolean;
  /** Whether vault is unlocked (Master Key is cached and valid) */
  isUnlocked: boolean;
  /** Whether Master Key is configured on server */
  isConfigured: boolean;
  /** Whether device verification is required before vault access */
  deviceVerificationRequired: boolean;
  /** Whether the verification email failed to send */
  emailSendFailed: boolean;
  /** Current device fingerprint hash (SHA-256, 64 chars) */
  deviceFingerprint: string | null;
  /** Derive master key from password (caches result for session) */
  deriveMasterKey: (password: string) => Promise<MasterKeyBundle>;
  /** Derive unique file key from Master Key using HKDF */
  deriveFileKey: (fileId: string, timestamp: number) => Promise<CryptoKey>;
  /**
   * Derive file key WITH raw bytes for Web Worker decryption (Phase 7.1)
   * SECURITY: Caller MUST call zeroBytes() immediately after Worker postMessage!
   */
  deriveFileKeyWithBytes: (fileId: string, timestamp: number) => Promise<DerivedFileKeyWithBytes>;
  /** Derive key for filename encryption (Phase 5 Zero-Knowledge) */
  deriveFilenameKey: () => Promise<CryptoKey>;
  /** Derive key for folder name encryption (Phase C Zero-Knowledge) */
  deriveFoldernameKey: () => Promise<CryptoKey>;
  /** Derive key for thumbnail encryption (Phase 7.2) */
  deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
  /** Derive HMAC key for content fingerprinting (quantum-safe duplicate detection) */
  deriveFingerprintKey: () => Promise<CryptoKey>;
  /** Setup Master Key for new users (Phase 1.2 NEW_DAY) */
  setupMasterKey: (password: string, passwordHint?: string) => Promise<{
    success: boolean;
    recoveryCodesPlain: string[];
  }>;
  /** Get cached master key bundle without password (returns null if not cached or expired) */
  getCachedKey: () => MasterKeyBundle | null;
  /** Check if master key is cached and valid */
  isCached: boolean;
  /** Clear the cached master key (locks the vault) */
  clearCache: () => void;
  /** Whether derivation is in progress */
  isDerivingKey: boolean;
  /** Error message if derivation failed */
  error: string | null;
  /** Refetch config from server */
  refetchConfig: () => void;
  // ===== Phase 2 NEW_DAY: Hybrid KEM =====
  /** Whether user has a hybrid keypair configured */
  hasHybridKeyPair: boolean;
  /** Get user's hybrid public key for encryption (fetches from server, throws if unavailable) */
  getHybridPublicKey: () => Promise<HybridPublicKey>;
  /** Get unlocked hybrid secret key for decryption (unwraps with Master Key) */
  getUnlockedHybridSecretKey: () => Promise<HybridSecretKey | null>;
}

// ============ Shared Helpers ============

/**
 * Generate a key fingerprint from concatenated public keys (SHA-256, first 16 bytes hex).
 * Used for both KEM and Signature keypairs.
 */
export async function generateKeyFingerprint(classicalPub: Uint8Array, pqPub: Uint8Array): Promise<string> {
  const data = new Uint8Array(classicalPub.length + pqPub.length);
  data.set(classicalPub, 0);
  data.set(pqPub, classicalPub.length);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash).slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
