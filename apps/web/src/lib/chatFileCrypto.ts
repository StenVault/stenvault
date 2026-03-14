/**
 * Chat File Crypto — Hybrid Post-Quantum Re-encryption for File Sharing
 *
 * Enables zero-knowledge file sharing in chat:
 * - File key is re-encrypted for recipient using hybrid KEM (X25519 + ML-KEM-768)
 * - Server never sees plaintext file key
 *
 * @module lib/chatFileCrypto
 */

import {
    arrayBufferToBase64,
    base64ToArrayBuffer,
    arrayBufferToHex,
    formatFingerprint,
    getHybridKemProvider,
    serializeHybridCiphertext,
    deserializeHybridCiphertext,
} from "@/lib/platform";
import type {
    HybridPublicKey,
    HybridSecretKey,
    HybridCiphertextSerialized,
} from "@/lib/platform";

// Constants
const HKDF_INFO = "chat-file-share-hybrid-v1";
const HKDF_HASH = "SHA-256";
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;

/**
 * Derive AES-GCM key from hybrid shared secret using HKDF
 */
async function deriveKeyFromSharedSecret(
    sharedSecret: Uint8Array,
    salt: Uint8Array
): Promise<CryptoKey> {
    if (!salt || salt.byteLength === 0) {
        throw new Error("Invalid salt: salt must be non-empty for key derivation");
    }
    if (salt.byteLength < 16) {
        throw new Error(`Invalid salt: expected at least 16 bytes, got ${salt.byteLength}`);
    }

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        sharedSecret.buffer as ArrayBuffer,
        "HKDF",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: HKDF_HASH,
            salt: salt.buffer as ArrayBuffer,
            info: new TextEncoder().encode(HKDF_INFO),
        },
        keyMaterial,
        { name: "AES-GCM", length: AES_KEY_LENGTH },
        false,
        ["encrypt", "decrypt"]
    );
}

export interface ReEncryptedFileKey {
    /** Base64-encoded encrypted file key */
    encryptedFileKey: string;
    /** Base64-encoded IV used for encryption */
    iv: string;
    /** Base64-encoded salt used for key derivation */
    salt: string;
    /** Serialized hybrid KEM ciphertext (JSON string) */
    kemCiphertext: string;
}

export interface FileKeyDecryptionParams {
    /** Base64-encoded encrypted file key */
    encryptedFileKey: string;
    /** Base64-encoded IV */
    iv: string;
    /** Base64-encoded salt */
    salt: string;
    /** Serialized hybrid KEM ciphertext (JSON string) */
    kemCiphertext: string;
    /** My hybrid secret key for decapsulation */
    myHybridSecretKey: HybridSecretKey;
}

/**
 * Re-encrypt a file key for a peer using hybrid KEM
 *
 * Flow:
 * 1. Encapsulate to recipient's hybrid public key → {kemCiphertext, sharedSecret}
 * 2. HKDF(sharedSecret, salt, info) → KEK
 * 3. AES-GCM encrypt file key with KEK
 *
 * @param fileKeyBytes - Raw file key bytes to re-encrypt
 * @param recipientHybridPublicKey - Recipient's hybrid public key
 * @returns Encrypted file key with IV, salt, and kemCiphertext
 */
export async function reEncryptFileKeyForPeer(
    fileKeyBytes: ArrayBuffer,
    recipientHybridPublicKey: HybridPublicKey
): Promise<ReEncryptedFileKey> {
    const provider = getHybridKemProvider();

    // 1. Encapsulate → shared secret + ciphertext
    const { ciphertext: hybridCiphertext, sharedSecret } =
        await provider.encapsulate(recipientHybridPublicKey);

    // 2. Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // 3. Derive AES-GCM key from shared secret
    const kek = await deriveKeyFromSharedSecret(sharedSecret, salt);

    // 4. Encrypt file key with AES-GCM
    const encryptedFileKey = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
        kek,
        fileKeyBytes
    );

    // 5. Serialize
    const serializedCiphertext = serializeHybridCiphertext(hybridCiphertext);

    return {
        encryptedFileKey: arrayBufferToBase64(encryptedFileKey),
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
        salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
        kemCiphertext: JSON.stringify(serializedCiphertext),
    };
}

/**
 * Decrypt a file key received from a peer
 *
 * Flow:
 * 1. Decapsulate(kemCiphertext, mySecretKey) → sharedSecret
 * 2. HKDF(sharedSecret, salt, info) → KEK
 * 3. AES-GCM decrypt file key
 *
 * @param params - Decryption parameters
 * @returns Decrypted file key as ArrayBuffer
 */
export async function decryptFileKeyFromPeer(
    params: FileKeyDecryptionParams
): Promise<ArrayBuffer> {
    const { encryptedFileKey, iv, salt, kemCiphertext, myHybridSecretKey } = params;

    // Validate inputs
    if (!encryptedFileKey || encryptedFileKey.length === 0) {
        throw new Error("Invalid encrypted file key: cannot be empty");
    }
    if (!iv || iv.length === 0) {
        throw new Error("Invalid IV: cannot be empty");
    }
    if (!salt || salt.length === 0) {
        throw new Error("Invalid salt: cannot be empty. The share data may be corrupted.");
    }
    if (!kemCiphertext || kemCiphertext.length === 0) {
        throw new Error("Invalid kemCiphertext: cannot be empty");
    }

    const provider = getHybridKemProvider();

    // 1. Deserialize and decapsulate
    const serialized: HybridCiphertextSerialized = JSON.parse(kemCiphertext);
    const hybridCiphertext = deserializeHybridCiphertext(serialized);
    const sharedSecret = await provider.decapsulate(hybridCiphertext, myHybridSecretKey);

    // 2. Decode salt and IV
    let saltBytes: Uint8Array;
    let ivBytes: Uint8Array;
    try {
        saltBytes = new Uint8Array(base64ToArrayBuffer(salt));
        ivBytes = new Uint8Array(base64ToArrayBuffer(iv));
    } catch (error) {
        const msg = error instanceof Error ? error.message : "unknown error";
        throw new Error(`Failed to decode share encryption parameters: ${msg}`);
    }

    if (ivBytes.byteLength !== IV_LENGTH) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${ivBytes.byteLength}`);
    }
    if (saltBytes.byteLength < 16) {
        throw new Error(
            `Invalid salt length: expected at least 16 bytes, got ${saltBytes.byteLength}. The share data may be corrupted.`
        );
    }

    // 3. Derive same AES-GCM key from shared secret
    const kek = await deriveKeyFromSharedSecret(sharedSecret, saltBytes);

    // 4. Decrypt file key
    const encryptedBytes = base64ToArrayBuffer(encryptedFileKey);
    let decryptedFileKey: ArrayBuffer;
    try {
        decryptedFileKey = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer },
            kek,
            encryptedBytes
        );
    } catch {
        throw new Error('Message decryption failed: invalid key or corrupted data');
    }

    return decryptedFileKey;
}

/**
 * Import raw file key bytes as CryptoKey for file decryption
 */
export async function importFileKey(fileKeyBytes: ArrayBuffer): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        fileKeyBytes,
        { name: "AES-GCM", length: AES_KEY_LENGTH },
        false,
        ["decrypt"]
    );
}

/**
 * Export a CryptoKey to raw bytes for re-encryption
 */
export async function exportFileKey(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key);
}

/**
 * Generate a fingerprint for a hybrid public key
 */
export async function generateKeyFingerprint(x25519PublicKey: string, mlkem768PublicKey: string): Promise<string> {
    const keyString = `${x25519PublicKey}:${mlkem768PublicKey}`;
    const data = new TextEncoder().encode(keyString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
    const hashHex = arrayBufferToHex(hashBuffer);
    return formatFingerprint(hashHex);
}
