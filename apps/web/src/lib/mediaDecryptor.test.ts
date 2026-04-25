/**
 * Unit Tests for Media Decryptor
 *
 * Tests the mediaDecryptor module using REAL WebCrypto (Node 20 native):
 * - Threshold-based worker selection
 * - Main thread fallback decryption with real AES-256-GCM
 * - Blob URL creation and cleanup
 * - Progress callback handling
 * - Version handling (V3 vs V4)
 * - Error scenarios (wrong key, tampered data, fetch failure)
 * - decryptMediaFromUrl with progress
 * - Worker termination safety
 *
 * @module mediaDecryptor.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import {
    decryptMedia,
    decryptMediaFromUrl,
    shouldUseWorker,
    getWorkerThreshold,
    terminateWorker,
    decryptInWorker,
} from './mediaDecryptor';

// ============ Real Crypto Helpers ============

/** Generate a real AES-256-GCM key and export raw bytes */
async function generateTestKeyMaterial(): Promise<{ keyBytes: Uint8Array; iv: Uint8Array }> {
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable so we can get raw bytes
        ['encrypt', 'decrypt']
    );
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return { keyBytes: rawKey, iv };
}

/** Encrypt test data with AES-256-GCM and return ciphertext + key material */
async function encryptTestData(plaintext: Uint8Array): Promise<{
    ciphertext: ArrayBuffer;
    keyBytes: Uint8Array;
    iv: Uint8Array;
}> {
    const { keyBytes, iv } = await generateTestKeyMaterial();
    const key = await crypto.subtle.importKey(
        'raw', keyBytes as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource);
    return { ciphertext, keyBytes, iv };
}

// ============ Mock Setup (DOM APIs only) ============

const mockBlobUrls: string[] = [];
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
    vi.clearAllMocks();
    mockBlobUrls.length = 0;

    URL.createObjectURL = vi.fn((blob: Blob) => {
        const url = `blob:mock-${Math.random().toString(36).slice(2)}`;
        mockBlobUrls.push(url);
        return url;
    });

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

// ============ Tests ============

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
            expect(shouldUseWorker(threshold)).toBe(false);
        });

        it('returns true for files over threshold (when Worker available)', () => {
            const threshold = getWorkerThreshold();
            if (typeof Worker !== 'undefined') {
                expect(shouldUseWorker(threshold + 1)).toBe(true);
                expect(shouldUseWorker(threshold * 2)).toBe(true);
            } else {
                expect(shouldUseWorker(threshold + 1)).toBe(false);
            }
        });
    });

    describe('getWorkerThreshold', () => {
        it('returns the threshold value (10MB)', () => {
            const threshold = getWorkerThreshold();
            expect(threshold).toBe(10 * 1024 * 1024);
        });
    });

    describe('decryptMedia - main thread with real AES-GCM', () => {
        it('decrypts small files and creates a Blob URL', async () => {
            const plaintext = new Uint8Array([10, 20, 30, 40, 50]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'video/mp4', 3);

            expect(result).toHaveProperty('blob');
            expect(result).toHaveProperty('url');
            expect(result).toHaveProperty('cleanup');
            expect(result.url).toMatch(/^blob:/);
            expect(typeof result.cleanup).toBe('function');

            // Verify decrypted content
            const decryptedBytes = new Uint8Array(await result.blob.arrayBuffer());
            expect(Array.from(decryptedBytes)).toEqual(Array.from(plaintext));
        });

        it('calls progress callback during decryption', async () => {
            const plaintext = new Uint8Array(1024);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);
            const progressCallback = vi.fn();

            await decryptMedia(
                ciphertext, keyBytes, iv, 'audio/mp3', 3,
                { onProgress: progressCallback }
            );

            expect(progressCallback).toHaveBeenCalled();

            const calls = progressCallback.mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(2);
            expect(calls[0]?.[0]?.percentage).toBeLessThan(50);
            expect(calls[calls.length - 1]?.[0]?.percentage).toBe(100);
        });

        it('revokes Blob URL when cleanup is called', async () => {
            const plaintext = new Uint8Array([1, 2, 3]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'image/png', 4);

            expect(mockBlobUrls).toContain(result.url);

            result.cleanup();

            expect(URL.revokeObjectURL).toHaveBeenCalledWith(result.url);
        });

        it('creates Blob with correct MIME type', async () => {
            const plaintext = new Uint8Array([1, 2, 3]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'video/webm', 3);

            expect(result.blob.type).toBe('video/webm');
        });

        it('throws error on decryption failure (wrong key)', async () => {
            const plaintext = new Uint8Array([1, 2, 3]);
            const { ciphertext, iv } = await encryptTestData(plaintext);
            const wrongKeyBytes = crypto.getRandomValues(new Uint8Array(32));

            await expect(
                decryptMedia(ciphertext, wrongKeyBytes, iv, 'video/mp4', 3)
            ).rejects.toThrow('File decryption failed: invalid key or corrupted data');
        });

        it('throws error on tampered ciphertext', async () => {
            const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            // Tamper with ciphertext
            const tampered = new Uint8Array(ciphertext);
            tampered[0] = tampered[0]! ^ 0xFF;

            await expect(
                decryptMedia(tampered.buffer as ArrayBuffer, keyBytes, iv, 'video/mp4', 3)
            ).rejects.toThrow('File decryption failed: invalid key or corrupted data');
        });

        it('throws error on invalid key length', async () => {
            const plaintext = new Uint8Array([1, 2, 3]);
            const { ciphertext, iv } = await encryptTestData(plaintext);
            const badKey = new Uint8Array(16); // 16 bytes instead of 32

            await expect(
                decryptMedia(ciphertext, badKey, iv, 'video/mp4', 3)
            ).rejects.toThrow();
        });
    });

    describe('decryptMedia - version handling', () => {
        it('accepts version 3 (Master Key HKDF)', async () => {
            const plaintext = new Uint8Array([42]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'video/mp4', 3);
            expect(result.blob).toBeDefined();
        });

        it('accepts version 4 (Hybrid PQC)', async () => {
            const plaintext = new Uint8Array([42]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'audio/mp3', 4);
            expect(result.blob).toBeDefined();
        });

        it('defaults to version 3 when not specified', async () => {
            const plaintext = new Uint8Array([42]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'video/mp4');
            expect(result.blob).toBeDefined();
        });
    });

    describe('decryptMedia - Blob size accuracy', () => {
        it('creates Blob with correct data size', async () => {
            const plaintext = new Uint8Array(2000);
            crypto.getRandomValues(plaintext);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'application/pdf', 3);

            expect(result.blob.size).toBe(2000);
        });
    });

    describe('decryptMedia - progress reporting', () => {
        it('reports bytesProcessed and totalBytes in progress', async () => {
            const plaintext = new Uint8Array(4000);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);
            const progressCallback = vi.fn();

            await decryptMedia(
                ciphertext, keyBytes, iv, 'video/mp4', 3,
                { onProgress: progressCallback }
            );

            for (const call of progressCallback.mock.calls) {
                const progress = call[0];
                expect(progress).toHaveProperty('percentage');
                expect(progress).toHaveProperty('bytesProcessed');
                expect(progress).toHaveProperty('totalBytes');
                expect(typeof progress.percentage).toBe('number');
            }

            // totalBytes should match the encrypted data size (plaintext + 16-byte auth tag)
            const firstCall = progressCallback.mock.calls[0]?.[0];
            expect(firstCall?.totalBytes).toBe(ciphertext.byteLength);
        });

        it('works without progress callback', async () => {
            const plaintext = new Uint8Array([1, 2, 3]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            const result = await decryptMedia(ciphertext, keyBytes, iv, 'video/mp4', 3);
            expect(result.blob).toBeDefined();
        });
    });

    describe('decryptMediaFromUrl', () => {
        it('fetches and decrypts data from URL', async () => {
            const plaintext = new Uint8Array([10, 20, 30]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(ciphertext),
            });

            const result = await decryptMediaFromUrl(
                'https://example.com/encrypted-video.enc',
                keyBytes, iv, 'video/mp4', 3
            );

            expect(fetch).toHaveBeenCalledWith('https://example.com/encrypted-video.enc');
            expect(result.url).toMatch(/^blob:/);

            // Verify decrypted content
            const decryptedBytes = new Uint8Array(await result.blob.arrayBuffer());
            expect(Array.from(decryptedBytes)).toEqual(Array.from(plaintext));
        });

        it('throws error on fetch failure', async () => {
            global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
            const { keyBytes, iv } = await generateTestKeyMaterial();

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/not-found.enc',
                    keyBytes, iv, 'video/mp4', 3
                )
            ).rejects.toThrow('Failed to fetch encrypted media: 404');
        });

        it('throws error on network failure', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const { keyBytes, iv } = await generateTestKeyMaterial();

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/file.enc',
                    keyBytes, iv, 'video/mp4', 3
                )
            ).rejects.toThrow('Network error');
        });

        it('reports initial fetching progress', async () => {
            const plaintext = new Uint8Array([1, 2, 3]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);
            const progressCallback = vi.fn();

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(ciphertext),
            });

            await decryptMediaFromUrl(
                'https://example.com/file.enc',
                keyBytes, iv, 'audio/mp3', 4,
                { onProgress: progressCallback }
            );

            expect(progressCallback.mock.calls[0]?.[0]?.percentage).toBe(0);
        });

        it('defaults to version 3 when not specified', async () => {
            const plaintext = new Uint8Array([42]);
            const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(ciphertext),
            });

            const result = await decryptMediaFromUrl(
                'https://example.com/file.enc',
                keyBytes, iv, 'video/mp4'
            );
            expect(result.blob).toBeDefined();
        });

        it('handles server error status codes', async () => {
            global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
            const { keyBytes, iv } = await generateTestKeyMaterial();

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/file.enc',
                    keyBytes, iv, 'video/mp4', 3
                )
            ).rejects.toThrow('Failed to fetch encrypted media: 500');
        });

        it('handles 403 forbidden (expired presigned URL)', async () => {
            global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
            const { keyBytes, iv } = await generateTestKeyMaterial();

            await expect(
                decryptMediaFromUrl(
                    'https://example.com/file.enc',
                    keyBytes, iv, 'video/mp4', 3
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
            const mimeTypes = ['video/mp4', 'audio/mp3', 'image/png', 'application/pdf'];

            for (const mime of mimeTypes) {
                const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
                const { ciphertext, keyBytes, iv } = await encryptTestData(plaintext);

                const result = await decryptMedia(ciphertext, keyBytes, iv, mime, 3);

                expect(result.blob.type).toBe(mime);
                expect(result.url).toMatch(/^blob:/);

                // Verify content
                const decryptedBytes = new Uint8Array(await result.blob.arrayBuffer());
                expect(Array.from(decryptedBytes)).toEqual(Array.from(plaintext));

                result.cleanup();
            }
        });
    });

    // Worker-error contract. Uses a MockWorker stub so we can drive every
    // failure path deterministically; real decryption is exercised above.
    describe('worker error contract', () => {
        class MockWorker {
            public onmessage: ((e: MessageEvent) => void) | null = null;
            public onerror: ((e: ErrorEvent) => void) | null = null;
            public readonly posted: Array<Record<string, unknown>> = [];
            public listeners: { message: Array<(e: MessageEvent) => void>; error: Array<(e: ErrorEvent) => void> } = { message: [], error: [] };

            postMessage(msg: Record<string, unknown>, _transfer?: unknown): void {
                this.posted.push(msg);
            }

            addEventListener(type: 'message' | 'error', handler: (e: Event) => void): void {
                if (type === 'message') this.listeners.message.push(handler as (e: MessageEvent) => void);
                if (type === 'error') this.listeners.error.push(handler as (e: ErrorEvent) => void);
            }

            removeEventListener(type: 'message' | 'error', handler: (e: Event) => void): void {
                if (type === 'message') this.listeners.message = this.listeners.message.filter(h => h !== handler);
                if (type === 'error') this.listeners.error = this.listeners.error.filter(h => h !== handler);
            }

            terminate(): void {
                // no-op
            }

            respond(payload: object): void {
                const ev = new MessageEvent('message', { data: payload });
                for (const h of this.listeners.message) h(ev);
            }

            fireError(message = 'boom'): void {
                const ev = new ErrorEvent('error', { message });
                for (const h of this.listeners.error) h(ev);
            }

            lastPostedId(): string {
                const last = this.posted[this.posted.length - 1];
                if (!last) throw new Error('no message posted');
                return last.id as string;
            }
        }

        let lastWorker: MockWorker;

        beforeEach(() => {
            terminateWorker();
            vi.stubGlobal('Worker', class {
                constructor() {
                    lastWorker = new MockWorker();
                    return lastWorker as unknown as Worker;
                }
            });
        });

        afterEach(() => {
            terminateWorker();
            vi.unstubAllGlobals();
            vi.useRealTimers();
        });

        it('rejects VaultError(INFRA_WORKER_FAILED) when the Worker constructor throws', async () => {
            vi.stubGlobal('Worker', class {
                constructor() {
                    throw new Error('CSP blocked Worker construction');
                }
            });

            const pending = decryptInWorker(new ArrayBuffer(8), 'a', 'b', 4);
            const err = await pending.catch((e: unknown) => e);

            expect(VaultError.isVaultError(err)).toBe(true);
            expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
            expect((err as VaultError).context.op).toBe('media_decrypt');
            expect((err as VaultError).context.reason).toBe('unavailable');
        });

        it('rejects VaultError(INFRA_WORKER_FAILED) on worker-reported error', async () => {
            const pending = decryptInWorker(new ArrayBuffer(8), 'a', 'b', 4);
            await Promise.resolve();

            const id = lastWorker.lastPostedId();
            lastWorker.respond({ type: 'error', id, error: 'invalid aes key' });

            const err = await pending.catch((e: unknown) => e);
            expect(VaultError.isVaultError(err)).toBe(true);
            expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
            expect((err as VaultError).context.source).toBe('worker_response');
            expect((err as VaultError).context.workerMessage).toBe('invalid aes key');
        });

        it('rejects VaultError(INFRA_WORKER_FAILED) with cause on worker.onerror crash', async () => {
            const pending = decryptInWorker(new ArrayBuffer(8), 'a', 'b', 4);
            await Promise.resolve();

            lastWorker.fireError('oom');

            const err = await pending.catch((e: unknown) => e);
            expect(VaultError.isVaultError(err)).toBe(true);
            expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
            expect((err as VaultError).context.source).toBe('onerror');
            expect((err as VaultError).context.workerMessage).toBe('oom');
            expect((err as VaultError).cause).toBeInstanceOf(ErrorEvent);
        });

        it('rejects VaultError(INFRA_TIMEOUT) when the 5-minute timeout elapses', async () => {
            vi.useFakeTimers();

            const pending = decryptInWorker(new ArrayBuffer(8), 'a', 'b', 4);
            vi.advanceTimersByTime(5 * 60 * 1000 + 1);

            const err = await pending.catch((e: unknown) => e);
            expect(VaultError.isVaultError(err)).toBe(true);
            expect((err as VaultError).code).toBe('INFRA_TIMEOUT');
            expect((err as VaultError).context.op).toBe('media_decrypt');
            expect((err as VaultError).context.ms).toBe(5 * 60 * 1000);
        });
    });
});
