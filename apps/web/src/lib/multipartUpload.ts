/**
 * Multipart Upload Utility
 *
 * Handles large file uploads (> 500MB) by splitting them into parts
 * and uploading each part separately to avoid timeout issues.
 * Supports concurrent uploads (default 3) for better throughput.
 *
 * @module multipartUpload
 */

import { debugLog } from '@/lib/debugLogger';

/** Maximum concurrent part uploads — matches Send V2's MAX_CONCURRENT. Four
 *  parallel PUTs saturates a ~400 Mbit home connection without exhausting the
 *  browser's 6-per-origin socket budget. */
const MAX_CONCURRENT = 4;

/** Per-part retry attempts on transient failures (network drop, 5xx). */
const MAX_PART_RETRIES = 3;

/** Base backoff between retries — actual delay is BASE * 2^attempt (1s, 2s, 4s). */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Decide whether a thrown uploadPart error is worth retrying.
 *
 * Retry: network errors (xhr.error event) and 5xx server errors — these are
 * the classic transient mobile failure modes (4G handoff, server hiccup).
 *
 * Don't retry: 403 (typically presigned URL expiry or auth) and other 4xx —
 * retrying just hides the real problem from the caller.
 */
function isRetryablePartError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message;
    if (msg.includes('network error')) return true;
    const statusMatch = /failed: (\d{3})/.exec(msg);
    if (statusMatch) {
        const status = parseInt(statusMatch[1]!, 10);
        return status >= 500 && status < 600;
    }
    return false;
}

export interface MultipartConfig {
    threshold: number;
    partSize: number;
    maxParts: number;
}

export interface MultipartProgress {
    phase: 'preparing' | 'uploading' | 'completing';
    currentPart: number;
    totalParts: number;
    bytesUploaded: number;
    totalBytes: number;
    percentage: number;
}

export interface UploadPartResult {
    partNumber: number;
    etag: string;
}

/**
 * Check if a file should use multipart upload
 */
export function shouldUseMultipart(fileSize: number, threshold: number): boolean {
    return fileSize > threshold;
}

/**
 * Calculate parts for a file
 */
export function calculateParts(fileSize: number, partSize: number): { start: number; end: number; partNumber: number }[] {
    const parts: { start: number; end: number; partNumber: number }[] = [];
    let offset = 0;
    let partNumber = 1;

    while (offset < fileSize) {
        const end = Math.min(offset + partSize, fileSize);
        parts.push({
            start: offset,
            end,
            partNumber,
        });
        offset = end;
        partNumber++;
    }

    return parts;
}

/**
 * Upload a single part to R2
 * Returns the ETag from the response header
 */
export async function uploadPart(
    blob: Blob,
    start: number,
    end: number,
    uploadUrl: string,
    onProgress?: (loaded: number, total: number) => void
): Promise<string> {
    const partBlob = blob.slice(start, end);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
                onProgress(event.loaded, event.total);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // Get ETag from response header
                const etag = xhr.getResponseHeader('ETag');
                if (etag) {
                    // Remove quotes if present
                    resolve(etag.replace(/"/g, ''));
                } else {
                    reject(new Error('No ETag in response'));
                }
            } else {
                reject(new Error(`Part upload failed: ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Part upload failed - network error'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.send(partBlob);
    });
}

/**
 * Perform a complete multipart upload with concurrent part uploads.
 * Uses a semaphore pattern to limit concurrency to MAX_CONCURRENT.
 * Results array is pre-allocated to preserve part ordering.
 *
 * Resume support: pass `skipPartNumbers` + `prefilledParts` (paired) to
 * recover an upload after a transient failure. The encrypted blob is
 * deterministic for a given (fileKey, baseIv) so the bytes already in R2
 * for those part numbers are byte-identical to what we'd re-upload —
 * skipping them is safe and saves the round trip.
 */
export async function performMultipartUpload(
    blob: Blob,
    config: {
        partSize: number;
        getPartUrl: (partNumber: number, partSize: number) => Promise<string>;
        onProgress?: (progress: MultipartProgress) => void;
        /** Per-part completion hook — fires once a part lands. Used by the
         *  upload-resume layer to persist completedParts every Nth part. */
        onPartComplete?: (parts: ReadonlyArray<UploadPartResult>) => void;
        /** Part numbers already uploaded to R2 (from queryMultipartStatus). */
        skipPartNumbers?: ReadonlyArray<number>;
        /** ETags for the skipped parts; one entry per skipPartNumbers entry. */
        prefilledParts?: ReadonlyArray<UploadPartResult>;
    }
): Promise<UploadPartResult[]> {
    const parts = calculateParts(blob.size, config.partSize);
    const results: UploadPartResult[] = new Array(parts.length);

    // Resolve skip set: either both args absent, or both must line up. A
    // mismatch is a caller bug — fail fast rather than silently dropping
    // ETags (which would poison completeMultipartUpload).
    const skipSet = new Set<number>();
    const prefilledByPart = new Map<number, string>();
    if (config.skipPartNumbers || config.prefilledParts) {
        const nums = config.skipPartNumbers ?? [];
        const etags = config.prefilledParts ?? [];
        if (nums.length !== etags.length) {
            throw new Error(
                `skipPartNumbers (${nums.length}) and prefilledParts (${etags.length}) must have the same length`,
            );
        }
        for (const p of etags) prefilledByPart.set(p.partNumber, p.etag);
        for (const n of nums) {
            if (!prefilledByPart.has(n)) {
                throw new Error(`skipPartNumbers entry ${n} has no matching prefilledParts ETag`);
            }
            skipSet.add(n);
        }
    }

    // Per-part progress tracking for accurate aggregate %
    const partProgress: number[] = new Array(parts.length).fill(0);

    // Seed progress for already-completed parts so the bar doesn't climb
    // from zero while workers re-iterate over them.
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (skipSet.has(part.partNumber)) {
            partProgress[i] = part.end - part.start;
        }
    }

    const reportProgress = () => {
        const bytesUploaded = partProgress.reduce((sum, v) => sum + v, 0);
        const completedCount = partProgress.filter((v, i) => {
            const p = parts[i];
            return p != null && v >= (p.end - p.start);
        }).length;
        config.onProgress?.({
            phase: 'uploading',
            currentPart: completedCount,
            totalParts: parts.length,
            bytesUploaded,
            totalBytes: blob.size,
            percentage: Math.round((bytesUploaded / blob.size) * 100),
        });
    };

    reportProgress();

    // Semaphore-based concurrent upload with early abort
    let nextIdx = 0;
    const errors: Error[] = [];
    let aborted = false;

    async function uploadNext(): Promise<void> {
        while (nextIdx < parts.length && !aborted) {
            const idx = nextIdx++;
            const part = parts[idx]!;
            const partSize = part.end - part.start;

            // Resume fast-path: R2 already has this part. Use the prefilled
            // ETag verbatim (the encrypted blob is deterministic for a given
            // fileKey + baseIv, so what we'd re-upload would be byte-identical).
            if (skipSet.has(part.partNumber)) {
                const prefilledEtag = prefilledByPart.get(part.partNumber)!;
                results[idx] = { partNumber: part.partNumber, etag: prefilledEtag };
                debugLog('[part]', `Part ${part.partNumber}/${parts.length} skipped — already in R2`);
                config.onPartComplete?.(results.filter((r): r is UploadPartResult => r !== undefined));
                continue;
            }

            let etag: string | undefined;
            let lastError: unknown;
            for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
                if (aborted) return;

                // Mint a fresh URL on every attempt: the presigned URL has a
                // 1h TTL and a flaky 4G/5G upload can outlive that for a single
                // 100MB part. Cheap to re-sign; expensive to fail at the end.
                const uploadUrl = await config.getPartUrl(part.partNumber, partSize);

                if (aborted) return;

                try {
                    etag = await uploadPart(
                        blob,
                        part.start,
                        part.end,
                        uploadUrl,
                        (loaded) => {
                            partProgress[idx] = loaded;
                            reportProgress();
                        },
                    );
                    break;
                } catch (err) {
                    lastError = err;
                    if (!isRetryablePartError(err) || attempt === MAX_PART_RETRIES - 1) {
                        throw err;
                    }
                    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                    debugLog('[part]', `Part ${part.partNumber} attempt ${attempt + 1}/${MAX_PART_RETRIES} failed (transient), retrying in ${delay}ms`);
                    // Reset progress for this part — next attempt re-uploads from 0
                    partProgress[idx] = 0;
                    reportProgress();
                    await new Promise((r) => setTimeout(r, delay));
                }
            }

            if (etag === undefined) {
                throw lastError ?? new Error(`Part ${part.partNumber} failed after ${MAX_PART_RETRIES} attempts`);
            }

            partProgress[idx] = partSize;
            results[idx] = { partNumber: part.partNumber, etag };

            debugLog('[part]', `Part ${part.partNumber}/${parts.length} uploaded (${Math.round(partSize / 1024 / 1024)}MB)`);
            config.onPartComplete?.(results.filter((r): r is UploadPartResult => r !== undefined));
        }
    }

    // Launch up to MAX_CONCURRENT workers — abort all on first failure
    const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT, parts.length) },
        () => uploadNext().catch((err) => { aborted = true; errors.push(err); }),
    );

    await Promise.all(workers);

    if (errors.length > 0) {
        throw errors[0];
    }

    config.onProgress?.({
        phase: 'completing',
        currentPart: parts.length,
        totalParts: parts.length,
        bytesUploaded: blob.size,
        totalBytes: blob.size,
        percentage: 100,
    });

    return results;
}
