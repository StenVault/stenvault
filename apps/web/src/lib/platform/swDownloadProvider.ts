/**
 * Service Worker Download Provider (Tier 2)
 *
 * Client-side coordinator for streaming downloads via Service Worker.
 * Used as fallback when File System Access API is unavailable (Firefox/Safari ~18%).
 *
 * Flow:
 * 1. Register sw-download.js Service Worker
 * 2. Create MessageChannel, send port2 to SW with REGISTER_DOWNLOAD
 * 3. Navigate hidden iframe to /sw-download/{id} → triggers SW fetch → native download bar
 * 4. Pump decryptedStream chunks to port1 as Transferable ArrayBuffers
 * 5. Send 'END' on completion
 */

import type { StreamingDownloadOptions, StreamingDownloadResult } from '@cloudvault/shared/platform/download';

/** Check if Service Worker streaming is available */
export function isServiceWorkerStreamingAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof ReadableStream !== 'undefined' &&
    typeof MessageChannel !== 'undefined'
  );
}

let swRegistration: ServiceWorkerRegistration | null = null;

/** Register the download Service Worker (idempotent) */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (swRegistration?.active) return swRegistration;

  swRegistration = await navigator.serviceWorker.register('/sw-download.js', {
    scope: '/sw-download/',
  });

  // Wait for activation
  if (!swRegistration.active) {
    await new Promise<void>((resolve) => {
      const sw = swRegistration!.installing || swRegistration!.waiting;
      if (!sw) {
        resolve();
        return;
      }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve();
      });
      // Already active check
      if (swRegistration!.active) resolve();
    });
  }

  return swRegistration;
}

/** Generate a unique download ID */
function generateDownloadId(): string {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Stream a ReadableStream<Uint8Array> to disk via Service Worker.
 * The browser shows a native download bar.
 */
export async function streamViaServiceWorker(
  decryptedStream: ReadableStream<Uint8Array>,
  options: StreamingDownloadOptions,
): Promise<StreamingDownloadResult> {
  const reg = await ensureServiceWorker();
  const sw = reg.active;
  if (!sw) throw new Error('Service Worker not active');

  const downloadId = generateDownloadId();
  const channel = new MessageChannel();

  // Register the download with the SW
  sw.postMessage(
    {
      type: 'REGISTER_DOWNLOAD',
      downloadId,
      filename: options.filename,
      mimeType: options.mimeType || 'application/octet-stream',
      totalSize: options.totalSize,
      port: channel.port2,
    },
    [channel.port2],
  );

  // Small delay to let SW process the registration
  await new Promise((r) => setTimeout(r, 50));

  // Navigate hidden iframe to trigger download
  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.src = `/sw-download/${downloadId}`;
  document.body.appendChild(iframe);

  // Firefox keepalive: ping SW every 20s to prevent idle shutdown
  const keepaliveInterval = setInterval(() => {
    sw.postMessage({ type: 'KEEPALIVE' });
  }, 20_000);

  const reader = decryptedStream.getReader();
  let bytesWritten = 0;

  try {
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException('Download aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      // Transfer the ArrayBuffer to the SW (zero-copy)
      const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      channel.port1.postMessage(new Uint8Array(buffer), [buffer]);
      bytesWritten += value.byteLength;

      if (options.onProgress && options.totalSize) {
        options.onProgress({
          bytesWritten,
          totalBytes: options.totalSize,
          percentage: Math.round((bytesWritten / options.totalSize) * 100),
        });
      }
    }

    // Signal completion
    channel.port1.postMessage('END');
  } catch (err) {
    channel.port1.postMessage({ error: err instanceof Error ? err.message : 'Unknown error' });
    throw err;
  } finally {
    reader.releaseLock();
    clearInterval(keepaliveInterval);
    // Clean up iframe after a delay
    setTimeout(() => {
      iframe.remove();
    }, 5000);
  }

  return { tier: 'service-worker', bytesWritten };
}
