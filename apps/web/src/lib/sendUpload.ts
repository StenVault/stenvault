/**
 * Orchestration for Public Send encrypted chunk uploads.
 *
 * Parallel upload with bounded concurrency plus on-demand presigned URL refresh.
 *
 * The caller (usePublicSend) passes a small first batch of presigned URLs
 * from `initiateSend` and a `refreshPartUrls` callback that mints more on
 * demand via `signSendParts`. This module:
 *
 * - Encrypts chunks and uploads them in parallel (maxConcurrent = 4). Four
 *   parallel PUTs saturates a ~400 Mbit home connection without overwhelming
 *   the browser's 6-per-origin socket budget or exhausting the encryption
 *   main-thread slot.
 * - Maintains a URL pool keyed by partNumber. When a chunk needs a URL and
 *   the pool doesn't have one, it triggers a batched refresh for all parts
 *   that still need URLs. Refresh calls are serialized through `refreshChain`
 *   so concurrent chunks never kick off duplicate refreshes.
 * - Classifies a 403 from R2 by inspecting the S3 XML error code. An
 *   `AccessDenied` (or empty body) is treated as recoverable URL expiry —
 *   one fresh URL + retry, then `PRESIGNED_EXPIRED` if it happens again.
 *   Any other S3 error code (`SignatureDoesNotMatch`, etc.) throws
 *   immediately so upstream surfaces the real cause instead of hiding it.
 * - Preserves part-number order in `chunkHashes` so `computeChunkManifest`
 *   can sign the hashes in a stable order regardless of completion order.
 */
import { encryptChunk, hashEncryptedChunk, SEND_PART_SIZE } from "@/lib/publicSendCrypto";
import { runWithConcurrency } from "@/lib/uploadConcurrency";

const MAX_RETRIES = 3;
const MAX_CONCURRENT = 4;

export interface SendUploadPartUrl {
  partNumber: number;
  url: string;
  partSize: number;
}

export interface SendUploadPart {
  partNumber: number;
  etag: string;
}

export interface UploadEncryptedSendParams {
  fileBlob: Blob;
  key: CryptoKey;
  baseIv: Uint8Array;
  /** Initial batch of URLs from `initiateSend`. May be shorter than `totalParts`. */
  initialPartUrls: ReadonlyArray<SendUploadPartUrl>;
  /** Total number of parts the upload needs — may exceed `initialPartUrls.length`. */
  totalParts: number;
  /**
   * Request fresh presigned URLs for the given part numbers. Called on demand
   * when the URL pool is empty for a needed part and when R2 returns 403 for
   * an individual PUT. Implementation typically wraps `signSendParts`.
   */
  refreshPartUrls: (partNumbers: number[]) => Promise<ReadonlyArray<SendUploadPartUrl>>;
  abortSignal: { readonly aborted: boolean };
  onProgress: (percentage: number) => void;
  onSpeed: (bytesPerSec: number, etaSeconds: number) => void;
  onPartComplete?: (completedParts: ReadonlyArray<SendUploadPart>) => void;
}

export interface UploadEncryptedSendResult {
  parts: SendUploadPart[];
  chunkHashes: string[];
}

export interface UrlPool {
  get(partNumber: number): Promise<SendUploadPartUrl>;
  replace(partNumber: number): Promise<SendUploadPartUrl>;
}

export function createUrlPool(
  initial: ReadonlyArray<SendUploadPartUrl>,
  totalParts: number,
  refresh: (partNumbers: number[]) => Promise<ReadonlyArray<SendUploadPartUrl>>,
): UrlPool {
  const pool = new Map<number, SendUploadPartUrl>();
  for (const entry of initial) pool.set(entry.partNumber, entry);

  // Serializes refresh calls so concurrent workers don't each fire a separate
  // `signSendParts` round-trip for the same empty pool.
  let refreshChain: Promise<void> = Promise.resolve();

  const refillFor = async (partNumber: number): Promise<void> => {
    const next = refreshChain.then(async () => {
      if (pool.has(partNumber)) return;

      // Batch-request: fetch as many of the still-missing parts as possible
      // in one call so large uploads amortize the refresh round-trip.
      const missing: number[] = [];
      for (let p = partNumber; p <= totalParts && missing.length < 32; p++) {
        if (!pool.has(p)) missing.push(p);
      }
      if (missing.length === 0) return;

      const fresh = await refresh(missing);
      for (const entry of fresh) pool.set(entry.partNumber, entry);
    });
    refreshChain = next.catch(() => {
      /* keep chain alive — per-call error surfaces to the awaiter */
    });
    await next;
  };

  const replaceOne = async (partNumber: number): Promise<SendUploadPartUrl> => {
    const next = refreshChain.then(async () => {
      pool.delete(partNumber);
      const fresh = await refresh([partNumber]);
      for (const entry of fresh) pool.set(entry.partNumber, entry);
    });
    refreshChain = next.catch(() => {
      /* keep chain alive */
    });
    await next;

    const entry = pool.get(partNumber);
    if (!entry) {
      throw new Error(`Refresh for part ${partNumber} returned no URL`);
    }
    return entry;
  };

  return {
    async get(partNumber: number): Promise<SendUploadPartUrl> {
      if (!pool.has(partNumber)) {
        await refillFor(partNumber);
      }
      const entry = pool.get(partNumber);
      if (!entry) {
        throw new Error(`No URL available for part ${partNumber}`);
      }
      return entry;
    },
    replace: replaceOne,
  };
}

type PutPartResult =
  | { kind: "ok"; etag: string }
  | { kind: "expired" }
  | { kind: "fatal"; code: string };

/**
 * R2/S3 returns XML error bodies shaped like:
 *   <Error><Code>AccessDenied</Code><Message>...</Message></Error>
 * We only need the <Code> value to decide expiry-vs-fatal, so a regex keeps
 * the path dependency-free. Returns null for bodies without a recognizable
 * code (which we treat as expired — AccessDenied is the common empty case).
 */
function extractS3ErrorCode(body: string): string | null {
  const match = /<Code>([^<]+)<\/Code>/i.exec(body);
  return match ? match[1]!.trim() : null;
}

async function putPart(
  url: string,
  encrypted: Uint8Array,
  partNumber: number,
  onByteProgress?: (loaded: number, total: number) => void,
): Promise<PutPartResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onByteProgress) {
        onByteProgress(e.loaded, e.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 403) {
        const code = extractS3ErrorCode(xhr.responseText || "");
        // AccessDenied is what R2 returns for an expired presigned URL, so
        // we treat it (and bodyless 403s) as recoverable. Any other S3 error
        // code — SignatureDoesNotMatch, InvalidRequest, RequestTimeTooSkewed,
        // etc. — is a hard fault the caller needs to see verbatim.
        if (code === null || code === "AccessDenied") {
          resolve({ kind: "expired" });
        } else {
          resolve({ kind: "fatal", code });
        }
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          // Server MUST return an ETag for multipart parts; a forged value
          // would pass locally but fail `completeMultipartUpload` on R2 with
          // a confusing "part 1 InvalidPart" error. Fail here with a clear
          // message instead.
          reject(new Error(`Upload part ${partNumber} missing ETag header`));
          return;
        }
        resolve({ kind: "ok", etag });
        return;
      }
      reject(new Error(`Upload part ${partNumber} failed: ${xhr.status}`));
    });

    xhr.addEventListener("error", () => {
      reject(new Error(`Upload part ${partNumber} failed - network error`));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(new Blob([encrypted as unknown as BlobPart]));
  });
}

export async function uploadOnePart(
  partNumber: number,
  encrypted: Uint8Array,
  urlPool: UrlPool,
  onByteProgress: (loaded: number, total: number) => void,
): Promise<string> {
  // First AccessDenied is treated as URL-expiry recovery: mint a fresh URL
  // and retry once. A second AccessDenied is terminal — the session or
  // uploadSecret is gone and retrying would just hide the real problem.
  let refreshed = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const partInfo = await urlPool.get(partNumber);
      const result = await putPart(partInfo.url, encrypted, partNumber, onByteProgress);

      if (result.kind === "expired") {
        if (refreshed) {
          throw new Error("PRESIGNED_EXPIRED");
        }
        refreshed = true;
        await urlPool.replace(partNumber);
        // Retry immediately on refresh; don't burn a retry slot on what is
        // just a stale presigned URL that we've already mitigated.
        attempt--;
        continue;
      }

      if (result.kind === "fatal") {
        // Wrap the S3 code so the outer catch can classify it, but don't
        // convert it to PRESIGNED_EXPIRED — callers need the real code.
        throw new Error(`R2_UPLOAD_FATAL:${result.code}`);
      }

      return result.etag;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "PRESIGNED_EXPIRED") throw err;
      if (message.startsWith("R2_UPLOAD_FATAL:")) throw err;
      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 1s, 2s, 4s.
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Unreachable");
}

/**
 * Encrypt the file in SEND_PART_SIZE chunks and PUT each to its presigned
 * URL with bounded parallelism. Progress, speed, and ETA are reported via
 * callbacks so the caller (a React hook) can drive UI state without this
 * module knowing anything about React.
 *
 * The `abortSignal` is polled before each chunk task starts; in-flight PUTs
 * still run to completion when aborted, leaving R2 in a consistent state
 * for the caller to clean up via `completeSend` (or expire naturally).
 *
 * Throws `PRESIGNED_EXPIRED` if R2 returns AccessDenied on a refreshed URL
 * (the first AccessDenied triggers a one-shot URL refresh + retry). Any
 * other S3 error code throws immediately with the code in the message.
 */
export async function uploadEncryptedSend(
  params: UploadEncryptedSendParams,
): Promise<UploadEncryptedSendResult> {
  const {
    fileBlob,
    key,
    baseIv,
    initialPartUrls,
    totalParts,
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

  // Pre-allocated indexed arrays so parallel completion doesn't scramble
  // part-number ordering — `chunkManifest` signs the hashes in order so any
  // drift breaks the integrity check on download.
  const chunkHashes: string[] = new Array(totalParts);
  const partEtags: string[] = new Array(totalParts);
  const bytesPerPart: number[] = new Array(totalParts).fill(0);
  const completedPartEntries: SendUploadPart[] = [];

  let bytesCompleted = 0;
  const speedSamples: Array<{ bytes: number; time: number }> = [];
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
    onProgress(Math.min(100, Math.round((total / fileBlob.size) * 100)));
  };

  const tasks = Array.from({ length: totalParts }, (_, i) => async () => {
    if (abortSignal.aborted) throw new Error("Upload cancelled");

    const partIndex = i;
    const partNumber = i + 1;
    const start = partIndex * SEND_PART_SIZE;
    const end = Math.min(start + SEND_PART_SIZE, fileBlob.size);
    const slice = await fileBlob.slice(start, end).arrayBuffer();
    const chunk = new Uint8Array(slice);

    const encrypted = await encryptChunk(chunk, key, baseIv, partIndex);
    const chunkHash = await hashEncryptedChunk(encrypted);
    chunkHashes[partIndex] = chunkHash;

    const etag = await uploadOnePart(
      partNumber,
      encrypted,
      urlPool,
      (loaded, total) => {
        bytesPerPart[partIndex] = total > 0 ? (loaded / total) * chunk.byteLength : 0;
        emitProgress();
      },
    );

    partEtags[partIndex] = etag;
    bytesPerPart[partIndex] = 0;
    bytesCompleted += chunk.byteLength;
    const remaining = fileBlob.size - bytesCompleted;
    updateSpeed(chunk.byteLength, remaining);
    // Must go through emitProgress() so in-flight bytes from other parallel
    // parts are counted — computing from bytesCompleted alone regresses the
    // bar every time a part lands while others are still uploading.
    emitProgress();

    completedPartEntries.push({ partNumber, etag });
    onPartComplete?.(completedPartEntries);
  });

  await runWithConcurrency(tasks, MAX_CONCURRENT);

  const parts: SendUploadPart[] = Array.from({ length: totalParts }, (_, i) => ({
    partNumber: i + 1,
    etag: partEtags[i]!,
  }));

  return { parts, chunkHashes };
}
