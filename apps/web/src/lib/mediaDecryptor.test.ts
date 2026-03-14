/**
 * Unit Tests for Media Decryptor
 *
 * Tests the mediaDecryptor module including:
 * - Threshold-based worker selection
 * - Main thread fallback decryption
 * - Blob URL creation and cleanup
 * - Progress callback handling
 * - Version handling (V3 vs V4)
 * - Default version behavior
 * - Error scenarios (decrypt failure, fetch failure, key import failure)
 * - decryptMediaFromUrl with progress
 * - Worker termination safety
 *
 * Note: Web Worker tests require jsdom environment with worker support,
 * which is limited. We focus on the main thread logic and interfaces.
 *
 * @module mediaDecryptor.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    decryptMedia,
    decryptMediaFromUrl,
    shouldUseWorker,
    getWorkerThreshold,
    terminateWorker
} from './mediaDecryptor';


const TEST_KEY_BYTES = new Uint8Array(32).fill(1); // 32 bytes for AES-256
const TEST_IV = new Uint8Array(12).fill(2); // 12 bytes for GCM

/**
 * Create a mock encrypted buffer that simulates AES-GCM encrypted data
 * In real scenarios, this would be actual encrypted data
 */
function createMockEncryptedData(sizeBytes: number): ArrayBuffer {
    const buffer = new ArrayBuffer(sizeBytes);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < sizeBytes; i++) {
        view[i] = i % 256;
    }
    return buffer;
}


// Mock URL.createObjectURL and revokeObjectURL
const mockBlobUrls: string[] = [];
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
    vi.clearAllMocks();
    mockBlobUrls.length = 0;

    // Mock URL.createObjectURL
    URL.createObjectURL = vi.fn((blob: Blob) => {
        const url = `blob:mock-${Math.random().toString(36).slice(2)}`;
        mockBlobUrls.push(url);
        return url;
    });

    // Mock URL.revokeObjectURL
    URL.revokeObjectURL = vi.fn((url: string) => {
        const index = mockBlobUrls.indexOf(url);
        if (index > -1) {
            mockBlobUrls.splice(index, 1);
        }
    });
});

afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    terminateWorker();
});


describe('mediaDecryptor', () => {
    describe('shouldUseWorker', () => {
        it('returns false for files under threshold', () => {
            const threshold = getWorkerThreshold();
            expect(shouldUseWorker(threshold - 1)).toBe(false);
            expect(shouldUseWorker(1000)).toBe(false);
            expect(shouldUseWorker(0)).toBe(false);
        });

        it('returns false for files exactly at threshold', () => {
            const threshold = getWorkerThreshold();
            // At threshold (not over) - still uses main thread
            expect(shouldUseWorker(threshold)).toBe(false);
        });

        it('returns true for files over threshold (when Worker available)', () => {
            const threshold = getWorkerThreshold();
            // Note: In Node.js test environment, Worker may not be available
            // This test validates the threshold logic, not actual Worker support
            if (typeof Worker !== 'undefined') {
                expect(shouldUseWorker(threshold + 1)).toBe(true);
                expect(shouldUseWorker(threshold * 2)).toBe(true);
            } else {
                // When Worker is not available, always returns false
                expect(shouldUseWorker(threshold + 1)).toBe(false);
            }
        });
    });

    describe('getWorkerThreshold', () => {
        it('returns the threshold value (10MB)', () => {
            const threshold = getWorkerThreshold();
            expect(threshold).toBe(10 * 1024 * 1024); // 10MB
        });
    });

    describe('decryptMedia - main thread fallback', () => {
        it('creates a Blob URL for small files', async () => {
            // Create a small test buffer (1KB) that will use main thread
            const smallBuffer = createMockEncryptedData(1024);

            // Mock crypto.subtle.decrypt
            const mockDecryptedData = new ArrayBuffer(1000);
            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(mockDecryptedData);

            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4',
                3
            );

            expect(result).toHaveProperty('blob');
            expect(result).toHaveProperty('url');
            expect(result).toHaveProperty('cleanup');
            expect(result.url).toMatch(/^blob:/);
            expect(typeof result.cleanup).toBe('function');
        });

        it('calls progress callback during decryption', async () => {
            const smallBuffer = createMockEncryptedData(1024);
            const progressCallback = vi.fn();

            // Mock crypto.subtle
            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(1000));

            await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'audio/mp3',
                3,
                { onProgress: progressCallback }
            );

            expect(progressCallback).toHaveBeenCalled();

            // Should have at least start and end progress
            const calls = progressCallback.mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(2);

            // First call should be early progress
            expect(calls[0]?.[0]?.percentage).toBeLessThan(50);

            // Last call should be 100%
            expect(calls[calls.length - 1]?.[0]?.percentage).toBe(100);
        });

        it('revokes Blob URL when cleanup is called', async () => {
            const smallBuffer = createMockEncryptedData(1024);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(1000));

            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'image/png',
                4
            );

            // URL should exist
            expect(mockBlobUrls).toContain(result.url);

            // Call cleanup
            result.cleanup();

            // URL should be revoked
            expect(URL.revokeObjectURL).toHaveBeenCalledWith(result.url);
        });

        it('creates Blob with correct MIME type', async () => {
            const smallBuffer = createMockEncryptedData(512);
            const mockDecryptedData = new ArrayBuffer(500);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(mockDecryptedData);

            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'video/webm',
                3
            );

            expect(result.blob.type).toBe('video/webm');
        });

        it('throws error on decryption failure', async () => {
            const smallBuffer = createMockEncryptedData(512);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockRejectedValue(new Error('Decryption failed'));

            await expect(
                decryptMedia(smallBuffer, TEST_KEY_BYTES, TEST_IV, 'video/mp4', 3)
            ).rejects.toThrow('File decryption failed: invalid key or corrupted data');
        });

        it('throws error on key import failure', async () => {
            const smallBuffer = createMockEncryptedData(512);

            vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(
                new Error('Invalid key data')
            );

            await expect(
                decryptMedia(smallBuffer, TEST_KEY_BYTES, TEST_IV, 'video/mp4', 3)
            ).rejects.toThrow('Invalid key data');
        });
    });

    describe('decryptMedia - version handling', () => {
        it('accepts version 3 (Master Key HKDF)', async () => {
            const smallBuffer = createMockEncryptedData(512);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(500));

            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4',
                3
            );

            expect(result.blob).toBeDefined();
        });

        it('accepts version 4 (Hybrid PQC)', async () => {
            const smallBuffer = createMockEncryptedData(512);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(500));

            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'audio/mp3',
                4
            );

            expect(result.blob).toBeDefined();
        });

        it('defaults to version 3 when not specified', async () => {
            const smallBuffer = createMockEncryptedData(512);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(500));

            // Call without version parameter
            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4'
            );

            expect(result.blob).toBeDefined();
        });
    });

    describe('decryptMedia - Blob size accuracy', () => {
        it('creates Blob with correct data size', async () => {
            const smallBuffer = createMockEncryptedData(2048);
            const decryptedSize = 2000;
            const mockDecryptedData = new ArrayBuffer(decryptedSize);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(mockDecryptedData);

            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'application/pdf',
                3
            );

            expect(result.blob.size).toBe(decryptedSize);
        });
    });

    describe('decryptMedia - progress reporting', () => {
        it('reports bytesProcessed and totalBytes in progress', async () => {
            const dataSize = 4096;
            const smallBuffer = createMockEncryptedData(dataSize);
            const progressCallback = vi.fn();

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(4000));

            await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4',
                3,
                { onProgress: progressCallback }
            );

            // Check that all progress calls have expected shape
            for (const call of progressCallback.mock.calls) {
                const progress = call[0];
                expect(progress).toHaveProperty('percentage');
                expect(progress).toHaveProperty('bytesProcessed');
                expect(progress).toHaveProperty('totalBytes');
                expect(typeof progress.percentage).toBe('number');
            }

            // totalBytes should match the encrypted data size
            const firstCall = progressCallback.mock.calls[0]?.[0];
            expect(firstCall?.totalBytes).toBe(dataSize);
        });

        it('works without progress callback', async () => {
            const smallBuffer = createMockEncryptedData(512);

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(500));

            // No options at all
            const result = await decryptMedia(
                smallBuffer,
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4',
                3
            );

            expect(result.blob).toBeDefined();
        });
    });

    describe('decryptMediaFromUrl', () => {
        it('fetches and decrypts data from URL', async () => {
            const mockEncryptedData = createMockEncryptedData(2048);
            const mockDecryptedData = new ArrayBuffer(2000);

            // Mock fetch
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(mockEncryptedData),
            });

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(mockDecryptedData);

            const result = await decryptMediaFromUrl(
                'https://example.com/encrypted-video.enc',
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4',
                3
            );

            expect(fetch).toHaveBeenCalledWith('https://example.com/encrypted-video.enc');
            expect(result.url).toMatch(/^blob:/);
        });

        it('throws error on fetch failure', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/not-found.enc',
                    TEST_KEY_BYTES,
                    TEST_IV,
                    'video/mp4',
                    3
                )
            ).rejects.toThrow('Failed to fetch encrypted media: 404');
        });

        it('throws error on network failure', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/file.enc',
                    TEST_KEY_BYTES,
                    TEST_IV,
                    'video/mp4',
                    3
                )
            ).rejects.toThrow('Network error');
        });

        it('reports initial fetching progress', async () => {
            const mockEncryptedData = createMockEncryptedData(1024);
            const progressCallback = vi.fn();

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(mockEncryptedData),
            });

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(1000));

            await decryptMediaFromUrl(
                'https://example.com/file.enc',
                TEST_KEY_BYTES,
                TEST_IV,
                'audio/mp3',
                4,
                { onProgress: progressCallback }
            );

            // First progress call should be 0% (fetching)
            expect(progressCallback.mock.calls[0]?.[0]?.percentage).toBe(0);
        });

        it('defaults to version 3 when not specified', async () => {
            const mockEncryptedData = createMockEncryptedData(1024);

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(mockEncryptedData),
            });

            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(1000));

            const result = await decryptMediaFromUrl(
                'https://example.com/file.enc',
                TEST_KEY_BYTES,
                TEST_IV,
                'video/mp4'
            );

            expect(result.blob).toBeDefined();
        });

        it('handles server error status codes', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
            });

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/file.enc',
                    TEST_KEY_BYTES,
                    TEST_IV,
                    'video/mp4',
                    3
                )
            ).rejects.toThrow('Failed to fetch encrypted media: 500');
        });

        it('handles 403 forbidden (expired presigned URL)', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
            });

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/file.enc',
                    TEST_KEY_BYTES,
                    TEST_IV,
                    'video/mp4',
                    3
                )
            ).rejects.toThrow('Failed to fetch encrypted media: 403');
        });
    });

    describe('terminateWorker', () => {
        it('can be called safely even when no worker exists', () => {
            expect(() => terminateWorker()).not.toThrow();
        });

        it('can be called multiple times safely', () => {
            expect(() => {
                terminateWorker();
                terminateWorker();
                terminateWorker();
            }).not.toThrow();
        });
    });

    describe('multiple sequential decryptions', () => {
        it('handles multiple files decrypted in sequence', async () => {
            vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
            vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValue(new ArrayBuffer(500));

            const mimeTypes = ['video/mp4', 'audio/mp3', 'image/png', 'application/pdf'];

            for (const mime of mimeTypes) {
                const buffer = createMockEncryptedData(512);
                const result = await decryptMedia(buffer, TEST_KEY_BYTES, TEST_IV, mime, 3);

                expect(result.blob.type).toBe(mime);
                expect(result.url).toMatch(/^blob:/);

                result.cleanup();
            }
        });
    });
});
