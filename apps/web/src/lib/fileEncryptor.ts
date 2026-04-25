/**
 * File Encryptor
 *
 * Main thread interface for encrypting files using Web Worker.
 * Provides non-blocking encryption for large files while falling back
 * to main thread for small files where Worker overhead isn't worth it.
 *
 * Architecture:
 * - Threshold-based: uses Worker for files > WORKER_THRESHOLD
 * - Progress callbacks via Worker postMessage
 * - Fallback to main thread if Worker unavailable
 *
 * @module fileEncryptor
 */

import type {
    EncryptRequest,
    EncryptWorkerMessage,
    EncryptProgressMessage,
    EncryptV4Result,
    EncryptErrorMessage,
} from './workers/fileEncryptor.worker';
import type { HybridPublicKey, CVEFMetadataV1_4, CVEFSignatureMetadata } from '@stenvault/shared/platform/crypto';
import { arrayBufferToBase64 } from '@stenvault/shared/platform/crypto';
import { encryptFileHybridAuto, type SigningOptions } from './hybridFile';
import { devWarn } from '@/lib/debugLogger';
import { VaultError } from '@stenvault/shared/errors';

// ============ Constants ============

/** Use Worker for files larger than this (5MB) */
const WORKER_THRESHOLD = 5 * 1024 * 1024;

/** Maximum time to wait for Worker response (5 minutes for very large files) */
const WORKER_TIMEOUT_MS = 5 * 60 * 1000;

// ============ Types ============

export interface EncryptionProgress {
    percentage: number;
}

export interface EncryptV4Options {
    onProgress?: (progress: EncryptionProgress) => void;
    signal?: AbortSignal;
    /** Sign at encrypt time (v1.4 two-block header) */
    signing?: SigningOptions;
}

// ============ Worker Singleton ============

let workerInstance: Worker | null = null;
let workerSupported: boolean | null = null;
let workerReady = false;
let workerReadyResolve: (() => void) | null = null;
let workerReadyPromise: Promise<void> | null = null;

function isWorkerSupported(): boolean {
    if (workerSupported === null) {
        workerSupported = typeof Worker !== 'undefined';
    }
    return workerSupported;
}

/**
 * Get or create the Worker instance.
 * Returns null if Worker cannot be created (CSP, bundler issue, etc.)
 *
 * IMPORTANT: The worker uses vite-plugin-top-level-await which wraps
 * its code in (async () => { ... })(). This means self.onmessage is
 * set AFTER async WASM loading. Messages sent before the 'ready'
 * signal will be silently dropped. Use waitForWorkerReady() before
 * posting messages.
 */
function getWorker(): Worker | null {
    if (!workerInstance) {
        try {
            workerReady = false;
            workerReadyPromise = new Promise<void>((resolve) => {
                workerReadyResolve = resolve;
            });

            workerInstance = new Worker(
                new URL('./workers/fileEncryptor.worker.ts', import.meta.url),
                { type: 'module' }
            );

            // Listen for the ready signal from the worker
            const onReady = (event: MessageEvent) => {
                if (event.data?.type === 'ready') {
                    devWarn('[fileEncryptor] Worker ready signal received');
                    workerReady = true;
                    workerReadyResolve?.();
                    // Don't remove listener — handleMessage in encrypt functions also uses addEventListener
                }
            };
            workerInstance.addEventListener('message', onReady);
        } catch {
            return null;
        }
    }
    return workerInstance;
}

/**
 * Wait for the fileEncryptor worker to be ready (WASM loaded, onmessage set).
 * Returns immediately if already ready.
 */
async function waitForWorkerReady(): Promise<void> {
    if (workerReady) return;
    if (workerReadyPromise) await workerReadyPromise;
}

/**
 * Terminate the encryption Worker (call on cleanup if needed)
 */
export function terminateEncryptWorker(): void {
    if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
        workerReady = false;
        workerReadyPromise = null;
        workerReadyResolve = null;
    }
}

// ============ Helper Functions ============

function generateRequestId(): string {
    return `enc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
    return arrayBufferToBase64(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    );
}

// ============ Worker Encryption ============

/**
 * Encrypt V4 file in Worker.
 *
 * @internal Exported for the worker-contract test suite. Not part of the
 * public API — callers should use `encryptFileV4`, which picks Worker vs
 * main thread and handles fallback.
 */
export async function encryptV4InWorker(
    file: File,
    publicKey: HybridPublicKey,
    onProgress?: (progress: EncryptionProgress) => void,
    signal?: AbortSignal
): Promise<{ blob: Blob; metadata: CVEFMetadataV1_4; originalSize: number; version: 4 }> {
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const worker = getWorker();
    if (!worker) {
        throw new VaultError('INFRA_WORKER_FAILED', {
            op: 'file_encrypt',
            reason: 'unavailable',
        });
    }

    // Wait for worker WASM to load before sending any messages
    await waitForWorkerReady();

    return new Promise((resolve, reject) => {
        const requestId = generateRequestId();

        const timeoutId = setTimeout(() => {
            cleanup();
            terminateEncryptWorker();
            reject(new VaultError('INFRA_TIMEOUT', {
                op: 'file_encrypt',
                ms: WORKER_TIMEOUT_MS,
            }));
        }, WORKER_TIMEOUT_MS);

        const onAbort = () => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        const handleMessage = (event: MessageEvent<EncryptWorkerMessage | { type: 'ready' }>) => {
            const message = event.data;
            if (message.type === 'ready') return;
            if ('id' in message && message.id !== requestId) return;

            switch (message.type) {
                case 'progress':
                    onProgress?.({ percentage: (message as EncryptProgressMessage).percentage });
                    break;

                case 'result': {
                    cleanup();
                    const result = message as EncryptV4Result;
                    const blob = result.encryptedBlob ?? new Blob([result.encryptedData!], { type: 'application/octet-stream' });
                    resolve({
                        blob,
                        metadata: result.metadata,
                        originalSize: result.originalSize,
                        version: 4,
                    });
                    break;
                }

                case 'error':
                    cleanup();
                    reject(new VaultError('INFRA_WORKER_FAILED', {
                        op: 'file_encrypt',
                        source: 'worker_response',
                        workerMessage: (message as EncryptErrorMessage).error,
                    }));
                    break;
            }
        };

        const handleError = (error: ErrorEvent) => {
            cleanup();
            terminateEncryptWorker();
            reject(new VaultError('INFRA_WORKER_FAILED', {
                op: 'file_encrypt',
                source: 'onerror',
                workerMessage: error.message,
            }, { cause: error }));
        };

        const cleanup = () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onAbort);
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
        };

        signal?.addEventListener('abort', onAbort);
        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        const request: EncryptRequest = {
            type: 'encrypt-v4',
            id: requestId,
            file,
            classicalPubKey: bytesToBase64(publicKey.classical),
            pqPubKey: bytesToBase64(publicKey.postQuantum),
        };

        worker.postMessage(request);
    });
}

// ============ Public API ============

/**
 * Encrypt a file using V4 (Hybrid PQC X25519 + ML-KEM-768).
 *
 * Uses Worker for files > 5MB, main thread otherwise.
 * Falls back to main thread if Worker unavailable.
 *
 * @param file - File to encrypt
 * @param publicKey - Hybrid public key (classical + postQuantum)
 * @param options - Optional progress callback
 */
export async function encryptFileV4(
    file: File,
    publicKey: HybridPublicKey,
    options?: EncryptV4Options
): Promise<{ blob: Blob; metadata: CVEFMetadataV1_4; signatureMetadata?: CVEFSignatureMetadata; originalSize: number; version: 4 }> {
    if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const useWorker = isWorkerSupported() && file.size > WORKER_THRESHOLD && !options?.signing;
    devWarn('[V4] encryptFileV4 start', { size: file.size, useWorker, threshold: WORKER_THRESHOLD, signing: !!options?.signing });

    if (useWorker) {
        try {
            return await encryptV4InWorker(file, publicKey, options?.onProgress, options?.signal);
        } catch (err) {
            // Re-throw abort errors — don't fall back to main thread
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            // Worker failed — fall back to main thread
            devWarn('[V4] fileEncryptor Worker failed, falling back to main thread:', err);
        }
    }

    // Main thread (or signing — Worker doesn't have secret keys)
    devWarn('[V4] Using main thread encryption');
    const result = await encryptFileHybridAuto(file, {
        publicKey,
        signing: options?.signing,
        onProgress: options?.onProgress
            ? (p) => options.onProgress!({ percentage: p.percentage })
            : undefined,
    });

    return {
        blob: result.blob,
        metadata: result.metadata,
        signatureMetadata: result.signatureMetadata,
        originalSize: result.originalSize,
        version: 4,
    };
}
