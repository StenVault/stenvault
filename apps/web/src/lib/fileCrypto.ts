/**
 * File Encryption Utility (v3/v4 only)
 *
 * Provides client-side file encryption/decryption using the Platform Abstraction Layer.
 * Uses AES-256-GCM with Master Key (v3) or Hybrid PQC (v4) encryption.
 *
 * Security Specifications:
 * - Algorithm: AES-256-GCM (authenticated encryption)
 * - Key Derivation: HKDF from Master Key (v3), Hybrid X25519+ML-KEM-768 (v4)
 * - IV: 12 bytes (96 bits) random per file
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
const PBKDF2_ITERATIONS = CRYPTO_CONSTANTS.PBKDF2_ITERATIONS;
const KEY_LENGTH = CRYPTO_CONSTANTS.AES_KEY_LENGTH;
const IV_LENGTH = CRYPTO_CONSTANTS.GCM_IV_LENGTH;
const SALT_LENGTH = CRYPTO_CONSTANTS.SALT_LENGTH;
const ENCRYPTION_VERSION_3 = 3; // Master Key based encryption (Phase 1 NEW_DAY)

// Password validation
export { validateEncryptionPassword, type PasswordValidationResult } from './passwordValidation';

// ===== MASTER KEY ENCRYPTION (Phase 1 NEW_DAY - Version 3) =====

/**
 * Result of encrypting a file with a pre-derived key (no salt needed)
 */
export interface FileEncryptionResultV3 {
    blob: Blob;
    iv: string;        // Base64 encoded IV
    salt: null;        // Not used in v3 (HKDF is deterministic)
    version: 3;        // Version 3 = Master Key encryption
}

/**
 * Encrypt a file using a pre-derived CryptoKey (from Master Key via HKDF)
 * 
 * This is the preferred method for Phase 1 NEW_DAY encryption.
 * The key is derived from the Master Key using HKDF with file-specific info,
 * so no salt needs to be stored per file.
 * 
 * @param file - File to encrypt
 * @param fileKey - Pre-derived AES-GCM key from useMasterKey.deriveFileKey()
 * @returns Encrypted file data with metadata (no salt - HKDF is deterministic)
 * 
 * @example
 * ```typescript
 * const { deriveFileKey } = useMasterKey();
 * const fileKey = await deriveFileKey(fileId, Date.now());
 * const result = await encryptFileWithKey(file, fileKey);
 * // Upload result.blob to storage
 * // Save result.iv to database (salt is null for v3)
 * ```
 */
export async function encryptFileWithKey(
    file: File,
    fileKey: CryptoKey
): Promise<FileEncryptionResultV3> {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Read file as ArrayBuffer
    const fileData = await file.arrayBuffer();

    // Encrypt file data using the pre-derived key
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        fileKey,
        fileData
    );

    // Create encrypted blob
    const encryptedBlob = new Blob([ciphertext], {
        type: 'application/octet-stream',
    });

    return {
        blob: encryptedBlob,
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
        salt: null,  // Not used in v3 - HKDF derivation is deterministic
        version: ENCRYPTION_VERSION_3,
    };
}

/**
 * Decrypt file data using a pre-derived CryptoKey (from Master Key via HKDF)
 * 
 * This is the preferred method for Phase 1 NEW_DAY decryption.
 * No password or salt needed - the key is derived from Master Key.
 * 
 * @param encryptedData - Encrypted file data as ArrayBuffer
 * @param fileKey - Pre-derived AES-GCM key from useMasterKey.deriveFileKey()
 * @param iv - Base64 encoded IV used during encryption
 * @returns Decrypted data as ArrayBuffer
 * 
 * @example
 * ```typescript
 * const { deriveFileKey } = useMasterKey();
 * const fileKey = await deriveFileKey(file.id.toString(), file.createdAt.getTime());
 * const decryptedData = await decryptFileWithKey(encryptedData, fileKey, file.encryptionIv);
 * ```
 */
export async function decryptFileWithKey(
    encryptedData: ArrayBuffer,
    fileKey: CryptoKey,
    iv: string
): Promise<ArrayBuffer> {
    if (!iv) {
        throw new Error('IV is required for decryption');
    }

    // Convert Base64 IV to Uint8Array
    const ivBuffer = new Uint8Array(base64ToArrayBuffer(iv));

    // Decrypt file data
    try {
        const decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer },
            fileKey,
            encryptedData
        );
        return decryptedData;
    } catch (error) {
        // GCM authentication failed - wrong key or corrupted data
        throw new Error('Decryption failed. Invalid key or corrupted file.');
    }
}

/**
 * Decrypt a file from URL using a pre-derived CryptoKey and return as Blob
 * 
 * @param fileUrl - URL to fetch encrypted file from
 * @param fileKey - Pre-derived AES-GCM key from useMasterKey.deriveFileKey()
 * @param iv - Base64 encoded IV
 * @param mimeType - Original MIME type of the file
 * @returns Decrypted file as Blob
 */
export async function decryptFileFromUrlWithKey(
    fileUrl: string,
    fileKey: CryptoKey,
    iv: string,
    mimeType: string
): Promise<Blob> {
    // Fetch encrypted file
    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
    }

    const encryptedData = await response.arrayBuffer();

    // Decrypt
    const decryptedData = await decryptFileWithKey(encryptedData, fileKey, iv);

    // Create blob with original MIME type
    return new Blob([decryptedData], { type: mimeType });
}

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
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    IV_LENGTH,
    SALT_LENGTH,
    ENCRYPTION_VERSION_3,  // Master Key based encryption (Phase 1 NEW_DAY)
} as const;
