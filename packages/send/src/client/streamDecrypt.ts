import { BufferedStreamReader } from "@stenvault/aead-stream";
import { base64ToArrayBuffer } from "@stenvault/shared/platform/crypto";
import { decryptSendChunk, hashEncryptedChunk, verifyChunkManifest } from "./crypto";

export interface DecryptPublicSendStreamOptions {
    key: CryptoKey;
    fileSize: number;
    totalParts: number;
    chunkSize: number;
    encryptionOverhead: number;
    /** File's position inside the V2 bundle. Threaded into the per-chunk IV
     *  so swapping files (or replaying chunks from a different file under
     *  the same session) fails GCM authentication. */
    fileIndex: number;
    onProgress?: (chunkIndex: number, totalParts: number) => void;
    signal?: AbortSignal;
    /** Colon-separated hex hashes produced at upload time, one per chunk. */
    expectedChunkHashes?: string | null;
    /** HMAC over the chunk-hash manifest. Verified after all chunks decrypt. */
    expectedManifest?: string | null;
    /** Base64 base IV; per-chunk IVs are derived from it + fileIndex + chunkIndex. */
    chunkBaseIv?: string | null;
}

/**
 * Streaming decrypt pipeline for a single Send V2 file.
 *
 * Reads the encrypted response body chunk-by-chunk, verifies each one's
 * AES-256-GCM auth tag (IV derived from `baseIv || fileIndex || chunkIndex`)
 * plus the uploader-supplied hash if present, then enqueues plaintext on
 * the output stream. Peak memory is one encrypted chunk (~5 MB) rather
 * than the whole file.
 *
 * For multi-file bundles the receiver calls this once per file with
 * distinct `fileIndex` values — the bundle-level orchestration (sequential
 * vs concurrent, zip assembly) lives above this layer.
 */
export function decryptPublicSendStream(
    encryptedStream: ReadableStream<Uint8Array>,
    options: DecryptPublicSendStreamOptions,
): ReadableStream<Uint8Array> {
    const {
        key,
        fileSize,
        totalParts,
        chunkSize,
        encryptionOverhead,
        fileIndex,
        onProgress,
        signal,
        expectedChunkHashes,
        expectedManifest,
        chunkBaseIv,
    } = options;

    const expectedHashes = expectedChunkHashes?.split(":") ?? null;
    const baseIv = chunkBaseIv ? new Uint8Array(base64ToArrayBuffer(chunkBaseIv)) : null;

    let rawReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                rawReader = encryptedStream.getReader();
                const reader = new BufferedStreamReader(rawReader);
                const computedHashes: string[] = [];

                for (let i = 0; i < totalParts; i++) {
                    if (signal?.aborted) {
                        controller.error(new DOMException("Download aborted", "AbortError"));
                        return;
                    }

                    const isLastPart = i === totalParts - 1;
                    const originalPartSize = isLastPart
                        ? fileSize - (totalParts - 1) * chunkSize
                        : chunkSize;
                    const encryptedPartSize = originalPartSize + encryptionOverhead;

                    const encryptedChunkData = await reader.readExact(encryptedPartSize);

                    if (expectedHashes && expectedHashes[i]) {
                        const actualHash = await hashEncryptedChunk(encryptedChunkData);
                        if (actualHash !== expectedHashes[i]) {
                            controller.error(new Error(`Chunk ${i} integrity check failed`));
                            return;
                        }
                        computedHashes.push(actualHash);
                    }

                    if (!baseIv) {
                        controller.error(new Error("Missing chunkBaseIv — cannot derive per-chunk IV"));
                        return;
                    }
                    const decrypted = await decryptSendChunk(encryptedChunkData, key, baseIv, fileIndex, i);
                    controller.enqueue(decrypted);
                    onProgress?.(i, totalParts);
                }

                if (expectedManifest && computedHashes.length === totalParts) {
                    const valid = await verifyChunkManifest(computedHashes, key, expectedManifest);
                    if (!valid) {
                        controller.error(new Error("Chunk manifest integrity check failed"));
                        return;
                    }
                }

                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
        cancel() {
            rawReader?.cancel().catch(() => { });
        },
    });
}
