/**
 * Crypto Utilities
 *
 * Platform-agnostic utility functions for encoding/decoding.
 * These are pure functions that work in any JavaScript environment.
 *
 * Note: This file avoids direct use of platform-specific globals
 * to prevent TypeScript errors in libraries. The base64 functions
 * use a pure JavaScript implementation that works everywhere.
 */


// ============ Base64 Encoding (Pure JS - No Dependencies) ============

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Convert ArrayBuffer to Base64 string
 * Pure JavaScript implementation - works in browser, Node.js, and React Native
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = '';

    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] ?? 0;
        const b = bytes[i + 1] ?? 0;
        const c = bytes[i + 2] ?? 0;

        const triplet = ((a & 0xFF) << 16) | ((b & 0xFF) << 8) | (c & 0xFF);

        result += BASE64_CHARS[(triplet >> 18) & 0x3F];
        result += BASE64_CHARS[(triplet >> 12) & 0x3F];
        result += i + 1 < bytes.length ? BASE64_CHARS[(triplet >> 6) & 0x3F] : '=';
        result += i + 2 < bytes.length ? BASE64_CHARS[triplet & 0x3F] : '=';
    }

    return result;
}

/**
 * Convert Base64 string to ArrayBuffer
 * Pure JavaScript implementation - works in browser, Node.js, and React Native
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Remove padding and create lookup
    const cleanBase64 = base64.replace(/=+$/, '');
    const lookup = new Map<string, number>();
    for (let i = 0; i < BASE64_CHARS.length; i++) {
        const char = BASE64_CHARS[i];
        if (char) lookup.set(char, i);
    }

    // Calculate output length
    const outputLength = Math.floor((cleanBase64.length * 3) / 4);
    const bytes = new Uint8Array(outputLength);

    let byteIndex = 0;
    for (let i = 0; i < cleanBase64.length; i += 4) {
        const charA = cleanBase64[i];
        const charB = cleanBase64[i + 1];
        const charC = cleanBase64[i + 2];
        const charD = cleanBase64[i + 3];
        const a = (charA ? lookup.get(charA) : 0) ?? 0;
        const b = (charB ? lookup.get(charB) : 0) ?? 0;
        const c = (charC ? lookup.get(charC) : 0) ?? 0;
        const d = (charD ? lookup.get(charD) : 0) ?? 0;

        const triplet = (a << 18) | (b << 12) | (c << 6) | d;

        if (byteIndex < outputLength) bytes[byteIndex++] = (triplet >> 16) & 0xFF;
        if (byteIndex < outputLength) bytes[byteIndex++] = (triplet >> 8) & 0xFF;
        if (byteIndex < outputLength) bytes[byteIndex++] = triplet & 0xFF;
    }

    return bytes.buffer;
}

// ============ Hex Encoding ============

/**
 * Convert ArrayBuffer to hex string
 */
export function arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Convert hex string to ArrayBuffer
 */
export function hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

// ============ Uint8Array Utilities ============

/**
 * Convert Uint8Array to a clean ArrayBuffer.
 * Fixes TypeScript strict mode issues with ArrayBufferLike vs ArrayBuffer,
 * and handles the case where data is a view of a larger buffer.
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return buffer;
}

/**
 * Convert Base64 string to Uint8Array.
 * Pure JavaScript implementation - works in browser, Node.js, and React Native.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
    return new Uint8Array(base64ToArrayBuffer(base64));
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }

    return result;
}

/**
 * Compare two Uint8Arrays for equality (constant-time)
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        const valA = a[i] ?? 0;
        const valB = b[i] ?? 0;
        result |= valA ^ valB;
    }

    return result === 0;
}

// ============ IV Generation ============

// ============ Key Fingerprint ============

/**
 * Format fingerprint as XXXX-XXXX-XXXX-XXXX for display
 */
export function formatFingerprint(hex: string): string {
    const upper = hex.toUpperCase().substring(0, 32);
    return upper.match(/.{4}/g)?.join('-') || upper;
}
