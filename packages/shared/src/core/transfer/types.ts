/**
 * Transfer Types
 * 
 * Shared types for file transfer operations (chunked, streaming).
 * These types are platform-agnostic and used by both Web and Mobile.
 * 
 * @module @cloudvault/shared/core/transfer
 */


/**
 * Information about a single chunk in a file transfer
 */
export interface ChunkInfo {
    /** Zero-based index of this chunk */
    index: number;
    /** Byte offset from start of file */
    offset: number;
    /** Size of this chunk in bytes */
    size: number;
    /** SHA-256 hash for integrity verification */
    hash: string;
}

/**
 * File manifest containing metadata and chunk information
 * Used for BitTorrent-style resumable transfers
 */
export interface FileManifest {
    /** Original file name */
    fileName: string;
    /** Total file size in bytes */
    fileSize: number;
    /** MIME type of the file */
    fileType: string;
    /** Last modified timestamp (ms since epoch) */
    lastModified: number;
    /** Size of each chunk in bytes */
    chunkSize: number;
    /** Total number of chunks */
    totalChunks: number;
    /** Array of chunk information */
    chunks: ChunkInfo[];
    /** SHA-256 hash of complete file (or combined chunk hashes) */
    fileHash: string;
    /** Manifest creation timestamp */
    createdAt: number;
}

/**
 * A chunk with its binary data
 */
export interface ChunkData {
    /** Zero-based index */
    index: number;
    /** Raw binary data */
    data: ArrayBuffer;
    /** SHA-256 hash of this chunk */
    hash: string;
}


/**
 * Transfer progress information
 */
export interface TransferProgress {
    /** Total number of chunks */
    totalChunks: number;
    /** Number of successfully completed chunks */
    completedChunks: number;
    /** Index of the chunk currently being processed */
    currentChunkIndex: number;
    /** Total bytes transferred so far */
    bytesTransferred: number;
    /** Total file size in bytes */
    totalBytes: number;
    /** Progress percentage (0-100) */
    progress: number;
    /** Indices of chunks still pending */
    chunksRemaining: number[];
    /** Indices of chunks that failed verification */
    failedChunks: number[];
}

/**
 * Encryption/decryption progress
 */
export interface EncryptionProgress {
    /** Bytes processed so far */
    bytesProcessed: number;
    /** Total bytes to process */
    totalBytes: number;
    /** Progress percentage (0-100) */
    percentage: number;
}


/**
 * Request for a specific chunk
 */
export interface ChunkRequestMessage {
    type: 'chunk_request';
    /** Requested chunk index */
    index: number;
}

/**
 * Response containing chunk data
 */
export interface ChunkResponseMessage {
    type: 'chunk_response';
    /** Chunk index */
    index: number;
    /** Base64-encoded chunk data */
    data: string;
    /** SHA-256 hash for verification */
    hash: string;
}

/**
 * File manifest message
 */
export interface ManifestMessage {
    type: 'manifest';
    /** The file manifest */
    manifest: FileManifest;
}

/**
 * Acknowledgment message
 */
export interface AckMessage {
    type: 'ack';
    /** Chunk index being acknowledged */
    index: number;
    /** Whether the chunk was received successfully */
    success: boolean;
    /** Error message if failed */
    error?: string;
}

/**
 * Union type for all chunk-related messages
 */
export type ChunkMessage =
    | ChunkRequestMessage
    | ChunkResponseMessage
    | ManifestMessage
    | AckMessage;


/**
 * Encryption header for streaming crypto
 */
export interface StreamingEncryptionHeader {
    /** Base64-encoded IV */
    iv: string;
    /** Algorithm used (e.g., 'AES-256-GCM') */
    algorithm: string;
    /** Chunk size in bytes */
    chunkSize: number;
    /** Encryption format version */
    version: number;
    /** Original file size */
    originalSize: number;
    /** Original file name */
    originalName: string;
    /** Original MIME type */
    originalType: string;
}

/**
 * Result of streaming encryption
 */
export interface StreamingEncryptionResult {
    /** Salt used for key derivation (Base64) */
    salt: string;
    /** Encryption header (Base64 JSON) */
    header: string;
    /** Encryption version */
    version: number;
    /** Original file size */
    originalSize: number;
}

/**
 * Options for streaming decryption
 */
export interface StreamingDecryptionOptions {
    /** Password for decryption */
    password: string;
    /** Salt used for key derivation (Base64) */
    salt: string;
    /** Encryption header (Base64 JSON) */
    header: string;
    /** Encryption version (optional, defaults to header value) */
    version?: number;
}
