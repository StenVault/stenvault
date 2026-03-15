/**
 * Share Crypto Utilities
 *
 * Pure crypto functions for encrypted file sharing.
 * Re-encrypts file keys with a share-specific key so recipients
 * can decrypt without the owner's Master Key.
 *
 * Two modes:
 * - Password-protected: share key derived from password via PBKDF2
 * - Link-only (passwordless): random 32-byte key encoded in URL fragment
 *
 * @module shareCrypto
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/platform';
import { CRYPTO_CONSTANTS } from '@stenvault/shared/platform/crypto';

const PBKDF2_ITERATIONS = CRYPTO_CONSTANTS.PBKDF2_ITERATIONS;
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes
const SALT_LENGTH = 16; // bytes
const URL_FRAGMENT_SENTINEL = 'url-fragment';

// ===== Low-level helpers =====

function base64urlEncode(buf: Uint8Array): string {
    return arrayBufferToBase64(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4);
    return new Uint8Array(base64ToArrayBuffer(padded));
}

async function deriveShareKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function importShareKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt'],
    );
}

// ===== Payload encrypt/decrypt =====

interface SharePayload {
    /** Base64-encoded file key bytes */
    fk: string;
    /** Display filename */
    fn: string;
}

async function encryptPayload(
    payload: SharePayload,
    shareKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        shareKey,
        plaintext,
    );
    return {
        ciphertext: arrayBufferToBase64(ct),
        iv: arrayBufferToBase64(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer),
    };
}

async function decryptPayload(
    ciphertextB64: string,
    ivB64: string,
    shareKey: CryptoKey,
): Promise<SharePayload> {
    const ct = base64ToArrayBuffer(ciphertextB64);
    const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
    let plaintext: ArrayBuffer;
    try {
        plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            shareKey,
            ct,
        );
    } catch {
        throw new Error('File decryption failed: invalid key or corrupted data');
    }
    return JSON.parse(new TextDecoder().decode(plaintext));
}

// ===== Public API =====

export interface EncryptedShareData {
    encryptedShareKey: string; // base64 ciphertext
    shareKeyIv: string;       // base64 IV
    shareKeySalt: string;     // base64 salt (password) or sentinel (link)
}

/**
 * Create a password-protected share.
 * Derives a key from the password and encrypts the file key + filename.
 */
export async function createPasswordShare(
    fileKeyBytes: Uint8Array,
    filename: string,
    password: string,
): Promise<EncryptedShareData> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const shareKey = await deriveShareKeyFromPassword(password, salt);
    const payload: SharePayload = {
        fk: arrayBufferToBase64(fileKeyBytes.buffer.slice(fileKeyBytes.byteOffset, fileKeyBytes.byteOffset + fileKeyBytes.byteLength) as ArrayBuffer),
        fn: filename,
    };
    const { ciphertext, iv } = await encryptPayload(payload, shareKey);
    return {
        encryptedShareKey: ciphertext,
        shareKeyIv: iv,
        shareKeySalt: arrayBufferToBase64(salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer),
    };
}

/**
 * Create a link-only (passwordless) share.
 * Generates a random key and returns it as a URL-safe base64 fragment.
 */
export async function createLinkShare(
    fileKeyBytes: Uint8Array,
    filename: string,
): Promise<{ encrypted: EncryptedShareData; fragmentKey: string }> {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const shareKey = await importShareKey(rawKey);
    const payload: SharePayload = {
        fk: arrayBufferToBase64(fileKeyBytes.buffer.slice(fileKeyBytes.byteOffset, fileKeyBytes.byteOffset + fileKeyBytes.byteLength) as ArrayBuffer),
        fn: filename,
    };
    const { ciphertext, iv } = await encryptPayload(payload, shareKey);
    const fragmentKey = base64urlEncode(rawKey);
    // Zero the raw key
    rawKey.fill(0);
    return {
        encrypted: {
            encryptedShareKey: ciphertext,
            shareKeyIv: iv,
            shareKeySalt: URL_FRAGMENT_SENTINEL,
        },
        fragmentKey,
    };
}

/**
 * Decrypt a password-protected share payload.
 */
export async function decryptPasswordShare(
    data: { key: string; iv: string; salt: string },
    password: string,
): Promise<{ fileKeyBytes: Uint8Array; filename: string }> {
    const salt = new Uint8Array(base64ToArrayBuffer(data.salt));
    const shareKey = await deriveShareKeyFromPassword(password, salt);
    const payload = await decryptPayload(data.key, data.iv, shareKey);
    return {
        fileKeyBytes: new Uint8Array(base64ToArrayBuffer(payload.fk)),
        filename: payload.fn,
    };
}

/**
 * Decrypt a link-only share payload using the URL fragment key.
 */
export async function decryptLinkShare(
    data: { key: string; iv: string; salt: string },
    fragmentKeyB64url: string,
): Promise<{ fileKeyBytes: Uint8Array; filename: string }> {
    const rawKey = base64urlDecode(fragmentKeyB64url);
    const shareKey = await importShareKey(rawKey);
    // Zero after import
    rawKey.fill(0);
    const payload = await decryptPayload(data.key, data.iv, shareKey);
    return {
        fileKeyBytes: new Uint8Array(base64ToArrayBuffer(payload.fk)),
        filename: payload.fn,
    };
}

/**
 * Check if a share uses URL fragment (link-only) mode.
 */
export function isLinkShare(salt: string): boolean {
    return salt === URL_FRAGMENT_SENTINEL;
}
