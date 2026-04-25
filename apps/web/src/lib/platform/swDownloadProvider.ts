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

import type { StreamingDownloadOptions, StreamingDownloadResult } from '@stenvault/shared/platform/download';
import { VaultError } from '@stenvault/shared/errors';

/** Check if Service Worker streaming is available */
export function isServiceWorkerStreamingAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof ReadableStream !== 'undefined' &&
    typeof MessageChannel !== 'undefined'
  );
}

/**
 * Register the download Service Worker and wait until it's active.
 *
 * We intentionally do NOT await `navigator.serviceWorker.ready` — that
 * resolves only when a SW *controls the current page*, which requires the
 * registration's scope to cover the page URL. This SW is registered with
 * scope `/sw-download/` by design (so it only handles the iframe fetch
 * path), which never covers `/receive/…`, so `ready` hangs forever in
 * Firefox. Waiting for `reg.active` is sufficient: the SW only needs to
 * be alive to respond to REGISTER_DOWNLOAD postMessages and to the
 * iframe's `/sw-download/{id}` fetch. Page control is irrelevant.
 */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw-download.js', {
    scope: '/sw-download/',
    updateViaCache: 'none',
  });

  if (!reg.active) {
    const candidate = reg.installing || reg.waiting;
    if (candidate) {
      await new Promise<void>((resolve) => {
        if (candidate.state === 'activated') { resolve(); return; }
        candidate.addEventListener('statechange', () => {
          if (candidate.state === 'activated') resolve();
        });
      });
    }
  }
  return reg;
}

/**
 * Poke the SW to reset its idle timer. `postMessage` wakes a dormant SW; if
 * the reference is gone (SW was replaced), a scope-path fetch forces the
 * browser to revive it through the normal lifecycle.
 */
function wakeUp(sw: ServiceWorker): void {
  try {
    sw.postMessage({ type: 'ping' });
  } catch {
    void fetch('/sw-download/ping').catch(() => {});
  }
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
  if (!sw) throw new VaultError('INFRA_SW_UNAVAILABLE', { op: 'download_stream' });

  const downloadId = generateDownloadId();
  const channel = new MessageChannel();

  // Keepalive MUST start before the ACK wait so the SW can't go idle during
  // the REGISTERED → iframe-fetch window (the race that causes the 404). 10s
  // is the Proton Drive default — safely under Chrome's ~30s idle timeout.
  const keepaliveInterval = setInterval(() => wakeUp(sw), 10_000);

  // Backpressure budget. SW acks each chunk AFTER the browser's fetch pump
  // has pulled it, so the number of unacked chunks bounds memory at both
  // ends. 4 × ~16 MiB ≈ 64 MiB is a comfortable ceiling for a cold SW
  // (Firefox kills SWs that balloon past a few hundred MiB mid-stream —
  // see StreamSaver.js #366). Without this, a multi-GB zip-all download
  // terminates the SW before `posting-END`, leaving a truncated file.
  const MAX_INFLIGHT = 4;
  let inflight = 0;
  let drainResolve: (() => void) | null = null;
  let fatalSwError: Error | null = null;
  let drainReject: ((err: Error) => void) | null = null;

  let bytesWritten = 0;
  let iframe: HTMLIFrameElement | null = null;

  try {
    // Register the download with the SW and wait for ACK before navigating.
    // A fixed delay (the old 50ms setTimeout) is a race condition: Firefox may
    // not process the postMessage before the iframe fetch fires → 404.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new VaultError('INFRA_TIMEOUT', { op: 'sw_register_download', ms: 1000 })),
        1000,
      );

      channel.port1.onmessage = (e) => {
        if (e.data?.type === 'REGISTERED') {
          clearTimeout(timeout);
          resolve();
          // Swap handler to the backpressure/cancel listener for the
          // rest of the stream. Assigning a new handler replaces the
          // registration listener without a `null` gap.
          channel.port1.onmessage = (ev) => {
            const d = ev.data;
            if (d?.type === 'ACK') {
              inflight--;
              if (drainResolve && inflight < MAX_INFLIGHT) {
                const r = drainResolve;
                drainResolve = null;
                r();
              }
            } else if (d?.type === 'CANCEL') {
              // Browser aborted the download (user cancelled, tab
              // closed, etc). Surface as an error so the pump loop
              // stops instead of posting into the void.
              fatalSwError = new DOMException('Download cancelled by browser', 'AbortError');
              if (drainReject) {
                const rj = drainReject;
                drainReject = null;
                rj(fatalSwError);
              }
            }
          };
        }
      };

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
    });

    iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.src = `/sw-download/${downloadId}`;
    document.body.appendChild(iframe);

    const reader = decryptedStream.getReader();
    try {
      while (true) {
        if (options.signal?.aborted) {
          throw new DOMException('Download aborted', 'AbortError');
        }
        if (fatalSwError) throw fatalSwError;

        const { done, value } = await reader.read();
        if (done) break;

        // Wait if the SW hasn't drained enough of what we've already
        // posted. `inflight` reflects chunks enqueued-but-not-yet-pulled
        // by the browser — the real memory ceiling.
        if (inflight >= MAX_INFLIGHT) {
          await new Promise<void>((resolve, reject) => {
            drainResolve = resolve;
            drainReject = reject;
          });
        }

        const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        channel.port1.postMessage(new Uint8Array(buffer), [buffer]);
        inflight++;
        bytesWritten += value.byteLength;

        if (options.onProgress && options.totalSize) {
          options.onProgress({
            bytesWritten,
            totalBytes: options.totalSize,
            percentage: Math.round((bytesWritten / options.totalSize) * 100),
          });
        }
      }

      // Drain remaining ACKs before END so we don't race END ahead of
      // in-queue chunks the SW still has to pull. The SW's END handler
      // gates on the local queue being empty, but draining here keeps
      // the invariant "END is posted only after all chunks have been
      // pulled" explicit rather than implicit.
      while (inflight > 0) {
        if (fatalSwError) throw fatalSwError;
        await new Promise<void>((resolve, reject) => {
          drainResolve = resolve;
          drainReject = reject;
        });
      }

      channel.port1.postMessage('END');
    } catch (err) {
      channel.port1.postMessage({ error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearInterval(keepaliveInterval);
    if (iframe) {
      const el = iframe;
      setTimeout(() => el.remove(), 5000);
    }
  }

  return { tier: 'service-worker', bytesWritten };
}
