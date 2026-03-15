/**
 * Web Download Provider Tests
 *
 * Tests browser download functionality:
 * - downloadBlob: Blob → createObjectURL → anchor click
 * - downloadBase64: base64 decode → Blob → download
 * - isAvailable check
 * - Error handling
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDownloadProvider, WebDownloadProvider } from './webDownloadProvider';

describe('WebDownloadProvider', () => {
    let provider: InstanceType<typeof WebDownloadProvider>;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    provider = new WebDownloadProvider();

    // ============ isAvailable ============

    describe('isAvailable', () => {
        it('should return true in jsdom (document and URL exist)', () => {
            expect(provider.isAvailable()).toBe(true);
        });
    });

    // ============ downloadBlob ============

    describe('downloadBlob', () => {
        it('should create object URL and trigger download', async () => {
            const clickSpy = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue({
                set href(v: string) { /* noop */ },
                set download(v: string) { /* noop */ },
                click: clickSpy,
            } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
            vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

            const blob = new Blob(['test content'], { type: 'text/plain' });
            const result = await provider.downloadBlob(blob, { filename: 'test.txt' });

            expect(result.success).toBe(true);
            expect(clickSpy).toHaveBeenCalled();
        });

        it('should return error result on failure', async () => {
            vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
                throw new Error('createObjectURL failed');
            });

            const blob = new Blob(['data']);
            const result = await provider.downloadBlob(blob, { filename: 'file.bin' });

            expect(result.success).toBe(false);
            expect((result as any).error).toBe('createObjectURL failed');
        });
    });

    // ============ downloadBase64 ============

    describe('downloadBase64', () => {
        it('should decode base64 and download', async () => {
            const clickSpy = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue({
                set href(v: string) { /* noop */ },
                set download(v: string) { /* noop */ },
                click: clickSpy,
            } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
            vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

            const b64 = btoa('Hello, World!');
            const result = await provider.downloadBase64(b64, {
                filename: 'hello.txt',
                mimeType: 'text/plain',
            });

            expect(result.success).toBe(true);
            expect(clickSpy).toHaveBeenCalled();
        });

        it('should return error for invalid base64', async () => {
            const result = await provider.downloadBase64('!!!not-base64!!!', {
                filename: 'bad.txt',
            });

            expect(result.success).toBe(false);
            expect((result as any).error).toBeDefined();
        });
    });

    // ============ downloadUrl ============

    describe('downloadUrl', () => {
        it('should fetch URL and download blob', async () => {
            const clickSpy = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue({
                set href(v: string) { /* noop */ },
                set download(v: string) { /* noop */ },
                click: clickSpy,
            } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
            vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                blob: async () => new Blob(['fetched content']),
            } as Response);

            const result = await provider.downloadUrl('https://example.com/file.bin', {
                filename: 'downloaded.bin',
            });

            expect(result.success).toBe(true);
        });

        it('should return error on HTTP failure', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            const result = await provider.downloadUrl('https://example.com/missing', {
                filename: 'missing.bin',
            });

            expect(result.success).toBe(false);
            expect((result as any).error).toBe('HTTP error: 404');
        });

        it('should return error on network failure', async () => {
            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

            const result = await provider.downloadUrl('https://example.com/down', {
                filename: 'down.bin',
            });

            expect(result.success).toBe(false);
            expect((result as any).error).toBe('Network error');
        });
    });

    // ============ createDownloadProvider ============

    describe('createDownloadProvider', () => {
        it('should return a provider instance', () => {
            const p = createDownloadProvider();
            expect(p.isAvailable()).toBe(true);
        });
    });
});
