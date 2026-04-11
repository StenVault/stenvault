/**
 * Service Worker Stream Provider
 *
 * Client-side coordinator for streaming encrypted video/audio
 * via the sw-stream.js Service Worker.
 *
 * Unlike swDownloadProvider (which pumps chunks via MessagePort),
 * this provider sends the raw key + metadata to the SW, which
 * handles fetching + decryption independently. This enables
 * Range request support for video seeking.
 *
 * Flow:
 * 1. Register sw-stream.js Service Worker
 * 2. extractV4FileKeyWithMetadata() to get key + CVEF metadata
 * 3. REGISTER_STREAM message with key, metadata, R2 URL
 * 4. Return /sw-stream/{id} URL for <video src="...">
 * 5. SW handles fetch + decrypt on demand
 */

import type { CVEFMetadata } from '@stenvault/shared/platform/crypto';
import { base64ToArrayBuffer, isCVEFMetadataV1_4 } from '@stenvault/shared/platform/crypto';
import { debugLog } from '@/lib/debugLogger';

/** Check if Service Worker streaming is available */
export function isSwStreamAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof ReadableStream !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  );
}

let swRegistration: ServiceWorkerRegistration | null = null;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

/** Register the stream Service Worker (idempotent) */
async function ensureStreamServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (swRegistration?.active && navigator.serviceWorker.controller) {
    return swRegistration;
  }

  // Scope must be '/' so the SW intercepts subresource fetches (e.g. <video src="/sw-stream/...">)
  // from the main page. A narrower scope like '/sw-stream/' only controls navigations to that path,
  // not fetches made by pages at '/' or '/drive'.
  swRegistration = await navigator.serviceWorker.register('/sw-stream.js', {
    scope: '/',
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
      if (swRegistration!.active) resolve();
    });
  }

  // Wait for the SW to actually control this page (clients.claim() is async).
  // Without this, fetches from <video src="/sw-stream/..."> go to the network
  // instead of being intercepted by the SW.
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        resolve();
      }, { once: true });
      // Safety: if controller was set between the check and the listener
      if (navigator.serviceWorker.controller) resolve();
    });
  }

  // Firefox keepalive: ping SW every 20s to prevent idle shutdown
  if (!keepaliveInterval) {
    keepaliveInterval = setInterval(() => {
      swRegistration?.active?.postMessage({ type: 'KEEPALIVE' });
    }, 20_000);
  }

  debugLog('🎬', 'Stream SW ready');
  return swRegistration;
}

function generateStreamId(): string {
  return `vs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RegisterStreamOptions {
  /** Raw 32-byte file key (will be transferred, not copied) */
  fileKeyBytes: Uint8Array;
  /** CVEF metadata (contains iv, chunked info) */
  metadata: CVEFMetadata;
  /** Full header bytes (AAD for v1.4) */
  headerBytes: Uint8Array;
  /** Presigned R2 URL for the encrypted file */
  r2Url: string;
  /** Original plaintext file size in bytes */
  plaintextSize: number;
  /** MIME type for Content-Type header */
  mimeType: string;
}

export interface RegisteredStream {
  /** URL to use as <video src="..."> */
  streamUrl: string;
  /** Call to unregister the stream when done */
  unregister: () => void;
}

/**
 * Register a stream with the Service Worker.
 * Returns a URL that can be used as <video src="...">.
 */
export async function registerStream(
  options: RegisterStreamOptions,
): Promise<RegisteredStream> {
  const reg = await ensureStreamServiceWorker();
  const sw = reg.active;
  if (!sw) throw new Error('Stream Service Worker not active');

  const { fileKeyBytes, metadata, headerBytes, r2Url, plaintextSize, mimeType } = options;

  if (!metadata.chunked) {
    throw new Error('SW streaming requires chunked CVEF files');
  }

  const streamId = generateStreamId();
  const baseIv = new Uint8Array(base64ToArrayBuffer(metadata.iv));
  const chunkCount = metadata.chunked.count;
  const isV14 = isCVEFMetadataV1_4(metadata);

  // Copy key bytes into a transferable buffer, then zero the source immediately
  const rawKeyBuffer = fileKeyBytes.buffer.slice(
    fileKeyBytes.byteOffset,
    fileKeyBytes.byteOffset + fileKeyBytes.byteLength,
  );
  fileKeyBytes.fill(0);

  // Copy AAD (header bytes) for v1.4
  const aadBuffer = isV14
    ? headerBytes.buffer.slice(headerBytes.byteOffset, headerBytes.byteOffset + headerBytes.byteLength)
    : undefined;

  const transferables: Transferable[] = [rawKeyBuffer];
  if (aadBuffer) transferables.push(aadBuffer);

  // Use MessageChannel to wait for SW confirmation before returning.
  // Without this, the <video> element can fetch /sw-stream/{id} before
  // the SW has processed the REGISTER_STREAM message → 404.
  const { port1, port2 } = new MessageChannel();
  transferables.push(port2);

  const ack = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(); // non-blocking: old SW may not support ack, proceed anyway
    }, 5000);
    port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timeout);
      if (e.data?.ok) resolve();
      else reject(new Error(e.data?.error || 'SW stream registration failed'));
    };
  });

  try {
    sw.postMessage(
      {
        type: 'REGISTER_STREAM',
        streamId,
        rawKeyBytes: rawKeyBuffer,
        baseIv,
        headerSize: headerBytes.byteLength,
        chunkCount,
        plaintextSize,
        r2Url,
        mimeType,
        isV14,
        aad: aadBuffer,
      },
      transferables,
    );
  } catch (err) {
    // Zero the copy if transfer failed (buffer not neutered)
    new Uint8Array(rawKeyBuffer).fill(0);
    throw err;
  }

  // Wait for SW to confirm registration before returning the URL
  await ack;

  const streamUrl = `/sw-stream/${streamId}`;
  debugLog('🎬', 'Stream registered', { streamId });

  const unregister = () => {
    sw.postMessage({ type: 'UNREGISTER_STREAM', streamId });
  };

  return { streamUrl, unregister };
}

/**
 * Update the R2 presigned URL for an existing stream.
 * Called when the SW reports URL_EXPIRED (403 from R2).
 */
export async function updateStreamUrl(streamId: string, newR2Url: string): Promise<void> {
  const reg = await ensureStreamServiceWorker();
  const sw = reg.active;
  if (!sw) return;

  sw.postMessage({ type: 'UPDATE_URL', streamId, r2Url: newR2Url });
}

/** Extract the streamId from a stream URL (/sw-stream/{id}) */
export function getStreamIdFromUrl(streamUrl: string): string | null {
  const match = streamUrl.match(/\/sw-stream\/(.+)$/);
  return match?.[1] ?? null;
}
