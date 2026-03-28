/**
 * Content Fingerprint Web Worker
 *
 * Computes streaming HMAC-SHA-256 fingerprints off the main thread.
 * Uses chunked SHA-256 digests to avoid loading the entire file into memory.
 *
 * Algorithm (v2):
 *   1. Read file in CHUNK_SIZE chunks via File.slice()
 *   2. SHA-256 each chunk (32-byte digest)
 *   3. Concatenate all digests
 *   4. HMAC-SHA-256(fpKey, concatenatedDigests) → 64-char hex
 *
 * Memory: O(numChunks * 32 bytes) — ~512KB for a 1GB file.
 *
 * @module fingerprint.worker
 */

// ============ Message Types ============

export interface FingerprintRequest {
    type: 'compute';
    id: string;
    file: File;
    key: CryptoKey;
    chunkSize: number;
}

export interface FingerprintProgressMessage {
    type: 'progress';
    id: string;
    percentage: number;
}

export interface FingerprintResultMessage {
    type: 'result';
    id: string;
    hash: string;
}

export interface FingerprintErrorMessage {
    type: 'error';
    id: string;
    message: string;
}

export type FingerprintWorkerMessage =
    | FingerprintProgressMessage
    | FingerprintResultMessage
    | FingerprintErrorMessage;

// ============ Worker Logic ============

async function computeChunkedFingerprint(
    file: File,
    key: CryptoKey,
    chunkSize: number,
    id: string,
): Promise<string> {
    const totalSize = file.size;
    const digests: ArrayBuffer[] = [];

    let offset = 0;
    while (offset < totalSize) {
        const end = Math.min(offset + chunkSize, totalSize);
        const chunk = file.slice(offset, end);
        const chunkData = await chunk.arrayBuffer();

        const digest = await crypto.subtle.digest('SHA-256', chunkData);
        digests.push(digest);

        offset = end;

        const percentage = Math.round((offset / totalSize) * 100);
        self.postMessage({ type: 'progress', id, percentage } satisfies FingerprintProgressMessage);
    }

    // Concatenate all 32-byte digests into a single buffer
    const totalDigestBytes = digests.length * 32;
    const concatenated = new Uint8Array(totalDigestBytes);
    for (let i = 0; i < digests.length; i++) {
        concatenated.set(new Uint8Array(digests[i]!), i * 32);
    }

    // Final HMAC-SHA-256 with user-scoped key
    const signature = await crypto.subtle.sign('HMAC', key, concatenated.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// ============ Message Handler ============

self.onmessage = async (event: MessageEvent<FingerprintRequest>) => {
    const { type, id, file, key, chunkSize } = event.data;

    if (type !== 'compute') return;

    try {
        const hash = await computeChunkedFingerprint(file, key, chunkSize, id);
        self.postMessage({ type: 'result', id, hash } satisfies FingerprintResultMessage);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Fingerprint computation failed';
        self.postMessage({ type: 'error', id, message } satisfies FingerprintErrorMessage);
    }
};

// Signal ready (no WASM to load, but keep pattern for consistency)
self.postMessage({ type: 'ready' });
