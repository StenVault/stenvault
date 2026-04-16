/**
 * P2P Crypto Utilities
 *
 * Provides X25519 ECDH key agreement for P2P file transfers.
 * Uses WebCrypto API for secure client-side cryptography.
 *
 * Flow:
 * 1. Both sender and recipient generate X25519 key pairs
 * 2. They exchange public keys (base64url) via signaling
 * 3. ECDH(myPrivate, peerPublic) → 32-byte shared secret
 * 4. HKDF-SHA256(sharedSecret, salt, info) → AES-256-GCM key
 * 5. Encrypt data with AES-GCM + random IV
 * 6. Payload = { encryptedData, iv } — no encryptedKey needed
 *
 * REFACTORED: Migrated from RSA-OAEP key transport to X25519 ECDH key agreement
 */

import {
    arrayBufferToHex,
    formatFingerprint,
} from '@/lib/platform';

// ============ Constants ============

const ECDH_ALGORITHM = { name: "X25519" } as const;
const HKDF_INFO = new TextEncoder().encode("stenvault-p2p-e2e-v2");

// ============ Types ============

export interface P2PKeyPair {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    /** Raw 32-byte public key */
    publicKeyRaw: Uint8Array;
    /** Base64url-encoded public key for signaling */
    publicKeyBase64: string;
}

export interface EncryptedPayload {
    encryptedData: ArrayBuffer;
    iv: Uint8Array;
}

export interface ExportedPublicKey {
    base64: string;
    fingerprint: string;
}

// ============ Base64url Helpers ============

export function base64urlEncode(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]!);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(str: string): Uint8Array {
    // Restore standard base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// ============ Key Generation ============

/**
 * Generate a new X25519 key pair for P2P ECDH key agreement.
 * Private key is non-extractable to prevent exfiltration.
 */
export async function generateKeyPair(): Promise<P2PKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
        ECDH_ALGORITHM,
        true, // extractable needed to export raw public key
        ["deriveBits"]
    ) as CryptoKeyPair;

    // Export raw 32-byte public key
    const publicKeyRaw = new Uint8Array(
        await crypto.subtle.exportKey("raw", keyPair.publicKey)
    );

    // Re-import private key as non-extractable
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const nonExtractablePrivate = await crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        ECDH_ALGORITHM,
        false, // non-extractable
        ["deriveBits"]
    );

    // Best-effort zeroing of temporary JWK
    if (privateKeyJwk.d) privateKeyJwk.d = "";

    const publicKeyBase64 = base64urlEncode(publicKeyRaw);

    return {
        publicKey: keyPair.publicKey,
        privateKey: nonExtractablePrivate,
        publicKeyRaw,
        publicKeyBase64,
    };
}

/**
 * Export public key as base64url with fingerprint
 */
export async function exportPublicKey(keyPair: P2PKeyPair): Promise<ExportedPublicKey> {
    const fingerprint = await generateKeyFingerprint(keyPair.publicKeyRaw);
    return { base64: keyPair.publicKeyBase64, fingerprint };
}

/**
 * Import a public key from base64url format, returning raw bytes
 */
export function importPublicKey(base64: string): Uint8Array {
    return base64urlDecode(base64);
}

/**
 * Import raw public key bytes as a CryptoKey (for ECDH deriveBits)
 */
export async function importPublicKeyCrypto(rawBytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        rawBytes.buffer as ArrayBuffer,
        ECDH_ALGORITHM,
        true,
        []
    );
}

/**
 * Generate a fingerprint for a public key (for verification)
 * Returns formatted fingerprint: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export async function generateKeyFingerprint(rawBytes: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', rawBytes.buffer as ArrayBuffer);
    const hashHex = arrayBufferToHex(hashBuffer);
    return formatFingerprint(hashHex);
}

// ============ ECDH Key Agreement ============

/**
 * Derive a shared AES-256-GCM key from ECDH + HKDF.
 * ECDH(myPrivate, peerPublicRaw) → HKDF-SHA256 → AES-256-GCM CryptoKey
 */
export async function deriveSharedKey(
    myPrivateKey: CryptoKey,
    peerPublicRaw: Uint8Array
): Promise<CryptoKey> {
    // Import peer's raw public key as CryptoKey
    const peerPublicKey = await importPublicKeyCrypto(peerPublicRaw);

    // ECDH → 32 bytes shared secret
    const sharedBits = await crypto.subtle.deriveBits(
        { name: "X25519", public: peerPublicKey },
        myPrivateKey,
        256 // 32 bytes
    );

    // Import shared secret as HKDF key material
    const hkdfKey = await crypto.subtle.importKey(
        "raw",
        sharedBits,
        "HKDF",
        false,
        ["deriveKey"]
    );

    // HKDF → AES-256-GCM key
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("stenvault-p2p-e2e-v2-hkdf-salt"),
            info: HKDF_INFO,
        },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
        false, // non-extractable
        ["encrypt", "decrypt"]
    );

    return aesKey;
}

// ============ Encryption ============

/**
 * Encrypt data using ECDH-derived shared key.
 * deriveSharedKey → random IV → AES-GCM encrypt
 */
export async function encryptForRecipient(
    data: ArrayBuffer,
    myPrivateKey: CryptoKey,
    peerPublicRaw: Uint8Array
): Promise<EncryptedPayload> {
    const sharedKey = await deriveSharedKey(myPrivateKey, peerPublicRaw);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data with AES-GCM
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        data
    );

    return { encryptedData, iv };
}

/**
 * Decrypt data using ECDH-derived shared key.
 * deriveSharedKey → AES-GCM decrypt
 */
export async function decryptFromSender(
    payload: EncryptedPayload,
    myPrivateKey: CryptoKey,
    senderPublicRaw: Uint8Array
): Promise<ArrayBuffer> {
    const sharedKey = await deriveSharedKey(myPrivateKey, senderPublicRaw);

    const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
        sharedKey,
        payload.encryptedData
    );

    return decryptedData;
}

// ============ Verification ============

/**
 * Verify that a public key matches an expected fingerprint
 */
export async function verifyKeyFingerprint(
    publicKeyRaw: Uint8Array,
    expectedFingerprint: string
): Promise<boolean> {
    const fingerprint = await generateKeyFingerprint(publicKeyRaw);
    return fingerprint === expectedFingerprint;
}
