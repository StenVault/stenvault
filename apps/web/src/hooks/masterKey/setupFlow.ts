/**
 * Master Key Setup Flow — Key Pair Generation
 *
 * Generates and stores hybrid KEM + signature keypairs during initial
 * Master Key setup for new users. Unlike migrations (fire-and-forget),
 * KEM generation here is MANDATORY — failure throws.
 * Signature generation is non-fatal (logged warning).
 */

import type { MasterKeyBundle } from '../masterKeyCrypto';
import { toArrayBuffer, encryptLargeSecretKey, wrapSecretWithMK } from '../masterKeyCrypto';
import { arrayBufferToBase64 } from '@/lib/platform';
import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getHybridSignatureProvider } from '@/lib/platform/webHybridSignatureProvider';
import { debugLog, debugError } from '@/lib/debugLogger';
// CRYPTO-005: generateKeyFingerprint removed — computed server-side now

interface SetupKeyGenDeps {
  storeHybridKeyPair: { mutateAsync: (input: {
    x25519PublicKey: string;
    x25519SecretKeyEncrypted: string;
    mlkem768PublicKey: string;
    mlkem768SecretKeyEncrypted: string;
  }) => Promise<unknown> };
  refetchHasKeyPair: () => Promise<unknown>;
  storeSignatureKeyPair: { mutateAsync: (input: {
    ed25519PublicKey: string;
    ed25519SecretKeyEncrypted: string;
    mldsa65PublicKey: string;
    mldsa65SecretKeyEncrypted: string;
  }) => Promise<unknown> };
  refetchHasSignatureKeyPair: () => Promise<unknown>;
}

/**
 * Generate and store hybrid KEM + signature keypairs during setup.
 * KEM failure = throw (V4 encryption requires quantum-safe keys).
 * Signature failure = logged warning (non-fatal).
 */
export async function generateAndStoreKeyPairs(
  bundle: MasterKeyBundle,
  deps: SetupKeyGenDeps,
): Promise<void> {
  // ===== Hybrid KEM (mandatory — V4 encryption needs these) =====
  debugLog('[crypto]', 'Generating hybrid keypairs (X25519 + ML-KEM-768)');

  const hybridKem = getHybridKemProvider();

  const isHybridAvailable = await hybridKem.isAvailable();
  if (!isHybridAvailable) {
    const err = new Error('Hybrid KEM (ML-KEM-768) WASM not available. V4 encryption requires quantum-safe keys.');
    (err as any).code = 'HYBRID_KEM_UNAVAILABLE';
    throw err;
  }

  const { publicKey, secretKey } = await hybridKem.generateKeyPair();

  const x25519WrappedBytes = await wrapSecretWithMK(secretKey.classical, bundle.aesKw);
  const mlkemEncrypted = await encryptLargeSecretKey(secretKey.postQuantum, bundle.aesGcm);

  // CRYPTO-005: fingerprint is now computed server-side
  await deps.storeHybridKeyPair.mutateAsync({
    x25519PublicKey: arrayBufferToBase64(toArrayBuffer(publicKey.classical)),
    x25519SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(x25519WrappedBytes)),
    mlkem768PublicKey: arrayBufferToBase64(toArrayBuffer(publicKey.postQuantum)),
    mlkem768SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(mlkemEncrypted)),
  });

  debugLog('[crypto]', 'Hybrid keypairs generated and stored');
  await deps.refetchHasKeyPair();

  // ===== Hybrid Signatures (non-fatal — can be regenerated later) =====
  try {
    debugLog('[crypto]', 'Generating hybrid signature keypairs (Ed25519 + ML-DSA-65)');

    const signatureProvider = getHybridSignatureProvider();
    const isSignatureAvailable = await signatureProvider.isAvailable();

    let sigPublicKey: { classical: Uint8Array; postQuantum: Uint8Array };
    let sigSecretKey: { classical: Uint8Array; postQuantum: Uint8Array };

    if (isSignatureAvailable) {
      const keyPair = await signatureProvider.generateKeyPair();
      sigPublicKey = keyPair.publicKey;
      sigSecretKey = keyPair.secretKey;
    } else {
      debugLog('[crypto]', 'ML-DSA-65 WASM unavailable, generating Ed25519-only client-side');
      const ed25519Key = await crypto.subtle.generateKey(
        { name: 'Ed25519' } as any, true, ['sign', 'verify']
      );
      const ed25519Pub = new Uint8Array(await crypto.subtle.exportKey('raw', ed25519Key.publicKey));
      const ed25519Priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', ed25519Key.privateKey));
      sigPublicKey = { classical: ed25519Pub, postQuantum: new Uint8Array(0) };
      sigSecretKey = { classical: ed25519Priv, postQuantum: new Uint8Array(0) };
    }

    // Ed25519 (64B): AES-256-GCM. ML-DSA-65 seed (32B): AES-KW.
    // Guard: Ed25519-only fallback has postQuantum.length===0 — persist ''
    // so an empty blob survives the round-trip without colliding with
    // the 40-byte wrapped shape.
    const ed25519Encrypted = await encryptLargeSecretKey(sigSecretKey.classical, bundle.aesGcm);
    const mldsa65EncryptedB64 = sigSecretKey.postQuantum.length === 32
      ? arrayBufferToBase64(toArrayBuffer(await wrapSecretWithMK(sigSecretKey.postQuantum, bundle.aesKw)))
      : '';
    sigSecretKey.classical.fill(0);
    sigSecretKey.postQuantum.fill(0);

    await deps.storeSignatureKeyPair.mutateAsync({
      ed25519PublicKey: arrayBufferToBase64(toArrayBuffer(sigPublicKey.classical)),
      ed25519SecretKeyEncrypted: arrayBufferToBase64(toArrayBuffer(ed25519Encrypted)),
      mldsa65PublicKey: arrayBufferToBase64(toArrayBuffer(sigPublicKey.postQuantum)),
      mldsa65SecretKeyEncrypted: mldsa65EncryptedB64,
    });

    debugLog('[crypto]', 'Hybrid signature keypairs generated and stored');
    await deps.refetchHasSignatureKeyPair();
  } catch (sigErr) {
    debugError('[crypto]', 'Failed to generate signature keypairs (non-fatal)', sigErr);
  }
}
