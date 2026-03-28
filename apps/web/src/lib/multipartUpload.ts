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

/** Maximum concurrent part uploads */
const MAX_CONCURRENT = 3;

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
 */
export async function performMultipartUpload(
    blob: Blob,
    config: {
        partSize: number;
        getPartUrl: (partNumber: number, partSize: number) => Promise<string>;
        onProgress?: (progress: MultipartProgress) => void;
    }
): Promise<UploadPartResult[]> {
    const parts = calculateParts(blob.size, config.partSize);
    const results: UploadPartResult[] = new Array(parts.length);

    // Per-part progress tracking for accurate aggregate %
    const partProgress: number[] = new Array(parts.length).fill(0);

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

    config.onProgress?.({
        phase: 'uploading',
        currentPart: 0,
        totalParts: parts.length,
        bytesUploaded: 0,
        totalBytes: blob.size,
        percentage: 0,
    });

    // Semaphore-based concurrent upload with early abort
    let nextIdx = 0;
    const errors: Error[] = [];
    let aborted = false;

    async function uploadNext(): Promise<void> {
        while (nextIdx < parts.length && !aborted) {
            const idx = nextIdx++;
            const part = parts[idx]!;
            const partSize = part.end - part.start;

            // Get presigned URL for this part
            const uploadUrl = await config.getPartUrl(part.partNumber, partSize);

            if (aborted) break;

            // Upload the part
            const etag = await uploadPart(
                blob,
                part.start,
                part.end,
                uploadUrl,
                (loaded) => {
                    partProgress[idx] = loaded;
                    reportProgress();
                },
            );

            partProgress[idx] = partSize;
            results[idx] = { partNumber: part.partNumber, etag };

            debugLog('📦', `Part ${part.partNumber}/${parts.length} uploaded (${Math.round(partSize / 1024 / 1024)}MB)`);
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
