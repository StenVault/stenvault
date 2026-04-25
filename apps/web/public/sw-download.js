/**
 * Download Service Worker
 *
 * Intercepts /sw-download/{id} URLs to stream decrypted data
 * to the browser's native download bar. Follows the Proton Drive pattern.
 *
 * Flow:
 * 1. Client registers a download via postMessage(REGISTER_DOWNLOAD)
 * 2. Client navigates a hidden iframe to /sw-download/{id}
 * 3. SW fetch handler responds with a pull-based ReadableStream
 * 4. Browser downloads the stream natively (shows download bar)
 *
 * Backpressure: the stream is pull-based — incoming chunks land in a
 * local FIFO and are only enqueued when the browser pulls. After each
 * pull-driven enqueue we post an ACK back to the client so it can send
 * the next chunk. This bounds SW memory to ~N * chunkSize regardless
 * of total download size; without it, multi-GB downloads on Firefox
 * terminate the SW under memory pressure (documented in StreamSaver.js
 * #366 — partial download ~30s in, SW stopped at the same time).
 */

// @ts-nocheck
/* eslint-disable no-restricted-globals */

const pendingDownloads = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const { type, downloadId, filename, mimeType, totalSize, port } = event.data || {};

  // Keepalive ping: wakes the SW without side effects. Paired with the
  // /sw-download/ping fetch path — together they prevent Map loss when
  // the browser terminates an idle SW between register and fetch.
  if (type === 'ping') return;

  if (type === 'REGISTER_DOWNLOAD' && downloadId && port) {
    // Local FIFO of chunks received from the client that haven't yet
    // been consumed by the browser's fetch pump. Bounded by the client's
    // inflight limit (MAX_INFLIGHT in swDownloadProvider.ts).
    const localQueue = [];
    let ended = false;
    let errorMsg = null;
    // When pull() fires and localQueue is empty, we park a resolver here
    // so the onmessage handler can wake the pull the moment a chunk
    // arrives (or END is signalled).
    let pullWaiter = null;

    const stream = new ReadableStream({
      pull(controller) {
        return new Promise((resolve) => {
          const tryDeliver = () => {
            if (localQueue.length > 0) {
              controller.enqueue(localQueue.shift());
              // ACK signals the client that one backpressure slot is
              // free. We ACK from inside pull (not from onmessage) so
              // the slot only opens when the browser has actually
              // demanded the chunk — real backpressure propagation.
              try {
                port.postMessage({ type: 'ACK' });
              } catch {
                // Port disconnected — ignore; browser likely cancelled.
              }
              resolve();
              return;
            }
            if (errorMsg !== null) {
              controller.error(new Error(errorMsg));
              resolve();
              return;
            }
            if (ended) {
              controller.close();
              resolve();
              return;
            }
            pullWaiter = tryDeliver;
          };
          tryDeliver();
        });
      },
      cancel() {
        try { port.postMessage({ type: 'CANCEL' }); } catch {}
        pendingDownloads.delete(downloadId);
      },
    });

    port.onmessage = (e) => {
      const msg = e.data;
      if (msg === 'END') {
        ended = true;
        if (pullWaiter) {
          const fn = pullWaiter;
          pullWaiter = null;
          fn();
        }
      } else if (msg && msg.error) {
        errorMsg = msg.error;
        if (pullWaiter) {
          const fn = pullWaiter;
          pullWaiter = null;
          fn();
        }
      } else if (msg instanceof Uint8Array || msg instanceof ArrayBuffer) {
        const chunk = msg instanceof ArrayBuffer ? new Uint8Array(msg) : msg;
        localQueue.push(chunk);
        if (pullWaiter) {
          const fn = pullWaiter;
          pullWaiter = null;
          fn();
        }
      }
    };

    pendingDownloads.set(downloadId, { stream, filename, mimeType, totalSize });

    // ACK back so the client knows it's safe to navigate the iframe
    port.postMessage({ type: 'REGISTERED' });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Fallback wake-up endpoint: when the client has no controller reference,
  // a plain fetch revives the SW through the normal lifecycle.
  if (url.pathname === '/sw-download/ping') {
    event.respondWith(
      new Response('pong', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    return;
  }

  const match = url.pathname.match(/^\/sw-download\/(.+)$/);
  if (!match) return;

  const downloadId = match[1];
  const entry = pendingDownloads.get(downloadId);
  if (!entry) {
    event.respondWith(new Response('Download not found', { status: 404 }));
    return;
  }

  const headers = new Headers({
    'Content-Type': entry.mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(entry.filename || 'download')}"`,
  });

  if (entry.totalSize) {
    headers.set('Content-Length', String(entry.totalSize));
  }

  event.respondWith(new Response(entry.stream, { headers }));
});
