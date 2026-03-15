/**
 * Local Send — E2E Encryption
 *
 * ECDH P-256 ephemeral key exchange → HKDF-SHA256 → AES-256-GCM per chunk.
 * Forward secrecy by default (new key pair per session).
 *
 * Why ECDH P-256 over RSA-OAEP:
 * - 5ms key gen vs 200ms (instant LAN handshake)
 * - Forward secrecy (ephemeral)
 * - 65 byte public key vs 256+ (smaller signaling payload)
 */

const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };

// ═══════════════════════════════════════════════════════════════════
// KEY GENERATION & EXCHANGE
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate an ephemeral ECDH P-256 key pair.
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey", "deriveBits"]);
}

/**
 * Export the public key to base64 for signaling.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return uint8ToBase64(new Uint8Array(raw));
}

/**
 * Import a peer's public key from base64.
 */
export async function importPublicKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToUint8(base64);
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, ECDH_PARAMS, true, []);
}

/**
 * Derive a shared AES-256-GCM key from our private + their public key.
 * Uses HKDF-SHA256 with context info to prevent cross-protocol attacks.
 */
export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  // Step 1: ECDH → shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    256,
  );

  // Step 2: Import as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"],
  );

  // Step 3: HKDF → AES-256-GCM key
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32), // fixed salt (ECDH output already has high entropy)
      info: new TextEncoder().encode("stenvault-local-send-v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHUNK ENCRYPTION / DECRYPTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Derive a deterministic 12-byte IV from file index + chunk index.
 * Layout: [fileIndex BE u32][4 zero bytes][chunkIndex BE u32]
 *
 * fileIndex in bytes 0-3 ensures different files in the same ECDH session
 * never share an IV, preventing catastrophic AES-GCM nonce reuse.
 */
function deriveIV(fileIndex: number, chunkIndex: number): Uint8Array {
  const iv = new Uint8Array(12);
  const view = new DataView(iv.buffer);
  view.setUint32(0, fileIndex, false); // bytes 0-3 = file index
  view.setUint32(8, chunkIndex, false); // bytes 8-11 = chunk index
  return iv;
}

/**
 * Encrypt a chunk with AES-256-GCM.
 * Returns ciphertext + 16-byte auth tag appended.
 */
export async function encryptChunk(
  chunk: Uint8Array,
  aesKey: CryptoKey,
  chunkIndex: number,
  fileIndex: number = 0,
): Promise<Uint8Array> {
  const iv = deriveIV(fileIndex, chunkIndex);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
    aesKey,
    chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
  );
  return new Uint8Array(encrypted);
}

/**
 * Decrypt a chunk with AES-256-GCM.
 */
export async function decryptChunk(
  encrypted: Uint8Array,
  aesKey: CryptoKey,
  chunkIndex: number,
  fileIndex: number = 0,
): Promise<Uint8Array> {
  const iv = deriveIV(fileIndex, chunkIndex);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
    aesKey,
    encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer,
  );
  return new Uint8Array(decrypted);
}

// ═══════════════════════════════════════════════════════════════════
// VERIFICATION CODE
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a 6-char verification code from both public keys.
 * Displayed on both screens so users can confirm they're talking to each other.
 */
export async function generateVerificationCode(
  pubKeyA: string,
  pubKeyB: string,
): Promise<string> {
  // Sort to ensure same code regardless of who's A vs B
  const sorted = [pubKeyA, pubKeyB].sort();
  const combined = new TextEncoder().encode(sorted.join(":"));
  const hash = await crypto.subtle.digest("SHA-256", combined);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.substring(0, 6).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64ToUint8(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
