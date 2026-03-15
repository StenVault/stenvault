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
    EncryptV3Result,
    EncryptV4Result,
    EncryptErrorMessage,
} from './workers/fileEncryptor.worker';
import type { HybridPublicKey, CVEFMetadataV1_2 } from '@stenvault/shared/platform/crypto';
import { arrayBufferToBase64 } from '@stenvault/shared/platform/crypto';
import { encryptFileWithKey } from './fileCrypto';
import { encryptFileHybridAuto } from './hybridFileCrypto';

// ============ Constants ============

/** Use Worker for files larger than this (5MB) */
const WORKER_THRESHOLD = 5 * 1024 * 1024;

/** Maximum time to wait for Worker response (5 minutes for very large files) */
const WORKER_TIMEOUT_MS = 5 * 60 * 1000;

// ============ Types ============

export interface EncryptionProgress {
    percentage: number;
}

export interface EncryptV3Options {
    onProgress?: (progress: EncryptionProgress) => void;
    signal?: AbortSignal;
}

export interface EncryptV4Options {
    onProgress?: (progress: EncryptionProgress) => void;
    signal?: AbortSignal;
}

// ============ Worker Singleton ============

let workerInstance: Worker | null = null;
let workerSupported: boolean | null = null;

function isWorkerSupported(): boolean {
    if (workerSupported === null) {
        workerSupported = typeof Worker !== 'undefined';
    }
    return workerSupported;
}

/**
 * Get or create the Worker instance.
 * Returns null if Worker cannot be created (CSP, bundler issue, etc.)
 */
function getWorker(): Worker | null {
    if (!workerInstance) {
        try {
            workerInstance = new Worker(
                new URL('./workers/fileEncryptor.worker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch {
            return null;
        }
    }
    return workerInstance;
}

/**
 * Terminate the encryption Worker (call on cleanup if needed)
 */
export function terminateEncryptWorker(): void {
    if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
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
 * Encrypt V3 file in Worker
 */
function encryptV3InWorker(
    file: File,
    keyBytes: Uint8Array,
    onProgress?: (progress: EncryptionProgress) => void,
    signal?: AbortSignal
): Promise<{ blob: Blob; iv: string; version: 3 }> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }

        const worker = getWorker();
        if (!worker) {
            reject(new Error('Web Worker unavailable'));
            return;
        }

        const requestId = generateRequestId();

        const timeoutId = setTimeout(() => {
            cleanup();
            terminateEncryptWorker();
            reject(new Error('Worker encryption timed out'));
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
                    const result = message as EncryptV3Result;
                    const blob = result.encryptedBlob ?? new Blob([result.encryptedData!], { type: 'application/octet-stream' });
                    resolve({ blob, iv: result.iv, version: 3 });
                    break;
                }

                case 'error':
                    cleanup();
                    reject(new Error((message as EncryptErrorMessage).error));
                    break;
            }
        };

        const handleError = (error: ErrorEvent) => {
            cleanup();
            terminateEncryptWorker();
            reject(new Error(`Worker error: ${error.message}`));
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
            type: 'encrypt-v3',
            id: requestId,
            file,
            keyBytes: bytesToBase64(keyBytes),
        };

        worker.postMessage(request);
    });
}

/**
 * Encrypt V4 file in Worker
 */
function encryptV4InWorker(
    file: File,
    publicKey: HybridPublicKey,
    onProgress?: (progress: EncryptionProgress) => void,
    signal?: AbortSignal
): Promise<{ blob: Blob; metadata: CVEFMetadataV1_2; originalSize: number; version: 4 }> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }

        const worker = getWorker();
        if (!worker) {
            reject(new Error('Web Worker unavailable'));
            return;
        }

        const requestId = generateRequestId();

        const timeoutId = setTimeout(() => {
            cleanup();
            terminateEncryptWorker();
            reject(new Error('Worker encryption timed out'));
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
                    reject(new Error((message as EncryptErrorMessage).error));
                    break;
            }
        };

        const handleError = (error: ErrorEvent) => {
            cleanup();
            terminateEncryptWorker();
            reject(new Error(`Worker error: ${error.message}`));
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
 * Encrypt a file using V3 (Master Key AES-256-GCM).
 *
 * Uses Worker for files > 10MB, main thread otherwise.
 * Falls back to main thread if Worker unavailable.
 *
 * @param file - File to encrypt
 * @param keyBytes - Raw 32-byte AES key from deriveFileKeyWithBytes()
 * @param options - Optional progress callback
 */
export async function encryptFileV3(
    file: File,
    keyBytes: Uint8Array,
    options?: EncryptV3Options
): Promise<{ blob: Blob; iv: string; version: 3 }> {
    if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const useWorker = isWorkerSupported() && file.size > WORKER_THRESHOLD;

    if (useWorker) {
        try {
            return await encryptV3InWorker(file, keyBytes, options?.onProgress, options?.signal);
        } catch (err) {
            // Re-throw abort errors — don't fall back to main thread
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            // Worker failed — fall back to main thread
        }
    }

    // Main thread: reconstruct CryptoKey from raw bytes
    const keyBuffer = keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength
    ) as ArrayBuffer;

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );

    const result = await encryptFileWithKey(file, cryptoKey);
    return { blob: result.blob, iv: result.iv, version: 3 };
}

/**
 * Encrypt a file using V4 (Hybrid PQC X25519 + ML-KEM-768).
 *
 * Uses Worker for files > 10MB, main thread otherwise.
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
): Promise<{ blob: Blob; metadata: CVEFMetadataV1_2; originalSize: number; version: 4 }> {
    if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const useWorker = isWorkerSupported() && file.size > WORKER_THRESHOLD;

    if (useWorker) {
        try {
            return await encryptV4InWorker(file, publicKey, options?.onProgress, options?.signal);
        } catch (err) {
            // Re-throw abort errors — don't fall back to main thread
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            // Worker failed — fall back to main thread
        }
    }

    // Main thread fallback
    const result = await encryptFileHybridAuto(file, {
        publicKey,
        onProgress: options?.onProgress
            ? (p) => options.onProgress!({ percentage: p.percentage })
            : undefined,
    });

    return {
        blob: result.blob,
        metadata: result.metadata,
        originalSize: result.originalSize,
        version: 4,
    };
}
