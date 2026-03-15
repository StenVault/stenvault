/**
 * Transfer Utilities
 * 
 * Pure utility functions for file transfer operations.
 * These are platform-agnostic and don't depend on any APIs.
 * 
 * @module @stenvault/shared/core/transfer
 */

import { CHUNK_SIZE_THRESHOLDS, DEFAULT_CHUNK_SIZE } from './constants';
import type { ChunkData, ChunkInfo, TransferProgress } from './types';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../platform/crypto/utils';

// ============ Chunk Size Calculation ============

/**
 * Calculate optimal chunk size based on file size
 * Larger files use larger chunks for efficiency
 * 
 * @param fileSize - Total file size in bytes
 * @returns Optimal chunk size in bytes
 */
export function calculateOptimalChunkSize(fileSize: number): number {
    if (fileSize < CHUNK_SIZE_THRESHOLDS.SMALL.maxSize) {
        return CHUNK_SIZE_THRESHOLDS.SMALL.chunkSize;
    }
    if (fileSize < CHUNK_SIZE_THRESHOLDS.MEDIUM.maxSize) {
        return CHUNK_SIZE_THRESHOLDS.MEDIUM.chunkSize;
    }
    if (fileSize < CHUNK_SIZE_THRESHOLDS.LARGE.maxSize) {
        return CHUNK_SIZE_THRESHOLDS.LARGE.chunkSize;
    }
    return CHUNK_SIZE_THRESHOLDS.HUGE.chunkSize;
}

/**
 * Calculate total number of chunks for a file
 * 
 * @param fileSize - Total file size in bytes
 * @param chunkSize - Size of each chunk in bytes
 * @returns Number of chunks
 */
export function calculateTotalChunks(fileSize: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
    return Math.ceil(fileSize / chunkSize);
}

/**
 * Calculate chunk offset and size for a given index
 * 
 * @param index - Zero-based chunk index
 * @param fileSize - Total file size in bytes
 * @param chunkSize - Size of each chunk in bytes
 * @returns Object with offset and size
 */
export function getChunkBounds(
    index: number,
    fileSize: number,
    chunkSize: number = DEFAULT_CHUNK_SIZE
): { offset: number; size: number } {
    const offset = index * chunkSize;
    const size = Math.min(chunkSize, fileSize - offset);
    return { offset, size };
}

// ============ Progress Calculation ============

/**
 * Estimate remaining transfer time
 * 
 * @param totalChunks - Total number of chunks
 * @param completedChunks - Number of completed chunks
 * @param elapsedMs - Time elapsed since start (ms)
 * @returns Estimated remaining time in milliseconds
 */
export function estimateTransferTime(
    totalChunks: number,
    completedChunks: number,
    elapsedMs: number
): number {
    if (completedChunks === 0) return 0;
    const avgTimePerChunk = elapsedMs / completedChunks;
    const remainingChunks = totalChunks - completedChunks;
    return Math.round(remainingChunks * avgTimePerChunk);
}

/**
 * Calculate transfer progress from chunk data
 * 
 * @param totalChunks - Total number of chunks
 * @param completedIndices - Set or array of completed chunk indices
 * @param chunkSize - Size of each chunk in bytes
 * @param fileSize - Total file size
 * @returns Progress information
 */
export function calculateProgress(
    totalChunks: number,
    completedIndices: Set<number> | number[],
    chunkSize: number,
    fileSize: number
): TransferProgress {
    const completed = completedIndices instanceof Set
        ? completedIndices
        : new Set(completedIndices);

    const completedChunks = completed.size;

    // Calculate bytes transferred (account for last chunk being smaller)
    let bytesTransferred = 0;
    for (const index of completed) {
        if (index === totalChunks - 1) {
            // Last chunk may be smaller
            bytesTransferred += fileSize % chunkSize || chunkSize;
        } else {
            bytesTransferred += chunkSize;
        }
    }

    // Get remaining chunks
    const chunksRemaining: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
        if (!completed.has(i)) {
            chunksRemaining.push(i);
        }
    }

    return {
        totalChunks,
        completedChunks,
        currentChunkIndex: completedChunks,
        bytesTransferred,
        totalBytes: fileSize,
        progress: Math.round((completedChunks / totalChunks) * 100),
        chunksRemaining,
        failedChunks: [],
    };
}

// ============ Message Serialization ============

/**
 * Serialize chunk data for transmission over network
 * Converts binary data to Base64 for JSON transport
 * 
 * @param chunk - Chunk with binary data
 * @returns Serialized chunk with Base64 data
 */
export function serializeChunk(chunk: ChunkData): { index: number; data: string; hash: string } {
    return {
        index: chunk.index,
        data: arrayBufferToBase64(chunk.data),
        hash: chunk.hash,
    };
}

/**
 * Deserialize chunk data received from network
 * Converts Base64 data back to binary
 * 
 * @param serialized - Serialized chunk with Base64 data
 * @returns Chunk with binary data
 */
export function deserializeChunk(serialized: { index: number; data: string; hash: string }): ChunkData {
    return {
        index: serialized.index,
        data: base64ToArrayBuffer(serialized.data),
        hash: serialized.hash,
    };
}

// ============ Manifest Helpers ============

/**
 * Generate chunk info array for a manifest
 * Note: This doesn't compute hashes - that requires platform-specific crypto
 * 
 * @param fileSize - Total file size
 * @param chunkSize - Size of each chunk
 * @returns Array of chunk info (without hashes)
 */
export function generateChunkInfos(fileSize: number, chunkSize: number): Omit<ChunkInfo, 'hash'>[] {
    const totalChunks = calculateTotalChunks(fileSize, chunkSize);
    const chunks: Omit<ChunkInfo, 'hash'>[] = [];

    for (let i = 0; i < totalChunks; i++) {
        const { offset, size } = getChunkBounds(i, fileSize, chunkSize);
        chunks.push({ index: i, offset, size });
    }

    return chunks;
}

// ============ Validation ============

/**
 * Validate that a chunk index is within range
 * 
 * @param index - Chunk index to validate
 * @param totalChunks - Total number of chunks
 * @throws Error if index is out of range
 */
export function validateChunkIndex(index: number, totalChunks: number): void {
    if (index < 0 || index >= totalChunks) {
        throw new Error(`Invalid chunk index: ${index}. Expected 0-${totalChunks - 1}`);
    }
}

/**
 * Check if a file should use streaming encryption (based on size)
 * 
 * @param fileSize - File size in bytes
 * @param threshold - Threshold in bytes (default: 100MB)
 * @returns True if streaming should be used
 */
export function shouldUseStreaming(fileSize: number, threshold: number = 100 * 1024 * 1024): boolean {
    return fileSize > threshold;
}
