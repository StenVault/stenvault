/**
 * Web App Constants
 *
 * Centralized configuration values for the frontend.
 * Import from here instead of hardcoding magic numbers.
 */

// STREAMING & CHUNKING

export const STREAMING = {
  /** Files above this size use streaming encryption (50 MB) */
  THRESHOLD_BYTES: 50 * 1024 * 1024,

  /** Default encryption chunk size (64 KB) */
  CHUNK_SIZE_BYTES: 64 * 1024,
} as const;

// MEDIA DECRYPTION

export const MEDIA = {
  /** Files above this size use Web Worker for decryption (10 MB) */
  WORKER_THRESHOLD_BYTES: 10 * 1024 * 1024,

  /** Maximum time to wait for worker response (5 min) */
  WORKER_TIMEOUT_MS: 5 * 60 * 1000,

  /** Maximum file size for fallback clone decryption (100 MB) */
  FALLBACK_MAX_SIZE_BYTES: 100 * 1024 * 1024,
} as const;

// CACHE CONFIGURATION

export const CACHE = {
  /** Master key cache timeout (15 min) */
  MASTER_KEY_TIMEOUT_MS: 15 * 60 * 1000,

  /** Thumbnail cache max entries */
  THUMBNAIL_MAX_ENTRIES: 100,

  /** Thumbnail cache TTL (30 min) */
  THUMBNAIL_TTL_MS: 30 * 60 * 1000,

  /** Web storage max cache size (100 MB) */
  WEB_STORAGE_MAX_BYTES: 100 * 1024 * 1024,

  /** Web storage max cache entries */
  WEB_STORAGE_MAX_ENTRIES: 1000,

  /** Web storage quota limit (1 GB) */
  WEB_STORAGE_QUOTA_BYTES: 1024 * 1024 * 1024,
} as const;

// FILE TRANSFER

export const FILE_TRANSFER = {
  /** Chat file upload max size (100 MB) */
  CHAT_MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,

  /** P2P chunk batch max size for IndexedDB (5 MB) */
  CHUNK_BATCH_MAX_BYTES: 5 * 1024 * 1024,

  /** Speed calculation rolling window size */
  SPEED_WINDOW_SIZE: 10,
} as const;
