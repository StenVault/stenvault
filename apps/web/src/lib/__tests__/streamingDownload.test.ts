/**
 * Streaming Download Tests
 *
 * Tests the tiered streaming download infrastructure:
 * - Tier detection
 * - Blob fallback
 * - Progress callbacks
 * - Abort signal handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectStreamingTier,
  fallbackBlobDownload,
} from '../platform/streamingDownload';
import { isFileSystemAccessAvailable } from '../platform/fileSystemAccessProvider';
import { isServiceWorkerStreamingAvailable } from '../platform/swDownloadProvider';


function createTestStream(data: Uint8Array): ReadableStream<Uint8Array> {
  const chunkSize = 1024;
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, data.byteLength);
      controller.enqueue(data.slice(offset, end));
      offset = end;
    },
  });
}


describe('detectStreamingTier', () => {
  it('returns blob-fallback in test environment (no showSaveFilePicker or SW)', () => {
    // Node test environment has neither API
    const tier = detectStreamingTier();
    // In Node, both APIs are unavailable → should be blob-fallback
    expect(tier).toBe('blob-fallback');
  });
});

describe('isFileSystemAccessAvailable', () => {
  it('returns false when showSaveFilePicker is not available', () => {
    expect(isFileSystemAccessAvailable()).toBe(false);
  });
});

describe('isServiceWorkerStreamingAvailable', () => {
  it('returns false in Node test environment', () => {
    expect(isServiceWorkerStreamingAvailable()).toBe(false);
  });
});


describe('fallbackBlobDownload', () => {
  let origCreateObjectURL: typeof URL.createObjectURL;
  let origRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    origCreateObjectURL = URL.createObjectURL;
    origRevokeObjectURL = URL.revokeObjectURL;
    (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    (URL as any).createObjectURL = origCreateObjectURL;
    (URL as any).revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('collects stream, creates Blob, and triggers anchor-click download', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const stream = createTestStream(data);

    let clickCalled = false;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = () => { clickCalled = true; };
      }
      return el;
    });

    const result = await fallbackBlobDownload(stream, {
      filename: 'test.bin',
      mimeType: 'application/octet-stream',
    });

    expect(result.tier).toBe('blob-fallback');
    expect(result.bytesWritten).toBe(5);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(clickCalled).toBe(true);
  });

  it('fires progress callback with correct bytesWritten', async () => {
    const data = new Uint8Array(5000); // Multiple 1KB chunks
    crypto.getRandomValues(data);
    const stream = createTestStream(data);

    const progressCalls: Array<{ bytesWritten: number; percentage: number }> = [];

    await fallbackBlobDownload(stream, {
      filename: 'test.bin',
      totalSize: 5000,
      onProgress: (p) => progressCalls.push({ bytesWritten: p.bytesWritten, percentage: p.percentage }),
    });

    expect(progressCalls.length).toBeGreaterThan(0);

    // Last progress call should have all bytes
    const last = progressCalls[progressCalls.length - 1]!;
    expect(last.bytesWritten).toBe(5000);
    expect(last.percentage).toBe(100);
  });

  it('aborts when signal is triggered', async () => {
    const data = new Uint8Array(10000);
    crypto.getRandomValues(data);

    const controller = new AbortController();
    // Abort after a tiny delay
    setTimeout(() => controller.abort(), 10);

    const stream = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        // Slow stream - yields one byte at a time with delay
        await new Promise((r) => setTimeout(r, 5));
        ctrl.enqueue(new Uint8Array([1]));
      },
    });

    await expect(
      fallbackBlobDownload(stream, {
        filename: 'test.bin',
        signal: controller.signal,
      }),
    ).rejects.toThrow('Download aborted');
  });
});
