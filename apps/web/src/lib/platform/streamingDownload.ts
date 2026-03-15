/**
 * Unified Streaming Download
 *
 * Tiered approach for streaming decrypted data to disk:
 * - Tier 1: File System Access API (Chrome/Edge, ~78%)
 * - Tier 2: Service Worker streaming (Firefox/Safari, ~18%)
 * - Tier 3: Blob fallback (all browsers, accumulates in RAM)
 */

import type {
  StreamingDownloadOptions,
  StreamingDownloadResult,
  StreamingTier,
} from '@stenvault/shared/platform/download';
import { isFileSystemAccessAvailable, streamToFileSystem } from './fileSystemAccessProvider';
import { isServiceWorkerStreamingAvailable, streamViaServiceWorker } from './swDownloadProvider';

/** Detect the best available streaming tier */
export function detectStreamingTier(): StreamingTier {
  if (isFileSystemAccessAvailable()) return 'file-system-access';
  if (isServiceWorkerStreamingAvailable()) return 'service-worker';
  return 'blob-fallback';
}

/**
 * Tier 3 fallback: collect stream into a Blob and trigger anchor-click download.
 * This is the current behavior wrapped in the streaming interface.
 */
export async function fallbackBlobDownload(
  stream: ReadableStream<Uint8Array>,
  options: StreamingDownloadOptions,
): Promise<StreamingDownloadResult> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytesWritten = 0;

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException('Download aborted', 'AbortError');
    }

    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    bytesWritten += value.byteLength;

    if (options.onProgress && options.totalSize) {
      options.onProgress({
        bytesWritten,
        totalBytes: options.totalSize,
        percentage: Math.round((bytesWritten / options.totalSize) * 100),
      });
    }
  }

  // Uint8Array is a valid BlobPart — no need to copy into separate ArrayBuffers
  const blob = new Blob(chunks as BlobPart[], { type: options.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { tier: 'blob-fallback', bytesWritten };
}

/**
 * Stream decrypted data to disk using the best available tier.
 *
 * Tries Tier 1 (File System Access) → Tier 2 (Service Worker) → Tier 3 (Blob).
 * AbortError is never caught (propagates immediately).
 */
export async function streamDownloadToDisk(
  decryptedStream: ReadableStream<Uint8Array>,
  options: StreamingDownloadOptions,
): Promise<StreamingDownloadResult> {
  // Tier 1: File System Access API
  if (isFileSystemAccessAvailable()) {
    try {
      return await streamToFileSystem(decryptedStream, options);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) throw err;
      // User cancelled the save dialog or other non-fatal error — fall through
      console.warn('[StreamingDownload] File System Access failed, falling back:', err);
    }
  }

  // Tier 2: Service Worker
  if (isServiceWorkerStreamingAvailable()) {
    try {
      return await streamViaServiceWorker(decryptedStream, options);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) throw err;
      console.warn('[StreamingDownload] Service Worker failed, falling back:', err);
    }
  }

  // Tier 3: Blob fallback
  return fallbackBlobDownload(decryptedStream, options);
}
