/**
 * Streaming ZIP Upload Pipeline
 *
 * Replaces the in-memory zipSync bundling for multi-file Public Send.
 * Files are streamed through a ZIP encoder → chunked into SEND_PART_SIZE
 * blocks → encrypted → uploaded to R2, all with bounded memory.
 *
 * Architecture:
 *   File[] → createZipStream() → ReadableStream<Uint8Array>
 *     → Producer: accumulates SEND_PART_SIZE chunks, encrypts, pushes to channel
 *     → ChunkChannel (bounded queue, capacity=4)
 *     → 4 Consumer workers: upload encrypted chunks to R2 via presigned URLs
 *
 * Peak memory: ~100 MiB (1× accumulator + 4× channel slots + XHR in-flight)
 */

import { createZipStream } from "@/lib/zipStream";
import {
  createUrlPool,
  uploadOnePart,
  type SendUploadPartUrl,
  type SendUploadPart,
  type UploadEncryptedSendResult,
} from "@/lib/sendUpload";
import { encryptChunk, hashEncryptedChunk, SEND_PART_SIZE } from "@/lib/publicSendCrypto";

const MAX_CONCURRENT = 4;

// ---------------------------------------------------------------------------
// Bounded async channel (producer-consumer queue with backpressure)
// ---------------------------------------------------------------------------

interface ChunkItem {
  partIndex: number;
  encrypted: Uint8Array;
  chunkHash: string;
  plainSize: number;
}

interface ChunkChannel {
  /** Push an item. Blocks (awaits) if the queue is at capacity. */
  put(item: ChunkItem): Promise<void>;
  /** Take the next item. Returns null when the channel is closed and drained. */
  take(): Promise<ChunkItem | null>;
  /** Signal no more items will be produced. Unblocks waiting consumers. */
  close(): void;
}

export function createChunkChannel(capacity: number): ChunkChannel {
  const items: ChunkItem[] = [];
  let closed = false;

  // Waiters: resolve functions for blocked producers/consumers
  const putWaiters: Array<() => void> = [];
  const takeWaiters: Array<(item: ChunkItem | null) => void> = [];

  return {
    async put(item: ChunkItem): Promise<void> {
      // If a consumer is already waiting, hand off directly
      if (takeWaiters.length > 0) {
        const resolve = takeWaiters.shift()!;
        resolve(item);
        return;
      }

      // If queue has room, enqueue
      if (items.length < capacity) {
        items.push(item);
        return;
      }

      // Queue full — block until a consumer drains a slot
      await new Promise<void>((resolve) => {
        putWaiters.push(resolve);
      });
      items.push(item);
    },

    async take(): Promise<ChunkItem | null> {
      // If items available, dequeue and unblock a producer if waiting
      if (items.length > 0) {
        const item = items.shift()!;
        if (putWaiters.length > 0) {
          const resolve = putWaiters.shift()!;
          resolve();
        }
        return item;
      }

      // Empty and closed — done
      if (closed) return null;

      // Empty and open — block until producer pushes or closes
      return new Promise<ChunkItem | null>((resolve) => {
        takeWaiters.push(resolve);
      });
    },

    close(): void {
      closed = true;
      // Unblock all waiting consumers with null
      while (takeWaiters.length > 0) {
        const resolve = takeWaiters.shift()!;
        resolve(null);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Uint8Array accumulator helpers
// ---------------------------------------------------------------------------

function concatUint8Arrays(a: Uint8Array<ArrayBuffer>, b: Uint8Array): Uint8Array<ArrayBuffer> {
  if (a.byteLength === 0) return new Uint8Array(b) as Uint8Array<ArrayBuffer>;
  const result = new Uint8Array(a.byteLength + b.byteLength);
  result.set(a, 0);
  result.set(b, a.byteLength);
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StreamingUploadParams {
  files: File[];
  zipEntryNames: string[];
  key: CryptoKey;
  baseIv: Uint8Array;
  initialPartUrls: ReadonlyArray<SendUploadPartUrl>;
  totalParts: number;
  /** Pre-calculated ZIP size (from calculateZipSize) — used for progress. */
  zipSize: number;
  refreshPartUrls: (partNumbers: number[]) => Promise<ReadonlyArray<SendUploadPartUrl>>;
  abortSignal: { readonly aborted: boolean };
  onProgress: (percentage: number) => void;
  onSpeed: (bytesPerSec: number, etaSeconds: number) => void;
  onPartComplete?: (completedParts: ReadonlyArray<SendUploadPart>) => void;
}

export async function uploadStreamingZip(
  params: StreamingUploadParams,
): Promise<UploadEncryptedSendResult> {
  const {
    files,
    zipEntryNames,
    key,
    baseIv,
    initialPartUrls,
    totalParts,
    zipSize,
    refreshPartUrls,
    abortSignal,
    onProgress,
    onSpeed,
    onPartComplete,
  } = params;

  if (totalParts === 0) {
    return { parts: [], chunkHashes: [] };
  }

  const urlPool = createUrlPool(initialPartUrls, totalParts, refreshPartUrls);
  const channel = createChunkChannel(MAX_CONCURRENT);

  // Shared result arrays — indexed by partIndex for stable ordering
  const chunkHashes: string[] = new Array(totalParts);
  const partEtags: string[] = new Array(totalParts);
  const bytesPerPart: number[] = new Array(totalParts).fill(0);
  const completedPartEntries: SendUploadPart[] = [];

  let bytesCompleted = 0;
  const speedSamples: Array<{ bytes: number; time: number }> = [];

  // Shared error flag: when a consumer fails, the producer checks this to
  // stop streaming/encrypting immediately rather than processing the full file.
  let consumerError: Error | null = null;

  const updateSpeed = (bytesJustUploaded: number, totalRemaining: number) => {
    const now = Date.now();
    speedSamples.push({ bytes: bytesJustUploaded, time: now });
    if (speedSamples.length > 5) speedSamples.shift();
    if (speedSamples.length >= 2) {
      const first = speedSamples[0]!;
      const last = speedSamples[speedSamples.length - 1]!;
      const elapsed = (last.time - first.time) / 1000;
      const totalBytes = speedSamples.reduce((s, v) => s + v.bytes, 0);
      if (elapsed > 0) {
        const bps = totalBytes / elapsed;
        const eta = totalRemaining > 0 ? Math.ceil(totalRemaining / bps) : 0;
        onSpeed(bps, eta);
      }
    }
  };

  const emitProgress = () => {
    const inFlight = bytesPerPart.reduce((s, v) => s + v, 0);
    const total = bytesCompleted + inFlight;
    onProgress(Math.min(100, Math.round((total / zipSize) * 100)));
  };

  // --- Producer: ZIP stream → chunk → encrypt → channel ---

  const zipHandle = createZipStream();
  let producerError: Error | null = null;

  const producerPromise = (async () => {
    let totalBytesProduced = 0;

    try {
      // Feed files into the ZIP stream (streamed from disk, not buffered)
      for (let i = 0; i < files.length; i++) {
        if (abortSignal.aborted) throw new Error("Upload cancelled");
        if (consumerError) throw consumerError;
        await zipHandle.addFile(zipEntryNames[i]!, files[i]!.stream());
      }
      zipHandle.end();

      // Read the ZIP output stream in SEND_PART_SIZE chunks
      const reader = zipHandle.readable.getReader();
      let buffer = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
      let partIndex = 0;

      const drainBuffer = async (minSize: number) => {
        while (buffer.byteLength >= minSize) {
          if (abortSignal.aborted) throw new Error("Upload cancelled");
          if (consumerError) throw consumerError;

          const chunkSize = Math.min(SEND_PART_SIZE, buffer.byteLength);
          const chunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize) as Uint8Array<ArrayBuffer>;

          totalBytesProduced += chunk.byteLength;

          const encrypted = await encryptChunk(chunk, key, baseIv, partIndex);
          const chunkHash = await hashEncryptedChunk(encrypted);

          await channel.put({
            partIndex,
            encrypted,
            chunkHash,
            plainSize: chunk.byteLength,
          });

          partIndex++;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = concatUint8Arrays(buffer, value);
        await drainBuffer(SEND_PART_SIZE);
      }

      // Flush remaining bytes as the last (smaller) chunk
      if (buffer.byteLength > 0) {
        if (abortSignal.aborted) throw new Error("Upload cancelled");
        if (consumerError) throw consumerError;

        totalBytesProduced += buffer.byteLength;

        const encrypted = await encryptChunk(buffer, key, baseIv, partIndex);
        const chunkHash = await hashEncryptedChunk(encrypted);

        await channel.put({
          partIndex,
          encrypted,
          chunkHash,
          plainSize: buffer.byteLength,
        });
      }

      // Validate that the ZIP stream produced the expected number of bytes
      if (totalBytesProduced !== zipSize) {
        throw new Error(
          `ZIP size mismatch: calculated ${zipSize}, actual ${totalBytesProduced}`,
        );
      }
    } catch (err) {
      producerError = err instanceof Error ? err : new Error(String(err));
      zipHandle.terminate(producerError.message);
    } finally {
      channel.close();
    }
  })();

  // --- Consumers: channel → upload to R2 ---

  const consumerPromise = Promise.all(
    Array.from({ length: MAX_CONCURRENT }, () =>
      (async () => {
        while (true) {
          const item = await channel.take();
          if (item === null) break; // channel closed and drained

          if (abortSignal.aborted) continue; // drain remaining items
          if (producerError || consumerError) continue;

          const partNumber = item.partIndex + 1;
          chunkHashes[item.partIndex] = item.chunkHash;

          try {
            const etag = await uploadOnePart(
              partNumber,
              item.encrypted,
              urlPool,
              (loaded, total) => {
                bytesPerPart[item.partIndex] =
                  total > 0 ? (loaded / total) * item.plainSize : 0;
                emitProgress();
              },
            );

            partEtags[item.partIndex] = etag;
            bytesPerPart[item.partIndex] = 0;
            bytesCompleted += item.plainSize;
            const remaining = zipSize - bytesCompleted;
            updateSpeed(item.plainSize, remaining);
            emitProgress();

            completedPartEntries.push({ partNumber, etag });
            onPartComplete?.(completedPartEntries);
          } catch (err) {
            // Signal producer to stop streaming/encrypting
            consumerError = err instanceof Error ? err : new Error(String(err));
            throw err;
          }
        }
      })(),
    ),
  );

  // Wait for both sides. consumerPromise may reject first if an upload fails —
  // the producer will observe consumerError and stop promptly.
  const [, consumerResult] = await Promise.allSettled([producerPromise, consumerPromise]);

  // Prioritize consumer errors (upload failures the user can act on)
  if (consumerResult.status === "rejected") {
    throw consumerResult.reason;
  }
  if (producerError) throw producerError;

  const parts: SendUploadPart[] = Array.from({ length: totalParts }, (_, i) => ({
    partNumber: i + 1,
    etag: partEtags[i]!,
  }));

  return { parts, chunkHashes };
}
