/**
 * Video Streaming Service Worker
 *
 * Intercepts /sw-stream/{id} URLs to serve decrypted video/audio
 * directly to <video>/<audio> elements via ReadableStream.
 *
 * Unlike sw-download.js (which receives chunks via MessagePort),
 * this SW does its own decryption: it receives the raw file key +
 * metadata from the main thread, then fetches + decrypts encrypted
 * chunks from R2 on demand. This is necessary because <video>
 * elements issue Range requests for seeking, which require
 * independent chunk access.
 *
 * Flow:
 * 1. Main thread: REGISTER_STREAM with key, metadata, R2 URL
 * 2. <video src="/sw-stream/{id}"> triggers fetch
 * 3. SW: fetch encrypted chunks from R2, decrypt, stream to video
 * 4. Range requests: calculate chunk offsets, fetch + decrypt subset
 */

// @ts-nocheck
/* eslint-disable no-restricted-globals */

// ============ Constants ============

const PLAINTEXT_CHUNK_SIZE = 65536; // 64KB
const GCM_TAG_SIZE = 16;
const LENGTH_PREFIX_SIZE = 4;
const ENCRYPTED_FRAME_SIZE = LENGTH_PREFIX_SIZE + PLAINTEXT_CHUNK_SIZE + GCM_TAG_SIZE; // 65556
const STREAM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const DERIVE_IV_BASE_LENGTH = 8;
const GCM_IV_LENGTH = 12;

// Dev-only logging — silent in production
const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
function log(/** @type {any[]} */ ...args) { if (IS_DEV) console.log('[sw-stream]', ...args); }
function warn(/** @type {any[]} */ ...args) { if (IS_DEV) console.warn('[sw-stream]', ...args); }
function error(/** @type {any[]} */ ...args) { console.error('[sw-stream]', ...args); }

// ============ State ============

/** @type {Map<string, { cryptoKey: CryptoKey, baseIv: Uint8Array, headerSize: number, chunkCount: number, plaintextSize: number, r2Url: string, mimeType: string, isV14: boolean, aad: Uint8Array | undefined, registeredAt: number }>} */
const streams = new Map();

/** Tracks pending URL_EXPIRED notifications to prevent duplicate broadcasts */
const pendingExpiry = new Set();

// ============ Lifecycle ============

self.addEventListener('install', () => {
  log('INSTALL — skipWaiting');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log('ACTIVATE — clients.claim');
  event.waitUntil(self.clients.claim());
});

// ============ deriveChunkIV (inlined from @stenvault/aead-stream) ============
// Service workers cannot import TypeScript packages at runtime, so the
// canonical implementation in packages/aead-stream/src/iv.ts is duplicated
// here. Keep GCM_IV_LENGTH=12 and DERIVE_IV_BASE_LENGTH=8 identical to
// packages/aead-stream/src/constants.ts.

/**
 * @param {Uint8Array} baseIv - First 8 bytes used
 * @param {number} chunkIndex - 0-based chunk index
 * @returns {Uint8Array} 12-byte IV for this chunk
 */
function deriveChunkIV(baseIv, chunkIndex) {
  const iv = new Uint8Array(GCM_IV_LENGTH);
  iv.set(baseIv.subarray(0, DERIVE_IV_BASE_LENGTH));
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, chunkIndex, false); // big-endian
  iv.set(new Uint8Array(view.buffer), DERIVE_IV_BASE_LENGTH);
  return iv;
}

// ============ Message Handler ============

self.addEventListener('message', async (event) => {
  const { type } = event.data || {};

  if (type === 'REGISTER_STREAM') {
    const {
      streamId,
      rawKeyBytes,   // ArrayBuffer — 32 bytes
      baseIv,        // Uint8Array — 12 bytes (base64-decoded)
      headerSize,    // number — total CVEF header bytes
      chunkCount,    // number — total chunks
      plaintextSize, // number — original file size
      r2Url,         // string — presigned R2 URL
      mimeType,      // string — e.g. "video/mp4"
      isV14,         // boolean — whether v1.4 (AAD-protected)
      aad,           // ArrayBuffer | undefined — header bytes for v1.4
    } = event.data;

    // Acknowledgment port (MessageChannel) — client waits for this
    // before setting <video src>, preventing the registration race condition.
    const ackPort = event.ports && event.ports[0];

    log('REGISTER_STREAM:', streamId, '— chunks:', chunkCount, '— size:', plaintextSize);

    try {
      // Import as non-extractable CryptoKey
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        rawKeyBytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );

      // Zero the raw key in the transferred buffer
      new Uint8Array(rawKeyBytes).fill(0);

      streams.set(streamId, {
        cryptoKey,
        baseIv: new Uint8Array(baseIv),
        headerSize,
        chunkCount,
        plaintextSize,
        r2Url,
        mimeType,
        isV14: !!isV14,
        aad: aad ? new Uint8Array(aad) : undefined,
        registeredAt: Date.now(),
      });

      log('Stream registered:', streamId, '— total:', streams.size);

      // Cleanup expired streams
      for (const [id, s] of streams) {
        if (Date.now() - s.registeredAt > STREAM_TTL_MS) {
          log('Cleaning expired stream:', id);
          streams.delete(id);
        }
      }

      if (ackPort) ackPort.postMessage({ ok: true });
    } catch (err) {
      error('REGISTER_STREAM FAILED:', err.name, err.message);
      if (ackPort) ackPort.postMessage({ ok: false, error: err.message });
    }
  }

  if (type === 'UNREGISTER_STREAM') {
    log('UNREGISTER_STREAM:', event.data.streamId);
    streams.delete(event.data.streamId);
  }

  if (type === 'UPDATE_URL') {
    log('UPDATE_URL for:', event.data.streamId);
    const entry = streams.get(event.data.streamId);
    if (entry) {
      entry.r2Url = event.data.r2Url;
    }
    pendingExpiry.delete(event.data.streamId);
  }

  // Keepalive pings (Firefox idle timer reset) — no handler needed
});

// ============ Fetch Handler ============

self.addEventListener('fetch', (event) => {
  // Guard: some browsers (Firefox) dispatch fetch events for WASM source maps
  // or other non-standard URLs that fail new URL(). Ignore them silently.
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  const match = url.pathname.match(/^\/sw-stream\/(.+)$/);
  if (!match) return;

  const streamId = match[1];
  log('FETCH:', streamId, '— Range:', event.request.headers.get('Range'));

  // Wrap the entire handler in a promise so respondWith() never receives
  // a rejected promise (which crashes the request in Firefox).
  event.respondWith(handleStreamFetch(streamId, event.request));
});

/**
 * Central dispatch for /sw-stream/{id} requests.
 * Retries once if the stream entry hasn't been registered yet (race condition
 * between postMessage(REGISTER_STREAM) and the <video> element's first fetch).
 */
async function handleStreamFetch(streamId, request) {
  try {
    let entry = streams.get(streamId);

    // If entry not found, wait briefly for a pending REGISTER_STREAM message
    if (!entry) {
      await new Promise(resolve => setTimeout(resolve, 250));
      entry = streams.get(streamId);
    }

    if (!entry) {
      warn('FETCH MISS — no entry for', streamId);
      return new Response('Stream not found', { status: 404 });
    }

    const rangeHeader = request.headers.get('Range');

    // Firefox and Chrome both send "Range: bytes=0-" on first media load.
    // Route to handleFullRequest (streaming) instead of handleRangeRequest (buffered).
    const isFullRange = rangeHeader && /^bytes=0-$/.test(rangeHeader.trim());

    if (rangeHeader && !isFullRange) {
      return await handleRangeRequest(streamId, entry, rangeHeader);
    } else {
      return await handleFullRequest(streamId, entry, !!rangeHeader);
    }
  } catch (err) {
    error('UNHANDLED ERROR in handleStreamFetch:', err.name, err.message);
    return new Response(`Stream error: ${err.message || 'Unknown'}`, { status: 500 });
  }
}

// ============ Full Request (no Range) ============

/**
 * Serve the entire decrypted file as a streaming response.
 * Used for initial load and browsers that send Range: bytes=0-.
 * When respondAsRange is true, responds with 206 + Content-Range
 * so Chrome's media pipeline knows Range is fully supported.
 */
async function handleFullRequest(streamId, entry, respondAsRange = false) {
  let { cryptoKey, baseIv, headerSize, chunkCount, plaintextSize, r2Url, mimeType, isV14, aad } = entry;

  log('handleFullRequest:', streamId, '— chunks:', chunkCount, '— size:', plaintextSize);

  // Fetch before creating the ReadableStream so 403/errors return clean HTTP responses
  let r2Response;
  try {
    r2Response = await fetch(r2Url);
  } catch (fetchErr) {
    error('R2 FETCH THREW:', fetchErr.name, fetchErr.message);
    return new Response(`R2 fetch error: ${fetchErr.message}`, { status: 502 });
  }

  if (r2Response.status === 403) {
    notifyUrlExpired(streamId);
    return new Response('Presigned URL expired', { status: 503 });
  }
  if (!r2Response.ok) {
    error('R2 returned non-OK:', r2Response.status, r2Response.statusText);
    return new Response(`R2 fetch failed: ${r2Response.status}`, { status: 502 });
  }

  // Safety net: verify/correct plaintextSize from the actual R2 Content-Length.
  // file.size from DB is the encrypted size; the correct plaintext is smaller by
  // header + per-chunk overhead (20B each) + trailing integrity manifest.
  const r2ContentLength = parseInt(r2Response.headers.get('Content-Length'), 10);
  if (r2ContentLength > 0) {
    const perChunkOverhead = LENGTH_PREFIX_SIZE + GCM_TAG_SIZE; // 20
    // v1.4 manifest: 4B len + (32B HMAC + 4B count + 32B headerHash + 16B tag) = 88B
    // v1.2/v1.3 manifest: 4B len + (32B HMAC + 4B count + 16B tag) = 56B
    const manifestSize = isV14 ? 88 : 56;
    const computed = r2ContentLength - headerSize - chunkCount * perChunkOverhead - manifestSize;
    if (computed > 0 && computed !== plaintextSize) {
      log('Correcting plaintextSize:', plaintextSize, '→', computed);
      plaintextSize = computed;
      entry.plaintextSize = computed;
    }
  }

  const reader = r2Response.body.getReader();

  let cancelled = false;
  let chunksDecrypted = 0;
  let bytesDecrypted = 0;

  const body = new ReadableStream({
    async start(controller) {
      try {
        let buffer = new Uint8Array(0);

        // Helper: read from network until buffer has at least `needed` bytes
        async function fillBuffer(needed) {
          while (buffer.byteLength < needed) {
            const { done, value } = await reader.read();
            if (done) return false;
            buffer = concat(buffer, value);
          }
          return true;
        }

        // Skip the CVEF header
        if (!(await fillBuffer(headerSize))) {
          controller.close();
          return;
        }
        buffer = buffer.subarray(headerSize);

        // Decrypt chunks sequentially
        for (let i = 0; i < chunkCount; i++) {
          if (cancelled) break;
          if (!(await fillBuffer(LENGTH_PREFIX_SIZE))) break;

          const chunkLength = readUint32BE(buffer);
          const frameSize = LENGTH_PREFIX_SIZE + chunkLength;

          if (!(await fillBuffer(frameSize))) {
            if (!cancelled) controller.error(new Error(`Incomplete chunk ${i}`));
            return;
          }

          const encryptedChunk = buffer.subarray(LENGTH_PREFIX_SIZE, frameSize);
          buffer = buffer.subarray(frameSize);

          const iv = deriveChunkIV(baseIv, i);
          let decrypted;
          try {
            decrypted = await crypto.subtle.decrypt(
              {
                name: 'AES-GCM',
                iv,
                ...(isV14 && aad ? { additionalData: aad.buffer.slice(aad.byteOffset, aad.byteOffset + aad.byteLength) } : {}),
              },
              cryptoKey,
              encryptedChunk.buffer.slice(
                encryptedChunk.byteOffset,
                encryptedChunk.byteOffset + encryptedChunk.byteLength,
              ),
            );
          } catch (decryptErr) {
            error('DECRYPT FAILED at chunk', i, ':', decryptErr.name, decryptErr.message);
            throw decryptErr;
          }

          if (cancelled) break;
          controller.enqueue(new Uint8Array(decrypted));
          chunksDecrypted++;
          bytesDecrypted += decrypted.byteLength;
        }

        if (!cancelled) {
          log('Stream COMPLETE:', chunksDecrypted, 'chunks,', (bytesDecrypted / 1048576).toFixed(1), 'MB');
          controller.close();
        }
      } catch (err) {
        if (!cancelled) {
          error('Full request stream error:', err.name, err.message);
          controller.error(err);
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
    cancel() {
      cancelled = true;
      reader.cancel().catch(() => {});
    },
  });

  const headers = {
    'Content-Type': mimeType,
    'Content-Length': String(plaintextSize),
    'Accept-Ranges': 'bytes',
  };

  // When the browser sent Range: bytes=0-, reply with 206 so Chrome's media
  // pipeline trusts that Range requests work and correctly seeks for moov atoms.
  if (respondAsRange) {
    headers['Content-Range'] = `bytes 0-${plaintextSize - 1}/${plaintextSize}`;
  }

  return new Response(body, {
    status: respondAsRange ? 206 : 200,
    headers,
  });
}

// ============ Range Request ============

/**
 * Serve a byte range of the decrypted file (206 Partial Content).
 * Maps plaintext byte offsets to encrypted chunk indices,
 * fetches only the needed chunks from R2, decrypts, and slices.
 */
async function handleRangeRequest(streamId, entry, rangeHeader) {
  const { cryptoKey, baseIv, headerSize, chunkCount, plaintextSize, r2Url, mimeType, isV14, aad } = entry;

  // Parse Range: bytes=X-Y
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!rangeMatch) {
    return new Response('Invalid Range header', { status: 416 });
  }

  const rangeStart = parseInt(rangeMatch[1], 10);
  let rangeEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : plaintextSize - 1;

  if (rangeStart >= plaintextSize || rangeEnd >= plaintextSize || rangeStart > rangeEnd) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${plaintextSize}` },
    });
  }

  // Calculate which chunks cover [rangeStart, rangeEnd]
  const firstChunk = Math.floor(rangeStart / PLAINTEXT_CHUNK_SIZE);
  let lastChunk = Math.min(
    Math.floor(rangeEnd / PLAINTEXT_CHUNK_SIZE),
    chunkCount - 1,
  );

  // Cap range to avoid buffering gigabytes in memory (OOM on 4GB+ files).
  // 256 chunks × 64KB = 16MB max per range response — browser requests more as needed.
  const MAX_RANGE_CHUNKS = 256;
  if (lastChunk - firstChunk + 1 > MAX_RANGE_CHUNKS) {
    lastChunk = firstChunk + MAX_RANGE_CHUNKS - 1;
    rangeEnd = Math.min((lastChunk + 1) * PLAINTEXT_CHUNK_SIZE - 1, plaintextSize - 1);
    log('Range capped to', MAX_RANGE_CHUNKS, 'chunks');
  }

  // Calculate encrypted byte range for R2 fetch
  const encryptedStart = headerSize + firstChunk * ENCRYPTED_FRAME_SIZE;
  let rangeValue;
  if (lastChunk === chunkCount - 1) {
    // Last chunk: use open-ended Range to avoid miscalculating frame size.
    // The length prefix in the data tells us the actual chunk size.
    rangeValue = `bytes=${encryptedStart}-`;
  } else {
    const encryptedEnd = headerSize + (lastChunk + 1) * ENCRYPTED_FRAME_SIZE - 1;
    rangeValue = `bytes=${encryptedStart}-${encryptedEnd}`;
  }

  log('R2 Range fetch:', { firstChunk, lastChunk, rangeValue });

  // Fetch only the needed encrypted chunks from R2
  let r2Response;
  try {
    r2Response = await fetch(r2Url, {
      headers: { Range: rangeValue },
    });
  } catch (fetchErr) {
    error('R2 RANGE FETCH THREW:', fetchErr.name, fetchErr.message);
    return new Response(`R2 range fetch error: ${fetchErr.message}`, { status: 502 });
  }

  if (r2Response.status === 403) {
    notifyUrlExpired(streamId);
    return new Response('Presigned URL expired — refreshing...', { status: 503 });
  }

  if (!r2Response.ok && r2Response.status !== 206) {
    error('R2 Range non-OK:', r2Response.status, r2Response.statusText);
    return new Response(`R2 range fetch failed: ${r2Response.status}`, { status: 502 });
  }

  const rawData = new Uint8Array(await r2Response.arrayBuffer());

  // If R2 returned 200 (ignored Range header), the data starts from byte 0
  // and includes the CVEF header. Strip the offset so parsing starts at chunk data.
  let encryptedData;
  if (r2Response.status === 200) {
    encryptedData = rawData.subarray(encryptedStart);
  } else {
    encryptedData = rawData;
  }

  // Decrypt each chunk and collect plaintext
  const plaintextChunks = [];
  let offset = 0;

  for (let i = firstChunk; i <= lastChunk; i++) {
    const chunkLength = readUint32BE(encryptedData.subarray(offset, offset + LENGTH_PREFIX_SIZE));
    const encryptedChunk = encryptedData.subarray(
      offset + LENGTH_PREFIX_SIZE,
      offset + LENGTH_PREFIX_SIZE + chunkLength,
    );
    offset += LENGTH_PREFIX_SIZE + chunkLength;

    const iv = deriveChunkIV(baseIv, i);
    let decrypted;
    try {
      decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          ...(isV14 && aad ? { additionalData: aad.buffer.slice(aad.byteOffset, aad.byteOffset + aad.byteLength) } : {}),
        },
        cryptoKey,
        encryptedChunk.buffer.slice(
          encryptedChunk.byteOffset,
          encryptedChunk.byteOffset + encryptedChunk.byteLength,
        ),
      );
    } catch (decryptErr) {
      error('RANGE DECRYPT FAILED at chunk', i, ':', decryptErr.name, decryptErr.message);
      throw decryptErr;
    }

    plaintextChunks.push(new Uint8Array(decrypted));
  }

  // Concatenate decrypted chunks
  const totalDecrypted = plaintextChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const fullPlaintext = new Uint8Array(totalDecrypted);
  let pos = 0;
  for (const chunk of plaintextChunks) {
    fullPlaintext.set(chunk, pos);
    pos += chunk.byteLength;
  }

  // Slice to exact requested range within the decrypted data
  const sliceStart = rangeStart - firstChunk * PLAINTEXT_CHUNK_SIZE;
  // Clamp sliceEnd to actual decrypted data length (protects against plaintextSize mismatch)
  const requestedEnd = sliceStart + (rangeEnd - rangeStart + 1);
  const sliceEnd = Math.min(requestedEnd, totalDecrypted);
  const responseData = fullPlaintext.subarray(sliceStart, sliceEnd);

  // If the requested range starts beyond the actual data, the file is shorter than declared
  if (sliceStart >= totalDecrypted || responseData.byteLength === 0) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${plaintextSize}` },
    });
  }

  // Adjust rangeEnd to what we actually have
  const actualRangeEnd = rangeStart + responseData.byteLength - 1;

  return new Response(responseData, {
    status: 206,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(responseData.byteLength),
      'Content-Range': `bytes ${rangeStart}-${actualRangeEnd}/${plaintextSize}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

// ============ URL Expiry Notification ============

/**
 * Notify main thread that a presigned URL has expired.
 * The main thread should fetch a new URL and send UPDATE_URL.
 */
async function notifyUrlExpired(streamId) {
  if (pendingExpiry.has(streamId)) return;
  pendingExpiry.add(streamId);
  log('Notifying URL_EXPIRED for', streamId);
  const allClients = await self.clients.matchAll({ type: 'window' });
  for (const client of allClients) {
    client.postMessage({ type: 'URL_EXPIRED', streamId });
  }
}

// ============ Utilities ============

/** Read a big-endian uint32 from a Uint8Array (unsigned) */
function readUint32BE(data) {
  return ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
}

/** Concatenate two Uint8Arrays */
function concat(a, b) {
  const result = new Uint8Array(a.byteLength + b.byteLength);
  result.set(a, 0);
  result.set(b, a.byteLength);
  return result;
}
