/**
 * useMasterKey Hook
 *
 * Provides master key derivation for signing and encryption operations.
 * Derives KEK from password using Argon2id, then unwraps the master key.
 *
 * Features:
 * - Hybrid keypair generation during setup (X25519 + ML-KEM-768)
 * - Functions to fetch and unwrap hybrid secret keys
 * - Session-level caching (key survives re-renders, not page refresh)
 * - Configurable timeout (default: 30 minutes)
 * - Automatic cache invalidation
 *
 * Architecture:
 * Password → Argon2id → KEK → AES-KW Unwrap → Master Key
 */

import { useCallback, useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { base64ToArrayBuffer, arrayBufferToBase64 } from '@/lib/platform';
import { generateRecoveryCodes } from '@/lib/recoveryCodeUtils';
import { debugLog, debugError, devWarn } from '@/lib/debugLogger';
import { loadUES, deriveDeviceKEK as deriveDeviceKEKFromUES } from '@/lib/uesManager';
import { getDeviceFingerprintHash } from '@/lib/deviceEntropy';
import {
  toArrayBuffer,
  encryptLargeSecretKey,
  decryptLargeSecretKey,
  deriveArgon2Key,
  unwrapMasterKey,
  createMasterKeyBundle,
  wrapSecretWithMK,
  unwrapSecretWithMK,
  deriveFileKeyFromMaster,
  deriveFileKeyWithBytesFromMaster,
  deriveFilenameKeyFromMaster,
  deriveFoldernameKeyFromMaster,
  deriveFingerprintKeyFromMaster,
  deriveThumbnailKeyFromMaster,
} from '../masterKeyCrypto';
import type { MasterKeyBundle } from '../masterKeyCrypto';
import type { HybridSecretKey, HybridPublicKey } from '@stenvault/shared/platform/crypto';
import { ARGON2_PARAMS, type Argon2Params } from '@stenvault/shared/platform/crypto';
import type { DerivedFileKeyWithBytes } from '../masterKeyCrypto';

// Sibling modules
import type { MasterKeyConfig, UseMasterKeyReturn } from './types';
import {
  DEFAULT_CACHE_TIMEOUT_MS,
  subscribeToCacheChanges,
  getCacheVersion,
  isCacheValid,
  getCachedMasterKey,
  cacheMasterKey,
  clearMasterKeyCache,
  getHybridSecretKeyCache,
  setHybridSecretKeyCache,
} from './sessionCache';
import { storeDeviceWrappedMK, loadDeviceWrappedMK, clearDeviceWrappedMK } from './deviceKeyStore';
import { migrateHybridKemKeyPair, migrateSignatureKeyPair, registerDeviceWithUES } from './migrations';
import { generateAndStoreKeyPairs } from './setupFlow';

// ============ Hook ============

/**
 * Hook for deriving master key from password
 *
 * Features:
 * - Session-level caching (survives re-renders, cleared on page refresh)
 * - Automatic cache expiration (default: 30 minutes)
 * - Per-user cache isolation
 *
 * @returns Master key derivation utilities
 */
export function useMasterKey(): UseMasterKeyReturn {
  const [isDerivingKey, setIsDerivingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);
  const [fingerprintReady, setFingerprintReady] = useState(false);
  const { user } = useAuth();

  // Compute device fingerprint once on mount.
  // Sets fingerprintReady in finally so the config query waits for resolution —
  // this guarantees a single query key per session, preventing stale-cache loops.
  useEffect(() => {
    let cancelled = false;
    getDeviceFingerprintHash()
      .then((hash) => { if (!cancelled) setDeviceFingerprint(hash); })
      .catch(() => { /* Non-critical — device verification will be skipped */ })
      .finally(() => { if (!cancelled) setFingerprintReady(true); });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to module-level cache changes for reactive isUnlocked/isCached
  const currentCacheVersion = useSyncExternalStore(subscribeToCacheChanges, getCacheVersion);

  // Fetch encryption config from server (includes device fingerprint for verification gate)
  const configInput = useMemo(
    () => deviceFingerprint ? { deviceFingerprint } : undefined,
    [deviceFingerprint]
  );
  const { data: config, isLoading: configLoading, refetch } = trpc.encryption.getEncryptionConfig.useQuery(configInput, {
    enabled: !!user?.id && fingerprintReady,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    // Poll while device verification is pending — WebSocket is unreliable on mobile
    // (tab backgrounding, network handoff). Stops when deviceVerificationRequired goes false.
    refetchInterval: (query) =>
      query.state.data?.deviceVerificationRequired ? 5_000 : false,
  });

  // Unified loading: covers fingerprint resolution + config query fetch.
  // Prevents MasterKeyGuard from seeing isLoading=false while config is still undefined.
  const isLoading = !fingerprintReady || configLoading;

  const trpcUtils = trpc.useUtils();

  // Check if cache is valid for current user
  const isCached = useMemo(() => {
    if (!user?.id) return false;
    return isCacheValid(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentCacheVersion]);

  // Get cached key bundle for current user
  const getCachedKey = useCallback((): MasterKeyBundle | null => {
    if (!user?.id) return null;
    return getCachedMasterKey(user.id);
  }, [user?.id]);

  // Clear cache
  const clearCache = useCallback(() => {
    clearMasterKeyCache();
  }, []);

  // Mutations (declared before deriveMasterKey which uses them)
  const setupMasterKeyMutation = trpc.encryption.setupMasterKey.useMutation();
  const registerDeviceMutation = trpc.devices.registerTrustedDevice.useMutation();

  // Hybrid KEM — declared before deriveMasterKey so migrations can find it.
  const storeHybridKeyPairMutation = trpc.hybridKem.storeKeyPair.useMutation();
  const { data: hasKeyPairData, refetch: refetchHasKeyPair } = trpc.hybridKem.hasKeyPair.useQuery(
    undefined,
    { enabled: !!user?.id, staleTime: 5 * 60 * 1000 }
  );

  // Hybrid signatures (ML-DSA-65 + Ed25519) — auto-generated the same way as KEM keys.
  const storeSignatureKeyPairMutation = trpc.hybridSignature.storeKeyPair.useMutation();
  const { data: hasSignatureKeyPairData, refetch: refetchHasSignatureKeyPair } = trpc.hybridSignature.hasKeyPair.useQuery(
    undefined,
    { enabled: !!user?.id, staleTime: 5 * 60 * 1000 }
  );

  // Dual-KEK derivation: tries the device fast-path (Device-KEK + UES)
  // first, falls back to the slow Argon2id password path if the fast
  // path can't unwrap.
  const deriveMasterKey = useCallback(
    async (password: string): Promise<MasterKeyBundle> => {
      if (import.meta.env.DEV) devWarn('[MK] deriveMasterKey called', { configLoaded: !!config, isConfigured: config?.isConfigured });
      debugLog('[key]', 'deriveMasterKey called', { userId: user?.id, configLoaded: !!config, isConfigured: config?.isConfigured });

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Check cache first
      const cachedBundle = getCachedMasterKey(user.id);
      if (cachedBundle) {
        debugLog('[key]', 'Using cached master key');
        return cachedBundle;
      }

      if (!config?.isConfigured) {
        throw new Error('Encryption not configured. Please check your connection and try again.');
      }

      if (!config.salt) {
        throw new Error('Missing encryption salt. Please refresh the page.');
      }

      // Guard: Web Crypto API requires a secure context (HTTPS or localhost)
      if (!globalThis.crypto?.subtle) {
        const ctx = typeof window !== 'undefined'
          ? `URL: ${window.location.href}, isSecureContext: ${window.isSecureContext}`
          : 'non-browser context';
        throw new Error(
          `Web Crypto API is not available (crypto.subtle is undefined). ` +
          `This requires HTTPS or localhost. ${ctx}`
        );
      }

      setIsDerivingKey(true);
      setError(null);

      try {
        const saltBytes = new Uint8Array(base64ToArrayBuffer(config.salt));
        if (import.meta.env.DEV) devWarn('[MK] Config:', {
          kdf: config.kdfAlgorithm,
          hasMKE: !!config.masterKeyEncrypted,
          saltLen: config.salt?.length,
        });
        debugLog('[key]', 'Config loaded', {
          kdfAlgorithm: config.kdfAlgorithm,
          hasArgon2Params: !!config.argon2Params,
          hasMasterKeyEncrypted: !!config.masterKeyEncrypted,
        });

        // Guard: masterKeyEncrypted must exist (no legacy users without key wrapping)
        if (!config.masterKeyEncrypted) {
          throw new Error('Invalid encryption configuration: master key not found. Please re-setup your Master Key.');
        }

        // === NORMAL PATH: masterKeyEncrypted is set ===
        if (import.meta.env.DEV) devWarn('[MK] NORMAL PATH: unwrapping masterKeyEncrypted');
        let bundle: MasterKeyBundle | undefined;
        let uesDataForRewrap: { ues: Uint8Array; fingerprintHash: string } | null = null;

        // Try the fast-path first: Device-KEK + locally wrapped MK.
        try {
          const uesData = await loadUES();
          if (uesData) {
            uesDataForRewrap = uesData;
            const deviceMK = await loadDeviceWrappedMK(user.id);
            if (deviceMK) {
              debugLog('[fast]', 'Trying UES fast-path (Device-KEK + local wrapped key)');
              const deviceKek = await deriveDeviceKEKFromUES(password, uesData.ues, saltBytes);
              try {
                const result = await unwrapMasterKey(deviceMK.wrappedKey, deviceKek);
                bundle = result.bundle;
                debugLog('[ok]', 'Fast-path unlock successful (~100ms)');
              } catch {
                // Wrong password or stale local key - clear it and fall through
                debugLog('[warn]', 'Fast-path unwrap failed, clearing stale local key');
                clearDeviceWrappedMK();
              }
            } else {
              debugLog('[key]', 'UES available but no local device-wrapped key yet');
            }
          }
        } catch (uesError) {
          debugLog('[warn]', 'UES fast-path unavailable:', uesError);
        }

        // Slow-path: Base-KEK from server
        if (!bundle) {
          if (import.meta.env.DEV) devWarn('[MK] SLOW PATH: deriving Base-KEK');
          debugLog('[slow]', 'Using slow-path (Base-KEK)');
          if (!config.argon2Params) {
            throw new Error('Invalid encryption configuration: missing Argon2id params');
          }
          debugLog('[key]', 'Deriving KEK with Argon2id...');
          const kek = await deriveArgon2Key(password, saltBytes, config.argon2Params as Argon2Params);
          debugLog('[ok]', 'Argon2id derivation complete');

          // Unwrap master key with Base-KEK, optionally re-wrap for device fast-path
          debugLog('[key]', 'Unwrapping master key with Base-KEK...');
          let deviceKekForRewrap: CryptoKey | undefined;
          if (uesDataForRewrap) {
            try {
              deviceKekForRewrap = await deriveDeviceKEKFromUES(password, uesDataForRewrap.ues, saltBytes);
            } catch {
              debugError('[warn]', 'Failed to derive Device-KEK for re-wrap (non-fatal)');
            }
          }

          const result = await unwrapMasterKey(config.masterKeyEncrypted, kek, deviceKekForRewrap);
          bundle = result.bundle;
          debugLog('[ok]', 'Slow-path unlock successful');

          // Store device-wrapped key for fast future unlocks
          if (result.deviceWrapped && uesDataForRewrap) {
            try {
              debugLog('[key]', 'Storing device-wrapped key for fast-path...');
              await storeDeviceWrappedMK(
                arrayBufferToBase64(result.deviceWrapped),
                user.id,
                uesDataForRewrap.fingerprintHash
              );
              debugLog('[ok]', 'Device-wrapped key stored - next unlock will be fast (~100ms)');
            } catch (storeErr) {
              debugError('[warn]', 'Failed to store device-wrapped key (non-fatal)', storeErr);
            }
          }
        }

        // Cache non-extractable bundle for session
        cacheMasterKey(bundle, user.id);
        debugLog('[ok]', 'Master key derived, unwrapped, and cached (non-extractable)');

        // ===== Post-unlock migrations (fire-and-forget) =====
        if (!hasKeyPairData?.hasKeyPair) {
          migrateHybridKemKeyPair(bundle, {
            storeKeyPair: storeHybridKeyPairMutation,
            refetchHasKeyPair,
          });
        }

        if (!hasSignatureKeyPairData?.hasKeyPair) {
          migrateSignatureKeyPair(bundle, {
            storeKeyPair: storeSignatureKeyPairMutation,
            refetchHasKeyPair: refetchHasSignatureKeyPair,
          });
        }

        registerDeviceWithUES(bundle, {
          registerDevice: registerDeviceMutation,
        });

        return bundle;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to derive master key';
        if (import.meta.env.DEV) console.error('[MK] deriveMasterKey FAILED:', message);
        debugError('[fail]', 'deriveMasterKey failed', err);
        setError(message);
        throw err;
      } finally {
        setIsDerivingKey(false);
      }
    },
    [config, user?.id, refetch, hasKeyPairData?.hasKeyPair, storeHybridKeyPairMutation, refetchHasKeyPair, hasSignatureKeyPairData?.hasKeyPair, storeSignatureKeyPairMutation, refetchHasSignatureKeyPair, registerDeviceMutation]
  );

  // Derive file key from Master Key using HKDF
  const deriveFileKey = useCallback(
    async (fileId: string, timestamp: number): Promise<CryptoKey> => {
      if (!user?.id) throw new Error('User not authenticated');
      const bundle = getCachedMasterKey(user.id);
      if (!bundle) throw new Error('Vault is locked. Please unlock with your Master Password first.');
      return deriveFileKeyFromMaster(bundle.hkdf, fileId, timestamp);
    },
    [user?.id]
  );

  // Variant that also returns raw bytes so Web Workers can rehydrate the key.
  const deriveFileKeyWithBytes = useCallback(
    async (fileId: string, timestamp: number): Promise<DerivedFileKeyWithBytes> => {
      if (!user?.id) throw new Error('User not authenticated');
      const bundle = getCachedMasterKey(user.id);
      if (!bundle) throw new Error('Vault is locked. Please unlock with your Master Password first.');
      return deriveFileKeyWithBytesFromMaster(bundle.hkdf, fileId, timestamp);
    },
    [user?.id]
  );

  // HKDF-derives the filename-encryption key from the master key.
  const deriveFilenameKey = useCallback(
    async (): Promise<CryptoKey> => {
      if (!user?.id) throw new Error('User not authenticated');
      const bundle = getCachedMasterKey(user.id);
      if (!bundle) throw new Error('Vault is locked. Please unlock with your Master Password first.');
      return deriveFilenameKeyFromMaster(bundle.hkdf);
    },
    [user?.id]
  );

  // HKDF-derives the foldername-encryption key from the master key.
  const deriveFoldernameKey = useCallback(
    async (): Promise<CryptoKey> => {
      if (!user?.id) throw new Error('User not authenticated');
      const bundle = getCachedMasterKey(user.id);
      if (!bundle) throw new Error('Vault is locked. Please unlock with your Master Password first.');
      return deriveFoldernameKeyFromMaster(bundle.hkdf);
    },
    [user?.id]
  );

  // HKDF-derives the thumbnail-encryption key from the master key.
  const deriveThumbnailKey = useCallback(
    async (fileId: string): Promise<CryptoKey> => {
      if (!user?.id) throw new Error('User not authenticated');
      const bundle = getCachedMasterKey(user.id);
      if (!bundle) throw new Error('Vault is locked. Please unlock with your Master Password first.');
      return deriveThumbnailKeyFromMaster(bundle.hkdf, fileId);
    },
    [user?.id]
  );

  // Derive fingerprint key from Master Key using HKDF (for quantum-safe duplicate detection)
  const deriveFingerprintKey = useCallback(
    async (): Promise<CryptoKey> => {
      if (!user?.id) throw new Error('User not authenticated');
      const bundle = getCachedMasterKey(user.id);
      if (!bundle) throw new Error('Vault is locked. Please unlock with your Master Password first.');
      return deriveFingerprintKeyFromMaster(bundle.hkdf);
    },
    [user?.id]
  );

  // First-time master-key setup.
  const setupMasterKey = useCallback(
    async (password: string, passwordHint?: string): Promise<{ success: boolean; recoveryCodesPlain: string[] }> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      if (config?.isConfigured) {
        throw new Error('Master Key is already configured');
      }

      setIsDerivingKey(true);
      setError(null);

      try {
        // 1. Generate random salt (32 bytes = 256 bits)
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const saltBase64 = arrayBufferToBase64(salt.buffer as ArrayBuffer);

        // 2. Generate 10 recovery codes (8 alphanumeric chars each)
        const recoveryCodesPlain = generateRecoveryCodes();

        // 3. Derive KEK from password using Argon2id (OWASP 2024)
        const argon2Params: Argon2Params = {
          type: ARGON2_PARAMS.type,
          memoryCost: ARGON2_PARAMS.memoryCost,
          timeCost: ARGON2_PARAMS.timeCost,
          parallelism: ARGON2_PARAMS.parallelism,
          hashLength: ARGON2_PARAMS.hashLength,
        };

        const kek = await deriveArgon2Key(password, salt, argon2Params);

        // 5. Generate real Master Key (random 32 bytes), wrap with KEK, create non-extractable bundle
        const masterKeyRaw = crypto.getRandomValues(new Uint8Array(32));

        // Import as extractable temporarily for wrapping with KEK
        const tempKey = await crypto.subtle.importKey(
          'raw', toArrayBuffer(masterKeyRaw),
          { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        );
        const wrappedMasterKey = await crypto.subtle.wrapKey('raw', tempKey, kek, 'AES-KW');
        const masterKeyEncryptedB64 = arrayBufferToBase64(wrappedMasterKey);

        // Create non-extractable bundle (zeros masterKeyRaw)
        const bundle = await createMasterKeyBundle(masterKeyRaw);

        // 6. Send to backend (including wrapped Master Key + Argon2 params)
        await setupMasterKeyMutation.mutateAsync({
          pbkdf2Salt: saltBase64,
          recoveryCodes: recoveryCodesPlain,
          masterKeyEncrypted: masterKeyEncryptedB64,
          passwordHint: passwordHint || undefined,
          argon2Params: { ...argon2Params, type: 'argon2id' as const },
        });

        // 9. Refresh config
        await refetch();

        // 10. Cache non-extractable bundle
        cacheMasterKey(bundle, user.id);

        // Generate and store hybrid KEM + signature keypairs
        await generateAndStoreKeyPairs(bundle, {
          storeHybridKeyPair: storeHybridKeyPairMutation,
          refetchHasKeyPair,
          storeSignatureKeyPair: storeSignatureKeyPairMutation,
          refetchHasSignatureKeyPair,
        });

        toast.success('Master Key configured successfully!');

        return {
          success: true,
          recoveryCodesPlain,
        };
      } catch (err) {
        const code = (err as any)?.code;
        const message = err instanceof Error ? err.message : 'Failed to setup Master Key';
        setError(message);
        if (code !== 'HYBRID_KEM_UNAVAILABLE') {
          toast.error('Failed to setup Master Key', { description: message });
        }
        throw err;
      } finally {
        setIsDerivingKey(false);
      }
    },
    [config?.isConfigured, user?.id, setupMasterKeyMutation, refetch, storeHybridKeyPairMutation, refetchHasKeyPair, storeSignatureKeyPairMutation, refetchHasSignatureKeyPair]
  );

  // Computed: is the vault unlocked (Master Key cached and valid)?
  const isUnlocked = useMemo(() => {
    if (!user?.id) return false;
    if (!config?.isConfigured) return false;
    return isCacheValid(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, config?.isConfigured, currentCacheVersion]);

  // Computed: is Master Key configured on server?
  const isConfigured = useMemo(() => {
    return config?.isConfigured ?? false;
  }, [config?.isConfigured]);

  // Computed: does server require device verification?
  const deviceVerificationRequired = useMemo(() => {
    return config?.deviceVerificationRequired ?? false;
  }, [config?.deviceVerificationRequired]);

  // Computed: did verification email fail to send?
  const emailSendFailed = useMemo(() => {
    return config?.emailSendFailed ?? false;
  }, [config?.emailSendFailed]);

  // ===== Hybrid Key Access =====

  // Computed: does user have a hybrid keypair?
  const hasHybridKeyPair = useMemo(() => {
    return hasKeyPairData?.hasKeyPair ?? false;
  }, [hasKeyPairData?.hasKeyPair]);

  // Get user's hybrid public key for encryption (required for V4 uploads)
  const getHybridPublicKey = useCallback(async (): Promise<HybridPublicKey> => {
    if (!user?.id) throw new Error('User not authenticated — cannot fetch hybrid public key');

    const publicKeyResponse = await trpcUtils.hybridKem.getPublicKey.fetch();

    if (!publicKeyResponse) {
      throw new Error('No hybrid public key found. V4 encryption requires quantum-safe keys to be set up.');
    }

    // Convert from base64 to Uint8Array
    return {
      classical: new Uint8Array(base64ToArrayBuffer(publicKeyResponse.x25519PublicKey)),
      postQuantum: new Uint8Array(base64ToArrayBuffer(publicKeyResponse.mlkem768PublicKey)),
    };
  }, [user?.id, trpcUtils]);

  // Get unlocked hybrid secret key for decryption (unwraps with Master Key)
  const getUnlockedHybridSecretKey = useCallback(async (): Promise<HybridSecretKey | null> => {
    if (!user?.id) return null;

    // Check cache first
    const cached = getHybridSecretKeyCache();
    if (cached &&
      cached.userId === user.id &&
      Date.now() - cached.cachedAt < DEFAULT_CACHE_TIMEOUT_MS) {
      return cached.secretKey;
    }

    // Get cached master key bundle - must be unlocked
    const bundle = getCachedMasterKey(user.id);
    if (!bundle) {
      debugError('[crypto]', 'Vault is locked, cannot get hybrid secret key');
      return null;
    }

    try {
      const secretKeyResponse = await trpcUtils.hybridKem.getSecretKey.fetch({});

      if (!secretKeyResponse) {
        debugLog('[crypto]', 'No hybrid secret key found for user');
        return null;
      }

      // Unwrap X25519 secret (AES-KW) and decrypt ML-KEM secret (AES-GCM)
      const x25519SecretWrapped = new Uint8Array(base64ToArrayBuffer(secretKeyResponse.x25519SecretKeyEncrypted));
      const mlkemSecretEncrypted = new Uint8Array(base64ToArrayBuffer(secretKeyResponse.mlkem768SecretKeyEncrypted));

      const x25519Secret = await unwrapSecretWithMK(x25519SecretWrapped, bundle.aesKw);
      const mlkemDecrypted = await decryptLargeSecretKey(mlkemSecretEncrypted, bundle.aesGcm);

      const secretKey: HybridSecretKey = {
        classical: x25519Secret,
        postQuantum: mlkemDecrypted,
      };

      // Cache for session
      setHybridSecretKeyCache({
        secretKey,
        cachedAt: Date.now(),
        userId: user.id,
      });

      debugLog('[crypto]', 'Hybrid secret key unwrapped and cached');
      return secretKey;
    } catch (err) {
      debugError('[crypto]', 'Failed to get hybrid secret key', err);
      return null;
    }
  }, [user?.id, trpcUtils]);

  return {
    config: (config as MasterKeyConfig | undefined) ?? null,
    isLoading,
    isUnlocked,
    isConfigured,
    deviceVerificationRequired,
    emailSendFailed,
    deviceFingerprint,
    deriveMasterKey,
    deriveFileKey,
    deriveFileKeyWithBytes,
    deriveFilenameKey,
    deriveFoldernameKey,
    deriveThumbnailKey,
    deriveFingerprintKey,
    setupMasterKey,
    getCachedKey,
    isCached,
    clearCache,
    isDerivingKey,
    error,
    refetchConfig: refetch,
    hasHybridKeyPair,
    getHybridPublicKey,
    getUnlockedHybridSecretKey,
  };
}
