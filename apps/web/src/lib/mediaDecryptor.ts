/**
 * Media Decryptor
 * 
 * Main thread interface for decrypting media files using Web Worker.
 * Provides non-blocking decryption for large files while falling back
 * to main thread for small files where Worker overhead isn't worth it.
 * 
 * Architecture:
 * - Threshold-based: uses Worker for files > WORKER_THRESHOLD
 * - Progress callbacks via Worker postMessage
 * - Automatic Blob URL creation and cleanup
 * - Fallback to main thread if Worker unavailable
 * 
 * @module mediaDecryptor
 */

import type {
    DecryptRequest,
    WorkerMessage,
    ProgressMessage,
    ResultMessage,
    ErrorMessage
} from './workers/mediaDecryptor.worker';
import { arrayBufferToBase64, toArrayBuffer } from '@/lib/platform';


/** Use Worker for files larger than this (10MB) */
const WORKER_THRESHOLD = 10 * 1024 * 1024;

/** Maximum time to wait for Worker response (5 minutes for very large files) */
const WORKER_TIMEOUT_MS = 5 * 60 * 1000;


export interface DecryptionProgress {
    percentage: number;
    bytesProcessed: number;
    totalBytes: number;
}

export interface MediaDecryptorOptions {
    onProgress?: (progress: DecryptionProgress) => void;
}

export interface DecryptedMedia {
    /** Blob containing decrypted media data */
    blob: Blob;
    /** Blob URL for use in media elements */
    url: string;
    /** Call this to revoke the Blob URL and free memory */
    cleanup: () => void;
}


let workerInstance: Worker | null = null;
let workerSupported: boolean | null = null;

/**
 * Check if Web Workers are supported
 */
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
                new URL('./workers/mediaDecryptor.worker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch {
            // Worker construction failed (CSP, module resolution, etc.)
            // Caller will fall back to main thread
            return null;
        }
    }
    return workerInstance;
}

/**
 * Terminate the Worker (call on app unmount if needed)
 */
export function terminateWorker(): void {
    if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
    }
}


/**
 * Generate unique request ID
 */
function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}


/**
 * Decrypt data on main thread (for small files or when Worker unavailable)
 */
async function decryptOnMainThread(
    encryptedData: ArrayBuffer,
    keyBytes: Uint8Array,
    iv: Uint8Array,
    onProgress?: (progress: DecryptionProgress) => void
): Promise<ArrayBuffer> {
    // Report start
    onProgress?.({
        percentage: 5,
        bytesProcessed: 0,
        totalBytes: encryptedData.byteLength,
    });

    // Import key - ensure clean ArrayBuffer for strict mode
    const keyBuffer = keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength
    ) as ArrayBuffer;

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );

    onProgress?.({
        percentage: 20,
        bytesProcessed: 0,
        totalBytes: encryptedData.byteLength,
    });

    // Decrypt - ensure clean ArrayBuffer for strict mode
    const ivBuffer = iv.buffer.slice(
        iv.byteOffset,
        iv.byteOffset + iv.byteLength
    ) as ArrayBuffer;

    let decryptedData: ArrayBuffer;
    try {
        decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer },
            cryptoKey,
            encryptedData
        );
    } catch {
        throw new Error('File decryption failed: invalid key or corrupted data');
    }

    onProgress?.({
        percentage: 100,
        bytesProcessed: decryptedData.byteLength,
        totalBytes: encryptedData.byteLength,
    });

    return decryptedData;
}


/**
 * Decrypt data using Web Worker
 */
function decryptInWorker(
    encryptedData: ArrayBuffer,
    keyBytesBase64: string,
    ivBase64: string,
    version: number,
    onProgress?: (progress: DecryptionProgress) => void
): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const worker = getWorker();
        if (!worker) {
            reject(new Error('Web Worker unavailable. Falling back to main thread.'));
            return;
        }

        const requestId = generateRequestId();

        // Timeout handler - terminate dead Worker on timeout
        const timeoutId = setTimeout(() => {
            cleanup();
            terminateWorker();
            reject(new Error('Worker decryption timed out. The file may be too large or the browser ran out of memory.'));
        }, WORKER_TIMEOUT_MS);

        // Message handler
        const handleMessage = (event: MessageEvent<WorkerMessage | { type: 'ready' }>) => {
            const message = event.data;

            // Ignore ready messages
            if (message.type === 'ready') return;

            // Only process messages for this request
            if ('id' in message && message.id !== requestId) return;

            switch (message.type) {
                case 'progress':
                    onProgress?.({
                        percentage: message.percentage,
                        bytesProcessed: message.bytesProcessed,
                        totalBytes: message.totalBytes,
                    });
                    break;

                case 'result':
                    cleanup();
                    resolve(message.decryptedData);
                    break;

                case 'error':
                    cleanup();
                    reject(new Error(message.error));
                    break;

                default:
                    // Unknown message type - ignore but log for debugging
                    break;
            }
        };

        // Error handler - Worker crashed, terminate and reset for next use
        const handleError = (error: ErrorEvent) => {
            cleanup();
            terminateWorker();
            reject(new Error(`Worker error: ${error.message}`));
        };

        // Cleanup function (listeners only - does not terminate Worker)
        const cleanup = () => {
            clearTimeout(timeoutId);
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
        };

        // Attach handlers
        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        // Send decryption request with Transferable
        const request: DecryptRequest = {
            type: 'decrypt',
            id: requestId,
            encryptedData,
            keyBytes: keyBytesBase64,
            iv: ivBase64,
            version,
        };

        worker.postMessage(request, [encryptedData]);
    });
}


/**
 * Check if a file should use Worker-based decryption
 */
export function shouldUseWorker(fileSize: number): boolean {
    return isWorkerSupported() && fileSize > WORKER_THRESHOLD;
}

/**
 * Get the Worker threshold in bytes
 */
export function getWorkerThreshold(): number {
    return WORKER_THRESHOLD;
}

/**
 * Decrypt media data
 * 
 * Automatically chooses between Worker and main thread based on file size.
 * Creates a Blob URL for use in media elements.
 * 
 * @param encryptedData - Encrypted file data
 * @param keyBytes - Raw AES-256 key bytes (32 bytes)
 * @param iv - Raw IV bytes (12 bytes for GCM)
 * @param mimeType - MIME type for the resulting Blob
 * @param version - Encryption version (3 = Master Key, 4 = Hybrid)
 * @param options - Optional progress callback
 * @returns Decrypted media with Blob, URL, and cleanup function
 * 
 * @example
 * ```typescript
 * const result = await decryptMedia(
 *   encryptedBuffer,
 *   keyBytes,
 *   ivBytes,
 *   'video/mp4',
 *   4,
 *   { onProgress: (p) => console.log(`${p.percentage}%`) }
 * );
 * 
 * videoElement.src = result.url;
 * 
 * // When done:
 * result.cleanup();
 * ```
 */
export async function decryptMedia(
    encryptedData: ArrayBuffer,
    keyBytes: Uint8Array,
    iv: Uint8Array,
    mimeType: string,
    version: number = 3,
    options?: MediaDecryptorOptions
): Promise<DecryptedMedia> {
    const { onProgress } = options ?? {};
    const fileSize = encryptedData.byteLength;

    let decryptedData: ArrayBuffer;

    if (shouldUseWorker(fileSize)) {
        // Use Worker for large files, with main thread fallback.
        // Clone the buffer BEFORE transfer so we can fall back to main thread
        // if the Worker fails after receiving the Transferable (which neuters the original).
        // Skip clone for very large files (>100MB) to avoid doubling memory usage.
        const MAX_FALLBACK_CLONE_SIZE = 100 * 1024 * 1024;
        const fallbackCopy = fileSize <= MAX_FALLBACK_CLONE_SIZE
            ? encryptedData.slice(0)
            : null;

        try {
            const keyBytesBase64 = arrayBufferToBase64(toArrayBuffer(keyBytes));
            const ivBase64 = arrayBufferToBase64(toArrayBuffer(iv));

            decryptedData = await decryptInWorker(
                encryptedData,
                keyBytesBase64,
                ivBase64,
                version,
                onProgress
            );
        } catch (workerErr) {
            // Worker failed - fall back to main thread if we have a cloned copy
            if (!fallbackCopy) {
                throw workerErr;
            }
            decryptedData = await decryptOnMainThread(fallbackCopy, keyBytes, iv, onProgress);
        }
    } else {
        // Use main thread for small files
        decryptedData = await decryptOnMainThread(
            encryptedData,
            keyBytes,
            iv,
            onProgress
        );
    }

    // Create Blob and URL
    const blob = new Blob([decryptedData], { type: mimeType });
    const url = URL.createObjectURL(blob);

    // Return with cleanup function
    return {
        blob,
        url,
        cleanup: () => {
            URL.revokeObjectURL(url);
        },
    };
}

/**
 * Decrypt media from URL
 * 
 * Fetches encrypted data from URL, decrypts, and returns Blob URL.
 * 
 * @param url - URL to fetch encrypted data from
 * @param keyBytes - Raw AES-256 key bytes
 * @param iv - Raw IV bytes
 * @param mimeType - MIME type for the resulting Blob
 * @param version - Encryption version
 * @param options - Optional progress callback
 */
export async function decryptMediaFromUrl(
    url: string,
    keyBytes: Uint8Array,
    iv: Uint8Array,
    mimeType: string,
    version: number = 3,
    options?: MediaDecryptorOptions
): Promise<DecryptedMedia> {
    // Progress: fetching
    options?.onProgress?.({
        percentage: 0,
        bytesProcessed: 0,
        totalBytes: 0,
    });

    // Fetch encrypted data
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch encrypted media: ${response.status}`);
    }

    const encryptedData = await response.arrayBuffer();

    // Decrypt
    return decryptMedia(encryptedData, keyBytes, iv, mimeType, version, options);
}
