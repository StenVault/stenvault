/// <reference lib="dom" />
/**
 * Orchestration for V2 per-file bundle uploads.
 *
 * Walks the bundle's files sequentially, routing each one through
 * {@link uploadEncryptedSend}. The caller mints the initial part URL
 * batch for file 0 on initiateBundle; every other file (and every
 * refill) goes through `refreshPartUrls` which the caller wires to
 * `signSendParts` (fileIndex-aware).
 *
 * Why sequential and not parallel per-file: the browser's 6-per-origin
 * socket cap and the main-thread encryption budget are the real
 * bottlenecks, and within a single file we already drive 4 parallel
 * part uploads. Parallelising across files on top buys little and
 * makes progress aggregation fragile. Step 4 ships sequential;
 * parallel-across-files is a follow-up.
 */
import {
    uploadEncryptedSend,
    type SendUploadPart,
    type SendUploadPartUrl,
    type UploadEncryptedSendResult,
} from "./upload";

export interface BundleFileToUpload {
    fileIndex: number;
    fileBlob: Blob;
    totalParts: number;
    /** Pre-filled initial URLs for this file. Only file 0 typically has
     *  these (from initiateBundle); others come back empty and get
     *  fetched on demand via `refreshPartUrls`. */
    initialPartUrls: ReadonlyArray<SendUploadPartUrl>;
    /** Resume state — parts already landed in R2. */
    skipPartNumbers?: ReadonlyArray<number>;
    prefilledParts?: ReadonlyArray<SendUploadPart>;
}

export interface UploadBundleParams {
    files: ReadonlyArray<BundleFileToUpload>;
    key: CryptoKey;
    baseIv: Uint8Array;
    /** Request fresh presigned URLs for a given file's part numbers.
     *  Caller typically wraps `signSendParts({sessionId, uploadSecret, fileIndex, partNumbers})`. */
    refreshPartUrls: (
        fileIndex: number,
        partNumbers: number[],
    ) => Promise<ReadonlyArray<SendUploadPartUrl>>;
    abortSignal: { readonly aborted: boolean };
    /** Aggregated progress across all files (0–100). */
    onProgress: (percentage: number) => void;
    onSpeed: (bytesPerSec: number, etaSeconds: number) => void;
    /** Called when a file transitions from "pending" to "uploading". */
    onFileStarted?: (fileIndex: number) => void;
    /** Called when a file's upload+encrypt completes (no rollback). */
    onFileCompleted?: (fileIndex: number, parts: ReadonlyArray<SendUploadPart>) => void;
    /** Called after each part within the active file lands. */
    onPartComplete?: (fileIndex: number, parts: ReadonlyArray<SendUploadPart>) => void;
}

export interface BundleFileResult {
    fileIndex: number;
    parts: SendUploadPart[];
    chunkHashes: string[];
}

export interface UploadBundleResult {
    files: BundleFileResult[];
}

/**
 * Drive the upload of a V2 bundle. Each file is encrypted + uploaded
 * in sequence, with the aggregate progress bar reflecting the whole
 * bundle rather than any single file.
 *
 * Throws the first file's error verbatim — callers handle classification
 * (abort, network, R2 fatal, etc.) the same way they did in V1.
 */
export async function uploadBundle(params: UploadBundleParams): Promise<UploadBundleResult> {
    const {
        files,
        key,
        baseIv,
        refreshPartUrls,
        abortSignal,
        onProgress,
        onSpeed,
        onFileStarted,
        onFileCompleted,
        onPartComplete,
    } = params;

    const totalBundleBytes = files.reduce((s, f) => s + f.fileBlob.size, 0);
    let bytesCompletedInPriorFiles = 0;
    let speedBytesPerSec = 0;

    const results: BundleFileResult[] = [];

    for (const file of files) {
        if (abortSignal.aborted) throw new Error("Upload cancelled");
        onFileStarted?.(file.fileIndex);

        // Per-file progress proxy — translates the file-local percentage
        // (0..100) into the aggregate bundle percentage.
        const fileBytes = file.fileBlob.size;
        const fileProgress = (filePercentage: number) => {
            const fileBytesAssumedDone = (filePercentage / 100) * fileBytes;
            const totalBytes = bytesCompletedInPriorFiles + fileBytesAssumedDone;
            onProgress(
                totalBundleBytes === 0
                    ? 0
                    : Math.min(100, Math.round((totalBytes / totalBundleBytes) * 100)),
            );
        };

        const result: UploadEncryptedSendResult = await uploadEncryptedSend({
            fileBlob: file.fileBlob,
            key,
            baseIv,
            fileIndex: file.fileIndex,
            initialPartUrls: file.initialPartUrls,
            totalParts: file.totalParts,
            refreshPartUrls: (partNumbers) => refreshPartUrls(file.fileIndex, partNumbers),
            abortSignal,
            onProgress: fileProgress,
            onSpeed: (bps, eta) => {
                speedBytesPerSec = bps;
                // Recompute ETA against the full bundle tail so the UI
                // number reflects time-to-bundle-done rather than time-
                // to-current-file-done.
                const totalBytesSoFar =
                    bytesCompletedInPriorFiles + (file.prefilledParts?.length ?? 0) * 0; // placeholder
                const remaining = totalBundleBytes - totalBytesSoFar;
                const bundleEta = speedBytesPerSec > 0 ? Math.ceil(remaining / speedBytesPerSec) : eta;
                onSpeed(speedBytesPerSec, bundleEta);
            },
            onPartComplete: (parts) => onPartComplete?.(file.fileIndex, parts),
            skipPartNumbers: file.skipPartNumbers,
            prefilledParts: file.prefilledParts,
        });

        results.push({
            fileIndex: file.fileIndex,
            parts: result.parts,
            chunkHashes: result.chunkHashes,
        });
        bytesCompletedInPriorFiles += fileBytes;
        onFileCompleted?.(file.fileIndex, result.parts);
    }

    // Ensure the bar reaches 100% even if the last emit was mid-file.
    onProgress(100);

    return { files: results };
}
