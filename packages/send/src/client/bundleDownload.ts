/// <reference lib="dom" />
/**
 * Download-all-as-ZIP pipeline for Send V2 bundles.
 *
 * Consumer supplies the per-file manifest (sizes, chunk hashes, HMACs)
 * plus a callback that mints a presigned URL for a given fileIndex (via
 * `getFileDownloadUrl` — the server gates that with `downloadToken` so
 * anonymous receivers can't bypass password checks here).
 *
 * This module composes three streams per file:
 *
 *   fetch(url)         ReadableStream<Uint8Array>  (encrypted bytes from R2)
 *     → decryptPublicSendStream                    (AES-GCM per chunk)
 *     → client-zip makeZip                         (zip framing)
 *
 * client-zip is driven by an async iterable — we yield one file at a
 * time so the encrypted fetch for file N+1 doesn't start until file N
 * has been fully consumed by the zip writer. Peak memory stays at one
 * encrypted chunk (~5 MB) + client-zip's internal framing buffer.
 *
 * Why client-zip (not fflate): fflate's ZIP writer needs a
 * one-call-per-chunk API that's awkward to drive from a ReadableStream.
 * client-zip takes a `ReadableStream` as an input directly. The size
 * hint avoids zip64-everywhere, which keeps the zip readable by older
 * extractors.
 */
import { makeZip, predictLength } from "client-zip";
import { decryptPublicSendStream } from "./streamDecrypt";

/**
 * Exact byte length of the ZIP that {@link buildBundleZipStream} will
 * emit for the given files. Needed so the SW download response can set
 * `Content-Length` precisely — a low value truncates the Central
 * Directory + EOCD and produces a corrupt `.zip` (Firefox honours
 * Content-Length strictly). Returns `number` because our per-file caps
 * (`SEND_FILE_SIZE_TIERS.PRO` = 25 GB × 65535 files = well within
 * Number.MAX_SAFE_INTEGER) keep us inside the safe-integer range.
 */
export function predictBundleZipSize(
    files: ReadonlyArray<{ name: string; size: number }>,
): number {
    const total = predictLength(files.map((f) => ({ name: f.name, size: BigInt(f.size) })));
    return Number(total);
}

export interface BundleDownloadFile {
    fileIndex: number;
    /** Deduplicated display name. Used verbatim as the zip entry path. */
    name: string;
    /** Plaintext size — fed to client-zip so the ZIP header is not zip64-everywhere. */
    size: number;
    mimeType: string;
    totalParts: number;
    partSize: number;
    chunkHashes: string | null;
    chunkManifestHmac: string | null;
}

export interface BuildBundleZipStreamParams {
    key: CryptoKey;
    /** Base64 chunkBaseIv shared across every file in the bundle. */
    chunkBaseIv: string;
    /** Auth-tag overhead per chunk — same for every file. */
    encryptionOverhead: number;
    files: ReadonlyArray<BundleDownloadFile>;
    /**
     * Mint a presigned download URL for a specific file. Typically wraps
     * `getFileDownloadUrl({sessionId, fileIndex, downloadToken})`.
     */
    getFileUrl: (fileIndex: number) => Promise<string>;
    signal?: AbortSignal;
    /**
     * Called when a file transitions from "pending" to "downloading".
     * `filesDone` is the count of files fully piped into the zip (0 when
     * the first file starts).
     */
    onFileStarted?: (file: BundleDownloadFile, filesDone: number) => void;
    /**
     * Called on every decrypted chunk of the file currently being zipped.
     * Progress is scoped to the current file — combine with `filesDone`
     * for a bundle-level bar.
     */
    onFileChunkProgress?: (
        file: BundleDownloadFile,
        chunkIndex: number,
        totalChunks: number,
    ) => void;
    /** Called when a file is fully consumed by the zip writer. */
    onFileCompleted?: (file: BundleDownloadFile, filesDone: number) => void;
}

/**
 * Compose per-file decryption streams into a single ZIP stream.
 *
 * The returned stream closes after every file has been written and the
 * ZIP central directory is finalised. Consumers pipe it into their
 * platform's streaming-to-disk helper.
 */
export function buildBundleZipStream(
    params: BuildBundleZipStreamParams,
): ReadableStream<Uint8Array> {
    const {
        key,
        chunkBaseIv,
        encryptionOverhead,
        files,
        getFileUrl,
        signal,
        onFileStarted,
        onFileChunkProgress,
        onFileCompleted,
    } = params;

    // Lazy async iterable — client-zip pulls the next file only after the
    // previous one's stream has closed, so `fetch` for file N+1 doesn't
    // fire until file N is fully consumed. Serial by construction.
    async function* iterFiles(): AsyncGenerator<{
        name: string;
        input: ReadableStream<Uint8Array>;
        size: number;
    }> {
        let filesDone = 0;
        for (const file of files) {
            if (signal?.aborted) {
                throw new DOMException("Download aborted", "AbortError");
            }

            onFileStarted?.(file, filesDone);

            const url = await getFileUrl(file.fileIndex);
            const response = await fetch(url, { signal });
            if (!response.ok || !response.body) {
                throw new Error(
                    `Download failed for ${file.name}: ${response.status} ${response.statusText}`,
                );
            }

            const decrypted = decryptPublicSendStream(response.body, {
                key,
                fileSize: file.size,
                totalParts: file.totalParts,
                chunkSize: file.partSize,
                encryptionOverhead,
                fileIndex: file.fileIndex,
                expectedChunkHashes: file.chunkHashes,
                expectedManifest: file.chunkManifestHmac,
                chunkBaseIv,
                signal,
                onProgress: (chunkIndex, totalChunks) => {
                    onFileChunkProgress?.(file, chunkIndex, totalChunks);
                },
            });

            // Wrap the decrypted stream so we can observe when client-zip
            // has finished reading this file (vs. still reading an earlier
            // one). Without this hook `onFileCompleted` would only fire
            // after the whole bundle zipped.
            const observed = new ReadableStream<Uint8Array>({
                async start(controller) {
                    const reader = decrypted.getReader();
                    try {
                        while (true) {
                            if (signal?.aborted) {
                                throw new DOMException("Download aborted", "AbortError");
                            }
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value);
                        }
                        controller.close();
                    } catch (err) {
                        controller.error(err);
                    } finally {
                        reader.releaseLock();
                    }
                },
                cancel(reason) {
                    decrypted.cancel(reason).catch(() => {});
                },
            });

            yield { name: file.name, input: observed, size: file.size };

            filesDone++;
            onFileCompleted?.(file, filesDone);
        }
    }

    return makeZip(iterFiles());
}
