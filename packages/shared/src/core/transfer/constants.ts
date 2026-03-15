/**
 * Transfer Constants
 * 
 * Shared constants for file transfer operations.
 * These values are used by both Web and Mobile implementations.
 * 
 * @module @stenvault/shared/core/transfer
 */

// ============ Chunking Constants ============

/**
 * Default chunk size: 256KB
 * Optimal for WebRTC DataChannel which has ~256KB buffer limit
 */
export const DEFAULT_CHUNK_SIZE = 256 * 1024;

/**
 * Maximum concurrent chunk requests for parallel downloads
 */
export const MAX_CONCURRENT_CHUNKS = 4;

/**
 * Hash algorithm for chunk verification
 */
export const HASH_ALGORITHM = 'SHA-256';

// ============ WebRTC Constants ============

/**
 * WebRTC DataChannel chunk size: 64KB
 * Optimal for flow control over DataChannel
 */
export const WEBRTC_CHUNK_SIZE = 64 * 1024;

/**
 * WebRTC DataChannel buffer threshold: 1MB
 * Pause sending when bufferedAmount exceeds this
 */
export const WEBRTC_BUFFER_THRESHOLD = 1024 * 1024;

// ============ Streaming Crypto Constants ============

/**
 * PBKDF2 iterations (OWASP 2024 recommendation)
 */
export const PBKDF2_ITERATIONS = 600_000;

/**
 * AES key length in bits
 */
export const KEY_LENGTH = 256;

/**
 * Salt length in bytes
 */
export const SALT_LENGTH = 32;

/**
 * Streaming chunk size: 64KB
 * Optimal for memory-efficient encryption
 */
export const STREAMING_CHUNK_SIZE = 64 * 1024;

/**
 * Threshold above which streaming encryption should be used
 */
export const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

/**
 * Current encryption format version (v3 = Master Key, v4 = Hybrid PQC)
 */
export const ENCRYPTION_VERSION = 3;

// ============ Chunk Size Thresholds ============

/**
 * Optimal chunk sizes based on file size
 */
export const CHUNK_SIZE_THRESHOLDS = {
    /** Files < 1MB: use 64KB chunks */
    SMALL: { maxSize: 1 * 1024 * 1024, chunkSize: 64 * 1024 },
    /** Files < 100MB: use 256KB chunks */
    MEDIUM: { maxSize: 100 * 1024 * 1024, chunkSize: 256 * 1024 },
    /** Files < 1GB: use 1MB chunks */
    LARGE: { maxSize: 1024 * 1024 * 1024, chunkSize: 1024 * 1024 },
    /** Files >= 1GB: use 2MB chunks */
    HUGE: { chunkSize: 2 * 1024 * 1024 },
} as const;

// ============ Timeouts ============

/**
 * Chunk request timeout in milliseconds
 */
export const CHUNK_REQUEST_TIMEOUT = 30_000; // 30 seconds

/**
 * Connection retry attempts
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Delay between retry attempts (ms)
 */
export const RETRY_DELAY = 1_000; // 1 second
