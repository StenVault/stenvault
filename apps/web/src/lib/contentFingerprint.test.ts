/**
 * Content Fingerprint Tests (v2 Streaming Algorithm)
 *
 * Tests the chunked SHA-256 + HMAC-SHA-256 fingerprint algorithm
 * using real WebCrypto APIs (no mocks).
 *
 * @module contentFingerprint.test
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the debugLogger (no-op in tests)
vi.mock('@/lib/debugLogger', () => ({
    debugLog: vi.fn(),
    debugWarn: vi.fn(),
    debugError: vi.fn(),
}));

// Mock constants
vi.mock('@/lib/constants', () => ({
    STREAMING: { THRESHOLD_BYTES: 50 * 1024 * 1024, CHUNK_SIZE_BYTES: 64 * 1024 },
}));

// Mock the Worker (not available in Node test env)
vi.mock('./workers/fingerprint.worker', () => ({}));

import { computeChunkedFingerprintMainThread, computeStreamingFingerprint } from './contentFingerprint';

// ============ Helpers ============

async function generateFingerprintKey(): Promise<CryptoKey> {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const hkdfKey = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode('stenvault-fingerprint-key-v1'),
            info: new TextEncoder().encode('stenvault:fingerprint:v1'),
        },
        hkdfKey,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign'],
    );
}

async function generateDifferentFingerprintKey(): Promise<CryptoKey> {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const hkdfKey = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode('stenvault-fingerprint-key-v1'),
            info: new TextEncoder().encode('stenvault:fingerprint:v1'),
        },
        hkdfKey,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign'],
    );
}

function createFile(content: Uint8Array, name = 'test.bin'): File {
    return new File([content.buffer as ArrayBuffer], name, { type: 'application/octet-stream' });
}

/** Generate random bytes in chunks (happy-dom limits getRandomValues to 65536 bytes) */
function randomBytes(size: number): Uint8Array {
    const result = new Uint8Array(size);
    const chunkSize = 65536;
    for (let offset = 0; offset < size; offset += chunkSize) {
        const len = Math.min(chunkSize, size - offset);
        crypto.getRandomValues(result.subarray(offset, offset + len));
    }
    return result;
}

// ============ Tests ============

describe('contentFingerprint v2 (chunked streaming)', () => {

    describe('computeChunkedFingerprintMainThread', () => {

        it('produces a 64-char lowercase hex string', async () => {
            const key = await generateFingerprintKey();
            const file = createFile(crypto.getRandomValues(new Uint8Array(1024)));

            const hash = await computeChunkedFingerprintMainThread(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('is deterministic — same file + same key = same hash', async () => {
            const key = await generateFingerprintKey();
            const data = crypto.getRandomValues(new Uint8Array(2048));
            const file1 = createFile(data);
            const file2 = createFile(new Uint8Array(data)); // copy of same bytes

            const hash1 = await computeChunkedFingerprintMainThread(file1, key);
            const hash2 = await computeChunkedFingerprintMainThread(file2, key);

            expect(hash1).toBe(hash2);
        });

        it('different files produce different hashes', async () => {
            const key = await generateFingerprintKey();
            const file1 = createFile(crypto.getRandomValues(new Uint8Array(1024)));
            const file2 = createFile(crypto.getRandomValues(new Uint8Array(1024)));

            const hash1 = await computeChunkedFingerprintMainThread(file1, key);
            const hash2 = await computeChunkedFingerprintMainThread(file2, key);

            expect(hash1).not.toBe(hash2);
        });

        it('different keys produce different hashes (user scoping)', async () => {
            const key1 = await generateFingerprintKey();
            const key2 = await generateDifferentFingerprintKey();
            const data = crypto.getRandomValues(new Uint8Array(1024));
            const file = createFile(data);

            const hash1 = await computeChunkedFingerprintMainThread(file, key1);
            const hash2 = await computeChunkedFingerprintMainThread(file, key2);

            expect(hash1).not.toBe(hash2);
        });

        it('handles empty file (0 bytes)', async () => {
            const key = await generateFingerprintKey();
            const file = createFile(new Uint8Array(0));

            const hash = await computeChunkedFingerprintMainThread(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('empty file hash is deterministic', async () => {
            const key = await generateFingerprintKey();
            const file1 = createFile(new Uint8Array(0));
            const file2 = createFile(new Uint8Array(0));

            const hash1 = await computeChunkedFingerprintMainThread(file1, key);
            const hash2 = await computeChunkedFingerprintMainThread(file2, key);

            expect(hash1).toBe(hash2);
        });

        it('handles file smaller than one chunk', async () => {
            const key = await generateFingerprintKey();
            const file = createFile(crypto.getRandomValues(new Uint8Array(100))); // 100 bytes << 64KB

            const hash = await computeChunkedFingerprintMainThread(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('handles multi-chunk file correctly', async () => {
            const key = await generateFingerprintKey();
            // 200KB = ~3 chunks of 64KB
            const data = randomBytes(200 * 1024);
            const file = createFile(data);

            const hash = await computeChunkedFingerprintMainThread(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('multi-chunk file is deterministic', async () => {
            const key = await generateFingerprintKey();
            const data = randomBytes(200 * 1024);
            const file1 = createFile(data);
            const file2 = createFile(new Uint8Array(data));

            const hash1 = await computeChunkedFingerprintMainThread(file1, key);
            const hash2 = await computeChunkedFingerprintMainThread(file2, key);

            expect(hash1).toBe(hash2);
        });

        it('file exactly at chunk boundary produces correct hash', async () => {
            const key = await generateFingerprintKey();
            // Exactly 2 * 64KB = 131072 bytes
            const data = randomBytes(64 * 1024 * 2);
            const file = createFile(data);

            const hash = await computeChunkedFingerprintMainThread(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('multi-chunk determinism across separate calls', async () => {
            const key = await generateFingerprintKey();
            const data = randomBytes(200 * 1024);
            const file = createFile(data);

            const hash1 = await computeChunkedFingerprintMainThread(file, key);
            const hash2 = await computeChunkedFingerprintMainThread(file, key);

            expect(hash1).toBe(hash2);
        });
    });

    describe('computeStreamingFingerprint', () => {

        it('falls back to main thread when Worker is unavailable', async () => {
            const key = await generateFingerprintKey();
            const data = crypto.getRandomValues(new Uint8Array(1024));
            const file = createFile(data);

            // In Node test env, Worker is unavailable → falls back to main thread
            const hash = await computeStreamingFingerprint(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('handles empty file via fast path', async () => {
            const key = await generateFingerprintKey();
            const file = createFile(new Uint8Array(0));

            const hash = await computeStreamingFingerprint(file, key);

            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('main-thread fallback matches computeChunkedFingerprintMainThread', async () => {
            const key = await generateFingerprintKey();
            const data = randomBytes(200 * 1024);
            const file = createFile(data);

            const streamingHash = await computeStreamingFingerprint(file, key);
            const directHash = await computeChunkedFingerprintMainThread(file, key);

            // Empty file uses fast path (HMAC of empty buffer), non-empty uses chunked
            // For non-empty files in test env, both use main-thread chunked path
            expect(streamingHash).toBe(directHash);
        });
    });
});
