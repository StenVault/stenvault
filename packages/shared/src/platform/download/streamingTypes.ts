/**
 * Streaming Download Types
 *
 * Types for the tiered streaming download infrastructure.
 * Enables streaming decrypted data directly to disk instead of
 * accumulating in RAM.
 */

/** Progress information for streaming downloads */
export interface StreamingDownloadProgress {
  bytesWritten: number;
  totalBytes: number;
  percentage: number;
}

/** Options for streaming download to disk */
export interface StreamingDownloadOptions {
  filename: string;
  totalSize?: number;
  mimeType?: string;
  onProgress?: (progress: StreamingDownloadProgress) => void;
  signal?: AbortSignal;
}

/** Which streaming tier is being used */
export type StreamingTier = 'file-system-access' | 'service-worker' | 'blob-fallback';

/** Result of a streaming download */
export interface StreamingDownloadResult {
  tier: StreamingTier;
  bytesWritten: number;
}
