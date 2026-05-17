/**
 * Web App Constants
 *
 * Centralized configuration values for the frontend.
 * Import from here instead of hardcoding magic numbers.
 */

// ============================================
// STREAMING & CHUNKING
// ============================================

export const STREAMING = {
  /** Files above this size use streaming encryption (50 MB) */
  THRESHOLD_BYTES: 50 * 1024 * 1024,

  /** Plaintext chunk size for the HMAC content fingerprint (4 MB).
   *  Larger chunks = fewer WebCrypto round-trips = faster fingerprint
   *  on mobile. Encryption uses CRYPTO_CONSTANTS.STREAMING_CHUNK_SIZE
   *  in @stenvault/shared, not this constant. */
  CHUNK_SIZE_BYTES: 4 * 1024 * 1024,
} as const;

// ============================================
// STREAMING VIDEO (Service Worker)
// ============================================

export const STREAMING_VIDEO = {
  /** Files above this size use SW streaming instead of blob decryption (100 MB) */
  SW_THRESHOLD_BYTES: 100 * 1024 * 1024,
} as const;

// ============================================
// MEDIA DECRYPTION
// ============================================

export const MEDIA = {
  /** Files above this size use Web Worker for decryption (10 MB) */
  WORKER_THRESHOLD_BYTES: 10 * 1024 * 1024,

  /** Maximum time to wait for worker response (5 min) */
  WORKER_TIMEOUT_MS: 5 * 60 * 1000,

  /** Maximum file size for fallback clone decryption (100 MB) */
  FALLBACK_MAX_SIZE_BYTES: 100 * 1024 * 1024,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

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

// ============================================
// FILE TRANSFER
// ============================================

export const FILE_TRANSFER = {
  /** Speed calculation rolling window size */
  SPEED_WINDOW_SIZE: 10,
} as const;
