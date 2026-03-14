/**
 * Content Fingerprint — Quantum-Safe Duplicate Detection
 *
 * Computes HMAC-SHA-256 fingerprints of plaintext files for user-scoped
 * duplicate detection. The HMAC key is derived from the user's Master Key
 * via HKDF, so:
 *   - Same file + same user = same fingerprint (deterministic)
 *   - Different users = different fingerprints (user-scoped)
 *   - Server sees opaque hex — cannot reverse without HMAC key (zero-knowledge)
 *   - HMAC-SHA-256 with 256-bit key is quantum-safe (Grover doesn't help)
 */

import { debugLog } from '@/lib/debugLogger';

/**
 * Compute a content fingerprint (HMAC-SHA-256) of a file's plaintext bytes.
 *
 * @param file - The plaintext File to fingerprint (before encryption)
 * @param fingerprintKey - CryptoKey for HMAC-SHA-256 (derived from Master Key)
 * @returns 64-character lowercase hex string
 */
export async function computeContentFingerprint(
  file: File,
  fingerprintKey: CryptoKey
): Promise<string> {
  const start = performance.now();

  const data = await file.arrayBuffer();
  const signature = await crypto.subtle.sign('HMAC', fingerprintKey, data);
  const hex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  debugLog('[FP]', 'Content fingerprint computed', {
    size: file.size,
    ms: Math.round(performance.now() - start),
  });

  return hex;
}
