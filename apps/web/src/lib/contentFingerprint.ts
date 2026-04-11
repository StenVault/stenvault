/**
 * Content Fingerprint — Quantum-Safe Duplicate Detection (v2 Streaming)
 *
 * Computes HMAC-SHA-256 fingerprints of plaintext files for user-scoped
 * duplicate detection using a streaming chunked algorithm:
 *
 *   1. Read file in 64KB chunks via File.slice() — O(64KB) memory per iteration
 *   2. SHA-256 each chunk → 32-byte digest
 *   3. Concatenate all digests (~512KB for a 1GB file)
 *   4. HMAC-SHA-256(fpKey, concatenatedDigests) → 64-char hex
 *
 * Properties:
 *   - Same file + same user = same fingerprint (deterministic)
 *   - Different users = different fingerprints (user-scoped)
 *   - Server sees opaque hex — cannot reverse without HMAC key (zero-knowledge)
 *   - HMAC-SHA-256 with 256-bit key is quantum-safe (Grover doesn't help)
 *   - O(numChunks * 32) memory — works for any file size
 */

import { debugLog } from '@/lib/debugLogger';
import { STREAMING } from '@/lib/constants';
import type {
  FingerprintRequest,
  FingerprintWorkerMessage,
} from './workers/fingerprint.worker';

const FINGERPRINT_CHUNK_SIZE = STREAMING.CHUNK_SIZE_BYTES; // 64KB
const WORKER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============ Worker Singleton ============

let workerInstance: Worker | null = null;
let workerReady = false;
let workerReadyResolve: (() => void) | null = null;
let workerReadyPromise: Promise<void> | null = null;

function getWorker(): Worker | null {
  if (!workerInstance) {
    try {
      workerReady = false;
      workerReadyPromise = new Promise<void>((resolve) => {
        workerReadyResolve = resolve;
      });

      workerInstance = new Worker(
        new URL('./workers/fingerprint.worker.ts', import.meta.url),
        { type: 'module' },
      );

      workerInstance.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.type === 'ready') {
          workerReady = true;
          workerReadyResolve?.();
        }
      });
    } catch {
      return null;
    }
  }
  return workerInstance;
}

async function waitForWorkerReady(): Promise<void> {
  if (workerReady) return;
  if (workerReadyPromise) await workerReadyPromise;
}

export function terminateFingerprintWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    workerReady = false;
    workerReadyResolve = null;
    workerReadyPromise = null;
  }
}

/** Auto-terminate Worker after 60s of inactivity (Rule 3: timers with cleanup) */
let idleTimerId: ReturnType<typeof setTimeout> | null = null;
const IDLE_TIMEOUT_MS = 60_000;

function resetIdleTimer(): void {
  if (idleTimerId) clearTimeout(idleTimerId);
  idleTimerId = setTimeout(() => {
    terminateFingerprintWorker();
    idleTimerId = null;
  }, IDLE_TIMEOUT_MS);
}

// ============ Main-thread fallback ============

/**
 * Chunked fingerprint computed on main thread.
 * Used when Worker is unavailable (CSP, test environment, etc.)
 */
export async function computeChunkedFingerprintMainThread(
  file: File,
  fingerprintKey: CryptoKey,
  chunkSize: number = FINGERPRINT_CHUNK_SIZE,
): Promise<string> {
  const totalSize = file.size;
  const digests: ArrayBuffer[] = [];

  let offset = 0;
  while (offset < totalSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const chunk = file.slice(offset, end);
    const chunkData = await chunk.arrayBuffer();

    digests.push(await crypto.subtle.digest('SHA-256', chunkData));
    offset = end;
  }

  // Concatenate all 32-byte digests
  const totalDigestBytes = digests.length * 32;
  const concatenated = new Uint8Array(totalDigestBytes);
  for (let i = 0; i < digests.length; i++) {
    concatenated.set(new Uint8Array(digests[i]!), i * 32);
  }

  // Final HMAC-SHA-256 with user-scoped key
  const signature = await crypto.subtle.sign('HMAC', fingerprintKey, concatenated.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============ Public API ============

export interface FingerprintProgress {
  percentage: number;
}

/**
 * Compute a streaming content fingerprint (v2) of a file's plaintext bytes.
 *
 * Uses a Web Worker for non-blocking computation. Falls back to main thread
 * if Worker is unavailable.
 *
 * @param file - The plaintext File to fingerprint (before encryption)
 * @param fingerprintKey - CryptoKey for HMAC-SHA-256 (derived from Master Key)
 * @param onProgress - Optional progress callback
 * @param signal - Optional AbortSignal for cancellation
 * @returns 64-character lowercase hex string
 */
export async function computeStreamingFingerprint(
  file: File,
  fingerprintKey: CryptoKey,
  onProgress?: (progress: FingerprintProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const start = performance.now();

  // Empty file: HMAC of empty buffer (deterministic, valid)
  if (file.size === 0) {
    const signature = await crypto.subtle.sign('HMAC', fingerprintKey, new ArrayBuffer(0));
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const worker = getWorker();

  // Fallback to main thread if Worker unavailable
  if (!worker) {
    debugLog('[fingerprint]', 'Worker unavailable, using main-thread fallback');
    const hash = await computeChunkedFingerprintMainThread(file, fingerprintKey);
    debugLog('[fingerprint]', 'Content fingerprint computed (main-thread)', {
      size: file.size,
      ms: Math.round(performance.now() - start),
    });
    return hash;
  }

  await waitForWorkerReady();

  return new Promise<string>((resolve, reject) => {
    const id = crypto.randomUUID();
    let settled = false;

    const cleanup = () => {
      settled = true;
      clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      signal?.removeEventListener('abort', handleAbort);
    };

    const handleMessage = (event: MessageEvent<FingerprintWorkerMessage>) => {
      if (settled || event.data.id !== id) return;

      switch (event.data.type) {
        case 'progress':
          onProgress?.({ percentage: event.data.percentage });
          break;
        case 'result':
          cleanup();
          resetIdleTimer();
          debugLog('[fingerprint]', 'Content fingerprint computed (worker)', {
            size: file.size,
            ms: Math.round(performance.now() - start),
          });
          resolve(event.data.hash);
          break;
        case 'error':
          cleanup();
          resetIdleTimer();
          reject(new Error(event.data.message));
          break;
      }
    };

    const handleAbort = () => {
      if (settled) return;
      cleanup();
      reject(new DOMException('Fingerprint aborted', 'AbortError'));
    };

    const timeoutId = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error(`Fingerprint worker timeout after ${WORKER_TIMEOUT_MS}ms`));
    }, WORKER_TIMEOUT_MS);

    worker.addEventListener('message', handleMessage);
    signal?.addEventListener('abort', handleAbort);

    worker.postMessage({
      type: 'compute',
      id,
      file,
      key: fingerprintKey,
      chunkSize: FINGERPRINT_CHUNK_SIZE,
    } satisfies FingerprintRequest);
  });
}
