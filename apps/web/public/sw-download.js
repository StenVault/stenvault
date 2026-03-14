/**
 * Download Service Worker
 *
 * Intercepts /sw-download/{id} URLs to stream decrypted data
 * to the browser's native download bar. Follows the Proton Drive pattern.
 *
 * Flow:
 * 1. Client registers a download via postMessage(REGISTER_DOWNLOAD)
 * 2. Client navigates a hidden iframe to /sw-download/{id}
 * 3. SW fetch handler responds with the registered ReadableStream
 * 4. Browser downloads the stream natively (shows download bar)
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

  if (type === 'REGISTER_DOWNLOAD' && downloadId && port) {
    // Create a ReadableStream that reads from the MessagePort
    const stream = new ReadableStream({
      start(controller) {
        port.onmessage = (e) => {
          const msg = e.data;
          if (msg === 'END') {
            controller.close();
            pendingDownloads.delete(downloadId);
          } else if (msg && msg.error) {
            controller.error(new Error(msg.error));
            pendingDownloads.delete(downloadId);
          } else if (msg instanceof Uint8Array || msg instanceof ArrayBuffer) {
            const chunk = msg instanceof ArrayBuffer ? new Uint8Array(msg) : msg;
            controller.enqueue(chunk);
          }
        };
      },
      cancel() {
        port.postMessage({ type: 'CANCEL' });
        pendingDownloads.delete(downloadId);
      },
    });

    pendingDownloads.set(downloadId, { stream, filename, mimeType, totalSize });
  }

  // Keepalive pings (reset Firefox idle timer) - no handler needed
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
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
