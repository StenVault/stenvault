/**
 * Post-Unlock Migrations
 *
 * Named functions extracted from deriveMasterKey's fire-and-forget IIFEs.
 * Each receives `bundle` + only the specific mutations it needs as explicit
 * parameters — no closure over hook scope.
 *
 * All three are non-blocking: failures are logged and retried on next login.
 */

import type { MasterKeyBundle } from '../masterKeyCrypto';
import { toArrayBuffer, encryptLargeSecretKey, wrapSecretWithMK } from '../masterKeyCrypto';
import { arrayBufferToBase64 } from '@/lib/platform';
import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getHybridSignatureProvider } from '@/lib/platform/webHybridSignatureProvider';
import { hasUES, generateAndStoreUES, exportUESForServer } from '@/lib/uesManager';
import { getDeviceFingerprintHash, getDeviceName, getBrowserInfo } from '@/lib/deviceEntropy';
import { debugLog, debugError, devWarn } from '@/lib/debugLogger';
// ============ Phase 2 Migration: Hybrid KEM Keypair ============

interface KemMigrationDeps {
  storeKeyPair: { mutateAsync: (input: {
    x25519PublicKey: string;
    x25519SecretKeyEncrypted: string;
    mlkem768PublicKey: string;
    mlkem768SecretKeyEncrypted: string;
  }) => Promise<unknown> };
  refetchHasKeyPair: () => Promise<unknown>;
}

/**
 * Generate hybrid KEM keypair (X25519 + ML-KEM-768) if missing.
 * Non-blocking — if WASM fails, vault unlock still succeeds.
 */
export async function migrateHybridKemKeyPair(
  bundle: MasterKeyBundle,
  deps: KemMigrationDeps,
): Promise<void> {
  try {
    devWarn('[MK] Starting hybrid keypair migration...');
    const hybridKem = getHybridKemProvider();
    const isAvailable = await hybridKem.isAvailable();
    devWarn('[MK] Hybrid KEM available:', isAvailable);
    if (!isAvailable) {
      devWarn('[MK] ML-KEM-768 WASM not available — skipping keypair generation, will retry next login');
      return;
    }

    debugLog('[crypto]', 'Migrating: generating hybrid keypairs (X25519 + ML-KEM-768)');
    const { publicKey, secretKey } = await hybridKem.generateKeyPair();

    // Wrap X25519 secret (32 bytes) with AES-KW, encrypt ML-KEM secret (2400 bytes) with AES-GCM
    const x25519WrappedBytes = await wrapSecretWithMK(secretKey.classical, bundle.aesKw);
    const mlkemEncrypted = await encryptLargeSecretKey(secretKey.postQuantum, bundle.aesGcm);

    // CRYPTO-005: fingerprint is now computed server-side
    await deps.storeKeyPair.mutateAsync({
      x25519PublicKey: arrayBufferToBase64(toArrayBuffer(publicKey.classical)),
      x25519SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(x25519WrappedBytes)),
      mlkem768PublicKey: arrayBufferToBase64(toArrayBuffer(publicKey.postQuantum)),
      mlkem768SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(mlkemEncrypted)),
    });

    await deps.refetchHasKeyPair();
    devWarn('[MK] Hybrid keypairs generated (migration) - v4 encryption now available');
  } catch (kemMigrationErr) {
    devWarn('[MK] Hybrid keypair migration FAILED:', kemMigrationErr);
    debugError('[crypto]', 'Hybrid keypair migration failed (will retry next login)', kemMigrationErr);
  }
}

// ============ Phase 3.4 Migration: Hybrid Signature Keypair ============

interface SignatureMigrationDeps {
  storeKeyPair: { mutateAsync: (input: {
    ed25519PublicKey: string;
    ed25519SecretKeyEncrypted: string;
    mldsa65PublicKey: string;
    mldsa65SecretKeyEncrypted: string;
  }) => Promise<unknown> };
  refetchHasKeyPair: () => Promise<unknown>;
}

/**
 * Generate hybrid signature keypair (Ed25519 + ML-DSA-65) if missing.
 * Non-blocking — fire-and-forget to avoid slowing unlock.
 */
export async function migrateSignatureKeyPair(
  bundle: MasterKeyBundle,
  deps: SignatureMigrationDeps,
): Promise<void> {
  try {
    devWarn('[MK] Starting hybrid signature keypair migration...');

    const signatureProvider = getHybridSignatureProvider();
    const isAvailable = await signatureProvider.isAvailable();

    let sigPublicKey: { classical: Uint8Array; postQuantum: Uint8Array };
    let sigSecretKey: { classical: Uint8Array; postQuantum: Uint8Array };
    if (isAvailable) {
      if (import.meta.env.DEV) devWarn('[MK] Generating signature keypairs client-side');
      const keyPair = await signatureProvider.generateKeyPair();
      sigPublicKey = keyPair.publicKey;
      sigSecretKey = keyPair.secretKey;
    } else {
      // ML-DSA-65 WASM not available — generate Ed25519 only (native WebCrypto)
      if (import.meta.env.DEV) devWarn('[MK] ML-DSA-65 WASM unavailable, generating Ed25519-only client-side');
      const ed25519Key = await crypto.subtle.generateKey(
        { name: 'Ed25519' } as any, true, ['sign', 'verify']
      );
      const ed25519Pub = new Uint8Array(await crypto.subtle.exportKey('raw', ed25519Key.publicKey));
      const ed25519Priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', ed25519Key.privateKey));
      sigPublicKey = { classical: ed25519Pub, postQuantum: new Uint8Array(0) };
      sigSecretKey = { classical: ed25519Priv, postQuantum: new Uint8Array(0) };
    }

    // Ed25519 (64B): AES-256-GCM via encryptLargeSecretKey.
    // ML-DSA-65 seed (32B): AES-KW via wrapSecretWithMK.
    // Guard: Ed25519-only fallback has postQuantum.length===0 — store ''
    // so the 40-byte AES-KW output shape is never confused with an
    // empty/missing blob on read.
    const ed25519Encrypted = await encryptLargeSecretKey(sigSecretKey.classical, bundle.aesGcm);
    const mldsa65EncryptedB64 = sigSecretKey.postQuantum.length === 32
      ? arrayBufferToBase64(toArrayBuffer(await wrapSecretWithMK(sigSecretKey.postQuantum, bundle.aesKw)))
      : '';
    sigSecretKey.classical.fill(0);
    sigSecretKey.postQuantum.fill(0);

    await deps.storeKeyPair.mutateAsync({
      ed25519PublicKey: arrayBufferToBase64(toArrayBuffer(sigPublicKey.classical)),
      ed25519SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(ed25519Encrypted)),
      mldsa65PublicKey: arrayBufferToBase64(toArrayBuffer(sigPublicKey.postQuantum)),
      mldsa65SecretKeyEncrypted: mldsa65EncryptedB64,
    });

    await deps.refetchHasKeyPair();
    if (import.meta.env.DEV) devWarn('[MK] Hybrid signature keypairs generated (migration)');
  } catch (sigMigrationErr) {
    if (import.meta.env.DEV) devWarn('[MK] Hybrid signature keypair migration FAILED:', sigMigrationErr);
    debugError('[crypto]', 'Signature keypair migration failed (will retry next login)', sigMigrationErr);
  }
}

// ============ Post-Unlock: Device UES Registration ============

interface DeviceRegistrationDeps {
  registerDevice: { mutateAsync: (input: {
    deviceFingerprint: string;
    deviceName: string;
    platform: string;
    browserInfo: string;
    uesEncrypted: string;
    uesEncryptionIv: string;
  }) => Promise<unknown> };
}

/**
 * Register device with UES for fast-path unlock on next session.
 * Covers devices verified via OTP that never had UES generated,
 * and pre-existing users from before the device verification feature.
 * Non-blocking — vault unlock works, just no fast-path.
 */
export async function registerDeviceWithUES(
  bundle: MasterKeyBundle,
  deps: DeviceRegistrationDeps,
): Promise<void> {
  if (hasUES()) return;

  try {
    devWarn('[MK] No local UES found — registering device with UES');
    const uesData = await generateAndStoreUES();
    const exported = await exportUESForServer(uesData.ues, bundle);
    const [fpHash, devName, browserInfo] = await Promise.all([
      getDeviceFingerprintHash(),
      Promise.resolve(getDeviceName()),
      Promise.resolve(getBrowserInfo()),
    ]);
    await deps.registerDevice.mutateAsync({
      deviceFingerprint: fpHash,
      deviceName: devName,
      platform: 'web',
      browserInfo,
      uesEncrypted: exported.uesEncrypted,
      uesEncryptionIv: exported.uesIv,
    });
    devWarn('[MK] Device registered with UES — fast unlock available next session');
  } catch (regErr) {
    devWarn('[MK] Device UES registration failed (non-critical):', regErr);
  }
}
