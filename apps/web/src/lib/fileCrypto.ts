/**
 * File Encryption Utility
 *
 * Provides client-side encryption/decryption for thumbnails and filenames.
 * File content encryption uses Hybrid PQC (V4) via hybridFileCrypto.ts.
 *
 * Security Specifications:
 * - Algorithm: AES-256-GCM (authenticated encryption)
 * - IV: 12 bytes (96 bits) random per operation
 * - Auth Tag: 128 bits (included in GCM ciphertext)
 *
 * @module fileCrypto
 */

import {
    arrayBufferToBase64,
    base64ToArrayBuffer,
    CRYPTO_CONSTANTS,
} from '@stenvault/shared/platform/crypto';

// ===== CONSTANTS =====
const IV_LENGTH = CRYPTO_CONSTANTS.GCM_IV_LENGTH;

// Password validation
export { validateEncryptionPassword, type PasswordValidationResult } from './passwordValidation';

// ===== THUMBNAIL ENCRYPTION (Phase 7.2) =====

/**
 * Result of encrypting a thumbnail
 */
export interface ThumbnailEncryptionResult {
    /** Encrypted thumbnail blob (application/octet-stream) */
    encryptedBlob: Blob;
    /** Base64 encoded IV (12 bytes) */
    iv: string;
    /** Size of the encrypted blob in bytes */
    size: number;
}

/**
 * Encrypt a thumbnail blob using a pre-derived CryptoKey
 *
 * This function encrypts client-generated thumbnails before upload.
 * The key should be derived from the Master Key using HKDF with
 * a "thumbnail" context and file ID for uniqueness.
 *
 * @param thumbnailBlob - Thumbnail blob (typically WebP from Canvas API)
 * @param thumbnailKey - Pre-derived AES-GCM key from useMasterKey.deriveThumbnailKey()
 * @returns Encrypted thumbnail data with IV
 *
 * @example
 * ```typescript
 * const { deriveThumbnailKey } = useMasterKey();
 * const thumbnailKey = await deriveThumbnailKey(fileId);
 * const result = await encryptThumbnail(thumbnailBlob, thumbnailKey);
 * // Upload result.encryptedBlob to R2
 * // Send result.iv to backend with file metadata
 * ```
 */
export async function encryptThumbnail(
    thumbnailBlob: Blob,
    thumbnailKey: CryptoKey
): Promise<ThumbnailEncryptionResult> {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Read blob as ArrayBuffer
    const thumbnailData = await thumbnailBlob.arrayBuffer();

    // Encrypt thumbnail data
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        thumbnailKey,
        thumbnailData
    );

    // Create encrypted blob
    const encryptedBlob = new Blob([ciphertext], {
        type: 'application/octet-stream',
    });

    return {
        encryptedBlob,
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
        size: encryptedBlob.size,
    };
}

/**
 * Decrypt a thumbnail blob using a pre-derived CryptoKey
 *
 * @param encryptedBlob - Encrypted thumbnail blob from R2
 * @param thumbnailKey - Pre-derived AES-GCM key from useMasterKey.deriveThumbnailKey()
 * @param iv - Base64 encoded IV used during encryption
 * @returns Decrypted thumbnail as WebP Blob
 *
 * @example
 * ```typescript
 * const { deriveThumbnailKey } = useMasterKey();
 * const thumbnailKey = await deriveThumbnailKey(fileId);
 * const decryptedBlob = await decryptThumbnail(encryptedBlob, thumbnailKey, thumbnailIv);
 * const url = URL.createObjectURL(decryptedBlob);
 * // Display url in <img> element
 * ```
 */
export async function decryptThumbnail(
    encryptedBlob: Blob,
    thumbnailKey: CryptoKey,
    iv: string
): Promise<Blob> {
    if (!iv) {
        throw new Error('IV is required for thumbnail decryption');
    }

    // Convert Base64 IV to Uint8Array
    const ivBuffer = new Uint8Array(base64ToArrayBuffer(iv));

    // Read encrypted blob
    const encryptedData = await encryptedBlob.arrayBuffer();

    // Decrypt thumbnail data
    try {
        const decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer },
            thumbnailKey,
            encryptedData
        );

        // Return as WebP blob (the original format from thumbnail generator)
        return new Blob([decryptedData], { type: 'image/webp' });
    } catch (error) {
        // GCM authentication failed - wrong key or corrupted data
        throw new Error('Thumbnail decryption failed. Invalid key or corrupted data.');
    }
}

/**
 * Decrypt a thumbnail from URL using a pre-derived CryptoKey
 *
 * Convenience function that fetches and decrypts in one call.
 *
 * @param thumbnailUrl - URL to fetch encrypted thumbnail from
 * @param thumbnailKey - Pre-derived AES-GCM key
 * @param iv - Base64 encoded IV
 * @returns Decrypted thumbnail as WebP Blob
 */
export async function decryptThumbnailFromUrl(
    thumbnailUrl: string,
    thumbnailKey: CryptoKey,
    iv: string
): Promise<Blob> {
    // Fetch encrypted thumbnail
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail: ${response.status}`);
    }

    const encryptedBlob = await response.blob();

    // Decrypt and return
    return decryptThumbnail(encryptedBlob, thumbnailKey, iv);
}

// ===== FILENAME ENCRYPTION (Phase 5 Zero-Knowledge) =====

/**
 * Result of encrypting a filename
 */
export interface FilenameEncryptionResult {
    /** Base64 encoded AES-GCM ciphertext */
    encryptedFilename: string;
    /** Base64 encoded IV (12 bytes) */
    iv: string;
}

/**
 * Encrypt a filename using AES-256-GCM with a pre-derived key
 * 
 * This function encrypts filenames for zero-knowledge storage.
 * The key should be derived from the Master Key using HKDF with
 * a "filename" context to keep it separate from file content keys.
 * 
 * @param filename - Plain text filename to encrypt
 * @param filenameKey - Pre-derived AES-GCM key (from Master Key via HKDF)
 * @returns Encrypted filename data with IV
 * 
 * @example
 * ```typescript
 * const { deriveFilenameKey } = useMasterKey();
 * const filenameKey = await deriveFilenameKey();
 * const result = await encryptFilename('secret-document.pdf', filenameKey);
 * // Send result.encryptedFilename and result.iv to backend
 * ```
 */
export async function encryptFilename(
    filename: string,
    filenameKey: CryptoKey
): Promise<FilenameEncryptionResult> {
    if (!filename) {
        throw new Error('Filename is required for encryption');
    }

    // Generate random IV for this filename
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encode filename as UTF-8 bytes and convert to ArrayBuffer
    const plaintext = new TextEncoder().encode(filename);
    const plaintextBuffer = plaintext.buffer.slice(
        plaintext.byteOffset,
        plaintext.byteOffset + plaintext.byteLength
    ) as ArrayBuffer;

    // Encrypt using AES-256-GCM
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        filenameKey,
        plaintextBuffer
    );

    return {
        encryptedFilename: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
}

/**
 * Decrypt a filename using AES-256-GCM with a pre-derived key
 * 
 * @param encryptedFilename - Base64 encoded ciphertext
 * @param filenameKey - Pre-derived AES-GCM key (from Master Key via HKDF)
 * @param iv - Base64 encoded IV used during encryption
 * @returns Decrypted filename as string
 * @throws Error if decryption fails (invalid key or corrupted data)
 * 
 * @example
 * ```typescript
 * const { deriveFilenameKey } = useMasterKey();
 * const filenameKey = await deriveFilenameKey();
 * const filename = await decryptFilename(file.encryptedFilename, filenameKey, file.filenameIv);
 * console.log(filename); // 'secret-document.pdf'
 * ```
 */
export async function decryptFilename(
    encryptedFilename: string,
    filenameKey: CryptoKey,
    iv: string
): Promise<string> {
    if (!encryptedFilename || !iv) {
        throw new Error('Encrypted filename and IV are required for decryption');
    }

    // Convert Base64 to ArrayBuffer
    const ciphertext = base64ToArrayBuffer(encryptedFilename);
    const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));

    try {
        // Decrypt using AES-256-GCM
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            filenameKey,
            ciphertext
        );

        // Decode UTF-8 bytes to string
        return new TextDecoder().decode(plaintext);
    } catch (error) {
        // GCM authentication failed - wrong key or corrupted data
        throw new Error('Filename decryption failed. Invalid key or corrupted data.');
    }
}


// ===== EXPORTS =====
export const CRYPTO_CONFIG = {
    IV_LENGTH,
} as const;
