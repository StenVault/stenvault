/**
 * Master Key Session Cache (Module-level Singleton)
 *
 * ALL mutable cache state lives in this single module to prevent
 * duplicate singleton bugs. The cache survives re-renders but is
 * cleared on page refresh (secure by design).
 *
 * Provides useSyncExternalStore infrastructure so React components
 * re-render when the cache changes (e.g., vault lock/unlock).
 */

import { toast } from '@/lib/toast';
import type { MasterKeyBundle } from '../masterKeyCrypto';
import type { HybridSecretKey } from '@stenvault/shared/platform/crypto';
import { getHasActiveOperations } from '@/stores/operationStore';
import { clearThumbnailCache } from '@/hooks/useThumbnailDecryption';
import { clearAllOrgKeyCaches } from '@/hooks/useOrgMasterKey';
import { debugLog } from '@/lib/debugLogger';

// ============ Constants ============

/** Default cache timeout: 30 minutes (aligned with access token TTL) */
export const DEFAULT_CACHE_TIMEOUT_MS = 30 * 60 * 1000;
/** Re-check interval during deferral */
const DEFERRAL_CHECK_MS = 10_000;

// ============ Types ============

interface MasterKeyCache {
  bundle: MasterKeyBundle;
  derivedAt: number;
  userId: number;
}

export interface HybridSecretKeyCache {
  secretKey: HybridSecretKey;
  cachedAt: number;
  userId: number;
}

// ============ Module-level Singletons ============

/** In-memory cache - survives re-renders, cleared on page refresh (secure) */
let masterKeyCache: MasterKeyCache | null = null;

/** Timer that fires when cache expires to trigger reactive state update */
let cacheExpirationTimer: ReturnType<typeof setTimeout> | null = null;

/** Timer that warns user 2 minutes before cache expiry */
let cacheWarningTimer: ReturnType<typeof setTimeout> | null = null;

/** Cache for unwrapped hybrid secret keys — avoids re-unwrapping every op. */
let hybridSecretKeyCache: HybridSecretKeyCache | null = null;

// ============ Cache Reactivity (useSyncExternalStore) ============
// Module-level subscription so React re-renders when cache changes

let cacheVersion = 0;
const cacheListeners = new Set<() => void>();

function notifyCacheChange(): void {
  cacheVersion++;
  cacheListeners.forEach((listener) => listener());
}

export function subscribeToCacheChanges(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

export function getCacheVersion(): number {
  return cacheVersion;
}

// ============ Hybrid Secret Key Cache Accessors ============
// Accessor functions instead of exporting the `let` directly.
// ES module `import { hybridSecretKeyCache }` captures the binding at
// import time — reassignment here wouldn't propagate. Functions read
// the module-level `let` on each call.

export function getHybridSecretKeyCache(): HybridSecretKeyCache | null {
  return hybridSecretKeyCache;
}

export function setHybridSecretKeyCache(cache: HybridSecretKeyCache | null): void {
  hybridSecretKeyCache = cache;
}

// ============ Cache Operations ============

/**
 * Check if cached master key is valid
 */
export function isCacheValid(userId: number, timeoutMs: number = DEFAULT_CACHE_TIMEOUT_MS): boolean {
  if (!masterKeyCache) return false;
  if (masterKeyCache.userId !== userId) return false;

  const age = Date.now() - masterKeyCache.derivedAt;
  return age < timeoutMs;
}

/**
 * Get cached master key bundle if valid
 */
export function getCachedMasterKey(userId: number, timeoutMs?: number): MasterKeyBundle | null {
  if (isCacheValid(userId, timeoutMs)) {
    return masterKeyCache!.bundle;
  }
  // Clear expired/invalid cache (including timer and hybrid keys)
  if (masterKeyCache) {
    clearMasterKeyCache();
  }
  return null;
}

/**
 * Cache master key bundle and schedule expiration notification
 */
export function cacheMasterKey(bundle: MasterKeyBundle, userId: number): void {
  masterKeyCache = {
    bundle,
    derivedAt: Date.now(),
    userId,
  };

  // Clear any existing timers
  if (cacheExpirationTimer) {
    clearTimeout(cacheExpirationTimer);
  }
  if (cacheWarningTimer) {
    clearTimeout(cacheWarningTimer);
    cacheWarningTimer = null;
  }

  // Schedule warning 2 minutes before expiry
  cacheWarningTimer = setTimeout(() => {
    cacheWarningTimer = null;
    if (getHasActiveOperations()) {
      toast.info('Vault lock deferred — uploads/downloads in progress', { id: 'vault-lock-warning' });
    } else {
      toast.warning('Your vault will lock in 2 minutes — save any open work', { id: 'vault-lock-warning' });
    }
  }, DEFAULT_CACHE_TIMEOUT_MS - 120_000);

  // Schedule reactive notification when cache expires
  // This ensures isUnlocked transitions to false automatically
  // Uses a named function to allow self-rescheduling during active operations
  cacheExpirationTimer = setTimeout(function onCacheExpiry() {
    cacheExpirationTimer = null;
    if (!masterKeyCache) return;

    const ageMs = Date.now() - masterKeyCache.derivedAt;

    // Defer indefinitely while operations are active (upload, download, preview).
    // The MK is needed to encrypt/decrypt — killing it mid-operation causes data loss.
    // Hard cap removed: operations drive the lifetime, not an arbitrary clock.
    if (getHasActiveOperations()) {
      debugLog('[MK]', `Cache expiry deferred — operations in progress (age ${Math.round(ageMs / 1000)}s)`);
      cacheExpirationTimer = setTimeout(onCacheExpiry, DEFERRAL_CHECK_MS);
      return;
    }

    masterKeyCache = null;
    // Zero hybrid secret key bytes before clearing
    if (hybridSecretKeyCache?.secretKey) {
      if (hybridSecretKeyCache.secretKey.classical instanceof Uint8Array) {
        hybridSecretKeyCache.secretKey.classical.fill(0);
      }
      if (hybridSecretKeyCache.secretKey.postQuantum instanceof Uint8Array) {
        hybridSecretKeyCache.secretKey.postQuantum.fill(0);
      }
    }
    hybridSecretKeyCache = null;
    clearThumbnailCache();
    clearAllOrgKeyCaches();
    notifyCacheChange();
  }, DEFAULT_CACHE_TIMEOUT_MS);

  notifyCacheChange();
}

/**
 * Clear master key cache (and hybrid secret key cache)
 */
export function clearMasterKeyCache(): void {
  masterKeyCache = null;
  // Zero hybrid secret key bytes before clearing
  if (hybridSecretKeyCache?.secretKey) {
    if (hybridSecretKeyCache.secretKey.classical instanceof Uint8Array) {
      hybridSecretKeyCache.secretKey.classical.fill(0);
    }
    if (hybridSecretKeyCache.secretKey.postQuantum instanceof Uint8Array) {
      hybridSecretKeyCache.secretKey.postQuantum.fill(0);
    }
  }
  hybridSecretKeyCache = null;

  // Clear timers since we're clearing manually
  if (cacheExpirationTimer) {
    clearTimeout(cacheExpirationTimer);
    cacheExpirationTimer = null;
  }
  if (cacheWarningTimer) {
    clearTimeout(cacheWarningTimer);
    cacheWarningTimer = null;
  }

  clearThumbnailCache(); // Revoke decrypted thumbnails on vault lock
  clearAllOrgKeyCaches(); // Clear all org vault caches on personal vault lock
  notifyCacheChange();
}
