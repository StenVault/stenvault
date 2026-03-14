/**
 * Streaming Download Tests
 *
 * Tests tiered streaming download:
 * - detectStreamingTier (FSA → SW → blob-fallback)
 * - fallbackBlobDownload (Tier 3): stream → Blob → anchor click
 * - Progress tracking
 * - Abort signal handling
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock tier detection dependencies
vi.mock('./fileSystemAccessProvider', () => ({
    isFileSystemAccessAvailable: vi.fn(() => false),
    streamToFileSystem: vi.fn(),
}));

vi.mock('./swDownloadProvider', () => ({
    isServiceWorkerStreamingAvailable: vi.fn(() => false),
    streamViaServiceWorker: vi.fn(),
}));

import { detectStreamingTier, fallbackBlobDownload, streamDownloadToDisk } from './streamingDownload';
import { isFileSystemAccessAvailable, streamToFileSystem } from './fileSystemAccessProvider';
import { isServiceWorkerStreamingAvailable, streamViaServiceWorker } from './swDownloadProvider';


function createReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(chunks[index++]);
            } else {
                controller.close();
            }
        },
    });
}

describe('Streaming Download', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });


    describe('detectStreamingTier', () => {
        it('should return blob-fallback when nothing available', () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(false);
            vi.mocked(isServiceWorkerStreamingAvailable).mockReturnValue(false);
            expect(detectStreamingTier()).toBe('blob-fallback');
        });

        it('should prefer file-system-access when available', () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(true);
            vi.mocked(isServiceWorkerStreamingAvailable).mockReturnValue(true);
            expect(detectStreamingTier()).toBe('file-system-access');
        });

        it('should fall back to service-worker when FSA unavailable', () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(false);
            vi.mocked(isServiceWorkerStreamingAvailable).mockReturnValue(true);
            expect(detectStreamingTier()).toBe('service-worker');
        });
    });


    describe('fallbackBlobDownload', () => {
        it('should collect chunks into Blob and trigger download', async () => {
            const clickSpy = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue({
                set href(v: string) { /* noop */ },
                set download(v: string) { /* noop */ },
                click: clickSpy,
            } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
            vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

            const chunks = [
                new TextEncoder().encode('chunk1'),
                new TextEncoder().encode('chunk2'),
            ];
            const stream = createReadableStream(chunks);

            const result = await fallbackBlobDownload(stream, {
                filename: 'test.bin',
            });

            expect(result.tier).toBe('blob-fallback');
            expect(result.bytesWritten).toBe(12); // 6 + 6
            expect(clickSpy).toHaveBeenCalled();
        });

        it('should report progress', async () => {
            vi.spyOn(document, 'createElement').mockReturnValue({
                set href(v: string) { /* noop */ },
                set download(v: string) { /* noop */ },
                click: vi.fn(),
            } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
            vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

            const onProgress = vi.fn();
            const chunks = [
                new Uint8Array(50),
                new Uint8Array(50),
            ];
            const stream = createReadableStream(chunks);

            await fallbackBlobDownload(stream, {
                filename: 'prog.bin',
                totalSize: 100,
                onProgress,
            });

            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(onProgress).toHaveBeenCalledWith({
                bytesWritten: 50,
                totalBytes: 100,
                percentage: 50,
            });
            expect(onProgress).toHaveBeenCalledWith({
                bytesWritten: 100,
                totalBytes: 100,
                percentage: 100,
            });
        });

        it('should throw on abort signal', async () => {
            const controller = new AbortController();
            controller.abort();

            const stream = createReadableStream([new Uint8Array(10)]);

            await expect(
                fallbackBlobDownload(stream, {
                    filename: 'aborted.bin',
                    signal: controller.signal,
                })
            ).rejects.toThrow('Download aborted');
        });
    });


    describe('streamDownloadToDisk', () => {
        it('should use FSA when available', async () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(true);
            vi.mocked(streamToFileSystem).mockResolvedValue({
                tier: 'file-system-access',
                bytesWritten: 100,
            });

            const stream = createReadableStream([new Uint8Array(100)]);
            const result = await streamDownloadToDisk(stream, { filename: 'test.bin' });

            expect(result.tier).toBe('file-system-access');
            expect(streamToFileSystem).toHaveBeenCalled();
        });

        it('should fall back to SW when FSA fails', async () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(true);
            vi.mocked(streamToFileSystem).mockRejectedValue(new Error('User cancelled'));
            vi.mocked(isServiceWorkerStreamingAvailable).mockReturnValue(true);
            vi.mocked(streamViaServiceWorker).mockResolvedValue({
                tier: 'service-worker',
                bytesWritten: 100,
            });

            const stream = createReadableStream([new Uint8Array(100)]);
            const result = await streamDownloadToDisk(stream, { filename: 'test.bin' });

            expect(result.tier).toBe('service-worker');
        });

        it('should propagate AbortError from FSA (no fallback)', async () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(true);
            vi.mocked(streamToFileSystem).mockRejectedValue(
                new DOMException('Download aborted', 'AbortError')
            );

            const stream = createReadableStream([new Uint8Array(10)]);
            await expect(
                streamDownloadToDisk(stream, { filename: 'abort.bin' })
            ).rejects.toThrow('Download aborted');
        });

        it('should fall back to blob when both FSA and SW unavailable', async () => {
            vi.mocked(isFileSystemAccessAvailable).mockReturnValue(false);
            vi.mocked(isServiceWorkerStreamingAvailable).mockReturnValue(false);

            vi.spyOn(document, 'createElement').mockReturnValue({
                set href(v: string) { /* noop */ },
                set download(v: string) { /* noop */ },
                click: vi.fn(),
            } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
            vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

            const stream = createReadableStream([new TextEncoder().encode('blob data')]);
            const result = await streamDownloadToDisk(stream, { filename: 'blob.bin' });

            expect(result.tier).toBe('blob-fallback');
        });
    });
});
