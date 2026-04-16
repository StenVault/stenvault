/**
 * Device-Wrapped Master Key (UES Fast-Path)
 *
 * Stored in IndexedDB (not localStorage) so structured data stays in a
 * dedicated key store. The Device-KEK that wraps this key is non-extractable,
 * meaning XSS cannot exportKey() the raw KEK bytes.
 */

import type { DeviceWrappedMK } from './types';
import { getStoredFingerprintHash } from '@/lib/uesManager';
import { debugLog, debugError } from '@/lib/debugLogger';

const IDB_NAME = 'stenvault_keystore';
const IDB_STORE = 'device_keys';
const IDB_VERSION = 1;
const DEVICE_MK_KEY = 'device_mk_v2';

/** Open (or create) the IndexedDB key store */
function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Store device-wrapped master key in IndexedDB for fast future unlocks.
 * The key is wrapped with Device-KEK (password + UES), safe to persist.
 */
export async function storeDeviceWrappedMK(wrappedKeyB64: string, userId: number, fingerprint: string): Promise<void> {
  const data: DeviceWrappedMK = {
    wrappedKey: wrappedKeyB64,
    userId,
    deviceFingerprint: fingerprint,
    createdAt: Date.now(),
  };
  try {
    const db = await openKeyStore();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, DEVICE_MK_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    debugError('[warn]', 'Failed to store device-wrapped MK in IndexedDB', err);
  }
}

/**
 * Load device-wrapped master key from IndexedDB.
 * Returns null if not found, wrong user, or device fingerprint changed.
 */
export async function loadDeviceWrappedMK(userId: number): Promise<DeviceWrappedMK | null> {
  try {
    const db = await openKeyStore();
    const data = await new Promise<DeviceWrappedMK | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(DEVICE_MK_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    if (!data) return null;
    if (data.userId !== userId) return null;
    // SEC-070: Expire device-wrapped keys after 90 days
    const MAX_DEVICE_KEY_AGE_MS = 90 * 24 * 60 * 60 * 1000;
    if (data.createdAt && Date.now() - data.createdAt > MAX_DEVICE_KEY_AGE_MS) {
      debugLog('[key]', 'Device-wrapped key expired (90 days), clearing');
      clearDeviceWrappedMK();
      return null;
    }
    // Check device fingerprint hasn't changed
    const currentFingerprint = getStoredFingerprintHash();
    if (currentFingerprint && data.deviceFingerprint !== currentFingerprint) {
      debugLog('[key]', 'Device fingerprint changed, clearing stale device-wrapped key');
      clearDeviceWrappedMK();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Clear device-wrapped master key from IndexedDB.
 * Fire-and-forget -- callers do not need to await.
 */
export function clearDeviceWrappedMK(): void {
  openKeyStore()
    .then(db => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(DEVICE_MK_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }))
    .catch(() => {}); // Non-critical cleanup
}
