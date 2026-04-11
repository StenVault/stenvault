/**
 * useOrgMasterKey Hook (Vault Model)
 *
 * Manages Organization Master Key (OMK) lifecycle for zero-knowledge org vaults.
 * Each org has its own OMK, wrapped per-member with their personal MK.
 *
 * Architecture:
 *   Personal MK -> AES-KW Unwrap -> OMK -> HKDF -> Org File/Filename/Thumbnail Keys
 *
 * Cache:
 * - Per-org singleton Map (module-level, survives re-renders)
 * - 15-minute timeout (matches personal MK cache)
 * - Auto-clears when personal vault locks
 * - useSyncExternalStore for React reactivity
 *
 * Unlock flows:
 * - AES-KW (fast): Member already confirmed -> unwrap OMK with personal MK (~1ms)
 * - Hybrid PQC (first-time): Admin distributed via hybrid encapsulation ->
 *   decapsulate with member's hybrid secret key, re-wrap with personal MK, confirm
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from './useMasterKey';
import { debugLog, debugError } from '@/lib/debugLogger';
import {
  unwrapOMKWithPersonalMK,
  wrapOMKWithPersonalMK,
  decapsulateOMK,
  deriveOrgFileKey as cryptoDeriveOrgFileKey,
  deriveOrgFileKeyWithBytes as cryptoDeriveOrgFileKeyWithBytes,
  deriveOrgFilenameKey as cryptoDeriveOrgFilenameKey,
  deriveOrgFoldernameKey as cryptoDeriveOrgFoldernameKey,
  deriveOrgThumbnailKey as cryptoDeriveOrgThumbnailKey,
} from './orgMasterKeyCrypto';
import type { DerivedFileKeyWithBytes } from './masterKeyCrypto';

// ============ OMK Cache (Module-level Singleton) ============

/** 15 minutes — matches personal MK timeout */
const DEFAULT_CACHE_TIMEOUT_MS = 15 * 60 * 1000;

interface OrgKeyCache {
  key: CryptoKey;
  derivedAt: number;
  keyVersion: number;
}

/** Per-org cache — survives re-renders, cleared on page refresh (secure) */
const orgKeyCacheMap = new Map<number, OrgKeyCache>();

/** Per-org expiration timers */
const orgExpirationTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** Deduplication map for concurrent unlock calls */
const pendingUnlocks = new Map<number, Promise<CryptoKey>>();

// ============ Cache Reactivity (useSyncExternalStore) ============

let orgCacheVersion = 0;
const orgCacheListeners = new Set<() => void>();

function notifyOrgCacheChange(): void {
  orgCacheVersion++;
  orgCacheListeners.forEach(l => l());
}

function subscribeToOrgCacheChanges(listener: () => void): () => void {
  orgCacheListeners.add(listener);
  return () => { orgCacheListeners.delete(listener); };
}

function getOrgCacheVersion(): number {
  return orgCacheVersion;
}

// ============ Cache Operations ============

function isOrgCacheValid(orgId: number): boolean {
  const cached = orgKeyCacheMap.get(orgId);
  if (!cached) return false;
  return (Date.now() - cached.derivedAt) < DEFAULT_CACHE_TIMEOUT_MS;
}

function getCachedOrgKey(orgId: number): CryptoKey | null {
  if (isOrgCacheValid(orgId)) {
    return orgKeyCacheMap.get(orgId)!.key;
  }
  // Clear expired
  if (orgKeyCacheMap.has(orgId)) {
    clearOrgKeyCache(orgId);
  }
  return null;
}

function getCachedOrgKeyVersion(orgId: number): number | null {
  if (isOrgCacheValid(orgId)) {
    return orgKeyCacheMap.get(orgId)!.keyVersion;
  }
  return null;
}

function cacheOrgKey(orgId: number, key: CryptoKey, keyVersion: number): void {
  orgKeyCacheMap.set(orgId, { key, derivedAt: Date.now(), keyVersion });

  // Clear existing timer
  const existingTimer = orgExpirationTimers.get(orgId);
  if (existingTimer) clearTimeout(existingTimer);

  // Schedule auto-expiration
  orgExpirationTimers.set(orgId, setTimeout(() => {
    orgExpirationTimers.delete(orgId);
    orgKeyCacheMap.delete(orgId);
    notifyOrgCacheChange();
  }, DEFAULT_CACHE_TIMEOUT_MS));

  notifyOrgCacheChange();
}

function clearOrgKeyCache(orgId: number): void {
  orgKeyCacheMap.delete(orgId);
  const timer = orgExpirationTimers.get(orgId);
  if (timer) {
    clearTimeout(timer);
    orgExpirationTimers.delete(orgId);
  }
  notifyOrgCacheChange();
}

/** Clear ALL org caches. Called when personal vault locks. */
export function clearAllOrgKeyCaches(): void {
  orgKeyCacheMap.clear();
  orgExpirationTimers.forEach(timer => clearTimeout(timer));
  orgExpirationTimers.clear();
  notifyOrgCacheChange();
}

// ============ Types ============

export interface UseOrgMasterKeyReturn {
  /** Unlock an org vault — fetches wrapped OMK from server, unwraps with personal MK */
  unlockOrgVault: (orgId: number) => Promise<CryptoKey>;
  /** Check if an org vault is unlocked (reactive) */
  isOrgUnlocked: (orgId: number) => boolean;
  /** Get cached OMK (null if locked) */
  getOrgMasterKey: (orgId: number) => CryptoKey | null;
  /** Get the cached key version for an org (null if locked) */
  getOrgKeyVersion: (orgId: number) => number | null;
  /** Derive unique file key from OMK via HKDF */
  deriveOrgFileKey: (orgId: number, fileId: string, timestamp: number) => Promise<CryptoKey>;
  /** Derive file key WITH raw bytes for Web Worker */
  deriveOrgFileKeyWithBytes: (orgId: number, fileId: string, timestamp: number) => Promise<DerivedFileKeyWithBytes>;
  /** Derive filename encryption key from OMK */
  deriveOrgFilenameKey: (orgId: number) => Promise<CryptoKey>;
  /** Derive folder name encryption key from OMK */
  deriveOrgFoldernameKey: (orgId: number) => Promise<CryptoKey>;
  /** Derive thumbnail encryption key from OMK */
  deriveOrgThumbnailKey: (orgId: number, fileId: string) => Promise<CryptoKey>;
  /** Clear org cache (one org or all) */
  clearOrgCache: (orgId?: number) => void;
}

// ============ Hook ============

/**
 * Hook for managing organization Master Keys.
 *
 * Uses personal MK (from useMasterKey) to unwrap per-member OMK copies.
 * Supports both AES-KW (fast, confirmed) and hybrid PQC (first-time) unlock paths.
 */
export function useOrgMasterKey(): UseOrgMasterKeyReturn {
  const {
    getCachedKey: getPersonalMK,
    isUnlocked: isPersonalVaultUnlocked,
    getUnlockedHybridSecretKey,
  } = useMasterKey();

  const trpcUtils = trpc.useUtils();
  const storeWrappedOMKMutation = trpc.orgKeys.storeWrappedOMKForSelf.useMutation();

  // Stable ref for mutation to avoid dependency instability
  const storeWrappedOMKRef = useRef(storeWrappedOMKMutation.mutateAsync);
  storeWrappedOMKRef.current = storeWrappedOMKMutation.mutateAsync;

  // Subscribe to cache changes for reactive re-renders (client-only SPA, no SSR snapshot needed)
  useSyncExternalStore(subscribeToOrgCacheChanges, getOrgCacheVersion);

  // Auto-clear all org caches when personal vault locks
  useEffect(() => {
    if (!isPersonalVaultUnlocked) {
      clearAllOrgKeyCaches();
    }
  }, [isPersonalVaultUnlocked]);

  // ── Unlock org vault ──────────────────────────────────────────

  const unlockOrgVault = useCallback(async (orgId: number): Promise<CryptoKey> => {
    // Check cache first
    const cached = getCachedOrgKey(orgId);
    if (cached) {
      debugLog('[org]', `Org ${orgId} vault already unlocked (cached)`);
      return cached;
    }

    // Deduplicate concurrent unlock calls for the same org
    const pending = pendingUnlocks.get(orgId);
    if (pending) return pending;

    const unlockPromise = (async (): Promise<CryptoKey> => {
      try {
        // Personal vault must be unlocked — retry briefly to handle
        // timing gap between React state update and cache availability
        let personalMK = getPersonalMK();
        if (!personalMK) {
          for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 200));
            personalMK = getPersonalMK();
            if (personalMK) break;
          }
        }
        if (!personalMK) {
          throw new Error('Personal vault must be unlocked first. Enter your Master Password.');
        }

        debugLog('[org]', `Unlocking org ${orgId} vault...`);

        // Fetch wrapped OMK from server
        const wrappedOMK = await trpcUtils.orgKeys.getWrappedOMK.fetch({ organizationId: orgId });

        let omk: CryptoKey;

        if (wrappedOMK.wrapMethod === 'aes-kw') {
          // Fast path: OMK already wrapped with personal MK (~1ms)
          debugLog('[org]', `Org ${orgId}: AES-KW unwrap (fast path)`);
          omk = await unwrapOMKWithPersonalMK(wrappedOMK.omkEncrypted, personalMK);
        } else {
          // Hybrid path: OMK distributed via hybrid PQC encapsulation
          debugLog('[org]', `Org ${orgId}: Hybrid decapsulation (first-time unlock)`);

          if (!wrappedOMK.distributionIv || !wrappedOMK.distributionX25519Public || !wrappedOMK.distributionMlkemCiphertext) {
            throw new Error('Missing hybrid distribution metadata. Contact the org admin to re-distribute your key.');
          }

          // Get personal hybrid secret key (unwraps with personal MK)
          const hybridSecretKey = await getUnlockedHybridSecretKey();
          if (!hybridSecretKey) {
            throw new Error('Hybrid keypair not available. Please set up encryption first.');
          }

          // Decapsulate: hybrid KEK -> AES-GCM decrypt -> raw OMK
          omk = await decapsulateOMK({
            omkEncrypted: wrappedOMK.omkEncrypted,
            distributionIv: wrappedOMK.distributionIv,
            distributionX25519Public: wrappedOMK.distributionX25519Public,
            distributionMlkemCiphertext: wrappedOMK.distributionMlkemCiphertext,
          }, hybridSecretKey);

          // Re-wrap with personal MK for fast future unlocks
          try {
            debugLog('[org]', `Org ${orgId}: Re-wrapping OMK for fast-path...`);
            const wrappedForSelf = await wrapOMKWithPersonalMK(omk, personalMK);
            await storeWrappedOMKRef.current({
              organizationId: orgId,
              omkEncrypted: wrappedForSelf,
              keyVersion: wrappedOMK.keyVersion,
            });
            debugLog('[org]', `Org ${orgId}: Key confirmed (upgraded to AES-KW)`);
          } catch (confirmErr) {
            // Non-fatal: hybrid unlock worked, will retry confirmation next time
            debugError('[org]', `Org ${orgId}: Failed to confirm key (non-fatal)`, confirmErr);
          }
        }

        // Cache OMK
        cacheOrgKey(orgId, omk, wrappedOMK.keyVersion);
        debugLog('[org]', `Org ${orgId} vault unlocked (keyVersion=${wrappedOMK.keyVersion})`);

        return omk;
      } finally {
        pendingUnlocks.delete(orgId);
      }
    })();

    pendingUnlocks.set(orgId, unlockPromise);
    return unlockPromise;
  }, [getPersonalMK, getUnlockedHybridSecretKey, trpcUtils]);

  // ── Cache accessors ───────────────────────────────────────────

  const isOrgUnlocked = useCallback((orgId: number): boolean => {
    return isOrgCacheValid(orgId);
  }, []);

  const getOrgMasterKey = useCallback((orgId: number): CryptoKey | null => {
    return getCachedOrgKey(orgId);
  }, []);

  const getOrgKeyVersion = useCallback((orgId: number): number | null => {
    return getCachedOrgKeyVersion(orgId);
  }, []);

  // ── HKDF derivation functions ─────────────────────────────────

  const deriveOrgFileKey = useCallback(
    async (orgId: number, fileId: string, timestamp: number): Promise<CryptoKey> => {
      const omk = getCachedOrgKey(orgId);
      if (!omk) throw new Error(`Org ${orgId} vault is locked. Unlock it first.`);
      return cryptoDeriveOrgFileKey(omk, orgId, fileId, timestamp);
    },
    []
  );

  const deriveOrgFileKeyWithBytes = useCallback(
    async (orgId: number, fileId: string, timestamp: number): Promise<DerivedFileKeyWithBytes> => {
      const omk = getCachedOrgKey(orgId);
      if (!omk) throw new Error(`Org ${orgId} vault is locked. Unlock it first.`);
      return cryptoDeriveOrgFileKeyWithBytes(omk, orgId, fileId, timestamp);
    },
    []
  );

  const deriveOrgFilenameKey = useCallback(
    async (orgId: number): Promise<CryptoKey> => {
      const omk = getCachedOrgKey(orgId);
      if (!omk) throw new Error(`Org ${orgId} vault is locked. Unlock it first.`);
      return cryptoDeriveOrgFilenameKey(omk, orgId);
    },
    []
  );

  const deriveOrgFoldernameKey = useCallback(
    async (orgId: number): Promise<CryptoKey> => {
      const omk = getCachedOrgKey(orgId);
      if (!omk) throw new Error(`Org ${orgId} vault is locked. Unlock it first.`);
      return cryptoDeriveOrgFoldernameKey(omk, orgId);
    },
    []
  );

  const deriveOrgThumbnailKey = useCallback(
    async (orgId: number, fileId: string): Promise<CryptoKey> => {
      const omk = getCachedOrgKey(orgId);
      if (!omk) throw new Error(`Org ${orgId} vault is locked. Unlock it first.`);
      return cryptoDeriveOrgThumbnailKey(omk, orgId, fileId);
    },
    []
  );

  // ── Cache management ──────────────────────────────────────────

  const clearOrgCache = useCallback((orgId?: number) => {
    if (orgId !== undefined) {
      clearOrgKeyCache(orgId);
    } else {
      clearAllOrgKeyCaches();
    }
  }, []);

  return {
    unlockOrgVault,
    isOrgUnlocked,
    getOrgMasterKey,
    getOrgKeyVersion,
    deriveOrgFileKey,
    deriveOrgFileKeyWithBytes,
    deriveOrgFilenameKey,
    deriveOrgFoldernameKey,
    deriveOrgThumbnailKey,
    clearOrgCache,
  };
}
