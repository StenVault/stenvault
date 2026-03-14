/**
 * P2P Chunked Transfer Utilities
 * 
 * BitTorrent-style chunked file transfer for large files.
 * Features:
 * - Resumable downloads with IndexedDB persistence
 * - Chunk-level integrity verification (SHA-256)
 * - Parallel chunk requests
 * - Progress tracking per chunk
 */
import {
    getTransferStorage,
    createTransferState,
    type SavedTransferState,
    type ITransferStateStorage,
} from "./p2p/transferStateStorage";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/platform";
import {
    DEFAULT_CHUNK_SIZE,
    MAX_CONCURRENT_CHUNKS,
    HASH_ALGORITHM,
} from "@cloudvault/shared/core/transfer";

export { DEFAULT_CHUNK_SIZE, MAX_CONCURRENT_CHUNKS, HASH_ALGORITHM };


export interface ChunkInfo {
    index: number;
    offset: number;
    size: number;
    hash: string; // SHA-256 hash for verification
}

export interface FileManifest {
    fileName: string;
    fileSize: number;
    fileType: string;
    lastModified: number;
    chunkSize: number;
    totalChunks: number;
    chunks: ChunkInfo[];
    fileHash: string; // Full file hash
    createdAt: number;
}

export interface ChunkData {
    index: number;
    data: ArrayBuffer;
    hash: string;
}

export interface TransferProgress {
    totalChunks: number;
    completedChunks: number;
    currentChunkIndex: number;
    bytesTransferred: number;
    totalBytes: number;
    progress: number; // 0-100
    chunksRemaining: number[];
    failedChunks: number[];
}

export interface ChunkRequest {
    type: "chunk_request";
    index: number;
}

export interface ChunkResponse {
    type: "chunk_response";
    index: number;
    data: string; // Base64 encoded
    hash: string;
}

export interface ManifestMessage {
    type: "manifest";
    manifest: FileManifest;
}

export interface AckMessage {
    type: "ack";
    index: number;
    success: boolean;
    error?: string;
}

export type ChunkMessage = ChunkRequest | ChunkResponse | ManifestMessage | AckMessage;


/**
 * Generate a file manifest with chunk information
 * Uses streaming to avoid loading entire file into memory
 */
export async function generateManifest(
    file: File,
    chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<FileManifest> {
    const totalChunks = Math.ceil(file.size / chunkSize);
    const chunks: ChunkInfo[] = [];

    // Process chunks one at a time to avoid OOM for large files
    for (let i = 0; i < totalChunks; i++) {
        const offset = i * chunkSize;
        const size = Math.min(chunkSize, file.size - offset);
        // Use slice to read only this chunk (memory efficient)
        const chunkBlob = file.slice(offset, offset + size);
        const chunkData = await chunkBlob.arrayBuffer();
        const hash = await hashChunk(chunkData);

        chunks.push({
            index: i,
            offset,
            size,
            hash,
        });
    }

    // For fileHash, we compute incrementally for large files
    // or read full file for smaller ones (< 100MB)
    let fileHash: string;
    if (file.size < 100 * 1024 * 1024) {
        // Small file: read all at once
        const fullBuffer = await file.arrayBuffer();
        fileHash = await hashChunk(fullBuffer);
    } else {
        // Large file: use a simple hash of chunk hashes
        // This provides integrity without loading entire file
        const combinedHashes = chunks.map(c => c.hash).join('');
        const encoder = new TextEncoder();
        const hashData = encoder.encode(combinedHashes);
        fileHash = await hashChunk(hashData.buffer as ArrayBuffer);
    }

    return {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
        chunkSize,
        totalChunks,
        chunks,
        fileHash,
        createdAt: Date.now(),
    };
}

/**
 * Calculate SHA-256 hash of a chunk
 */
export async function hashChunk(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}


/**
 * Extract a chunk from a file
 * Uses File.slice() to avoid loading entire file into memory
 */
export async function extractChunk(
    file: File,
    chunkInfo: ChunkInfo
): Promise<ChunkData> {
    // Use slice to read only the needed chunk (memory efficient)
    const chunkBlob = file.slice(chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
    const data = await chunkBlob.arrayBuffer();
    const hash = await hashChunk(data);

    return {
        index: chunkInfo.index,
        data,
        hash,
    };
}

/**
 * Extract chunk by index
 * Uses File.slice() to avoid loading entire file into memory
 */
export async function extractChunkByIndex(
    file: File,
    index: number,
    chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<ChunkData> {
    const offset = index * chunkSize;
    const size = Math.min(chunkSize, file.size - offset);
    // Use slice to read only the needed chunk (memory efficient)
    const chunkBlob = file.slice(offset, offset + size);
    const data = await chunkBlob.arrayBuffer();
    const hash = await hashChunk(data);

    return {
        index,
        data,
        hash,
    };
}


/**
 * Chunk receiver/assembler for reconstructing files
 * Supports resumable transfers via IndexedDB persistence
 */
export class ChunkAssembler {
    private manifest: FileManifest | null = null;
    private chunks: Map<number, ArrayBuffer> = new Map();
    private receivedChunks: Set<number> = new Set();
    private failedChunks: Set<number> = new Set();

    /** Session ID for persistence */
    private sessionId: string | null = null;

    /** Whether to auto-persist chunks to IndexedDB */
    private autoPersist: boolean = false;

    /** Storage instance */
    private storage: ITransferStateStorage | null = null;

    /** Whether E2E encryption is enabled */
    private isE2E: boolean = false;

    /** Share URL for reconnection */
    private shareUrl?: string;

    /**
     * Configure session for persistence
     */
    configure(options: {
        sessionId?: string;
        autoPersist?: boolean;
        isE2E?: boolean;
        shareUrl?: string;
    }): void {
        if (options.sessionId) {
            this.sessionId = options.sessionId;
        }
        if (options.autoPersist) {
            this.autoPersist = true;
            this.storage = getTransferStorage();
        }
        if (options.isE2E !== undefined) {
            this.isE2E = options.isE2E;
        }
        if (options.shareUrl) {
            this.shareUrl = options.shareUrl;
        }
    }

    /**
     * Get session ID
     */
    getSessionId(): string | null {
        return this.sessionId;
    }

    setManifest(manifest: FileManifest): void {
        this.manifest = manifest;
        this.chunks.clear();
        this.receivedChunks.clear();
        this.failedChunks.clear();
    }

    getManifest(): FileManifest | null {
        return this.manifest;
    }

    /**
     * Add a chunk and verify its hash
     */
    async addChunk(chunk: ChunkData): Promise<boolean> {
        if (!this.manifest) {
            throw new Error("Manifest not set");
        }

        const expectedHash = this.manifest.chunks[chunk.index]?.hash;
        if (!expectedHash) {
            throw new Error(`Invalid chunk index: ${chunk.index}`);
        }

        // Verify chunk hash
        const actualHash = await hashChunk(chunk.data);
        if (actualHash !== expectedHash) {
            this.failedChunks.add(chunk.index);
            return false;
        }

        this.chunks.set(chunk.index, chunk.data);
        this.receivedChunks.add(chunk.index);
        this.failedChunks.delete(chunk.index);

        // Auto-persist to IndexedDB if enabled
        if (this.autoPersist && this.storage && this.sessionId) {
            this.storage.addChunk(this.sessionId, chunk.index, chunk.data, actualHash)
                .catch(() => {});
        }

        return true;
    }

    /**
     * Get remaining chunks to download
     */
    getRemainingChunks(): number[] {
        if (!this.manifest) return [];

        const remaining: number[] = [];
        for (let i = 0; i < this.manifest.totalChunks; i++) {
            if (!this.receivedChunks.has(i)) {
                remaining.push(i);
            }
        }
        return remaining;
    }

    /**
     * Get failed chunks that need retry
     */
    getFailedChunks(): number[] {
        return Array.from(this.failedChunks);
    }

    /**
     * Get transfer progress
     */
    getProgress(): TransferProgress {
        if (!this.manifest) {
            return {
                totalChunks: 0,
                completedChunks: 0,
                currentChunkIndex: 0,
                bytesTransferred: 0,
                totalBytes: 0,
                progress: 0,
                chunksRemaining: [],
                failedChunks: [],
            };
        }

        const completedChunks = this.receivedChunks.size;
        const bytesTransferred = Array.from(this.chunks.values())
            .reduce((sum, chunk) => sum + chunk.byteLength, 0);

        return {
            totalChunks: this.manifest.totalChunks,
            completedChunks,
            currentChunkIndex: this.receivedChunks.size > 0
                ? Math.max(...Array.from(this.receivedChunks)) + 1
                : 0,
            bytesTransferred,
            totalBytes: this.manifest.fileSize,
            progress: Math.round((completedChunks / this.manifest.totalChunks) * 100),
            chunksRemaining: this.getRemainingChunks(),
            failedChunks: this.getFailedChunks(),
        };
    }

    /**
     * Check if transfer is complete
     */
    isComplete(): boolean {
        if (!this.manifest) return false;
        return this.receivedChunks.size === this.manifest.totalChunks;
    }

    /**
     * Assemble all chunks into a File
     */
    async assemble(): Promise<File> {
        if (!this.manifest) {
            throw new Error("Manifest not set");
        }

        if (!this.isComplete()) {
            throw new Error(
                `Transfer incomplete: ${this.receivedChunks.size}/${this.manifest.totalChunks} chunks`
            );
        }

        // Assemble chunks in order
        const parts: ArrayBuffer[] = [];
        for (let i = 0; i < this.manifest.totalChunks; i++) {
            const chunk = this.chunks.get(i);
            if (!chunk) {
                throw new Error(`Missing chunk ${i}`);
            }
            parts.push(chunk);
        }

        // Create blob and verify full file hash
        const blob = new Blob(parts, { type: this.manifest.fileType });
        const arrayBuffer = await blob.arrayBuffer();
        const actualHash = await hashChunk(arrayBuffer);

        if (actualHash !== this.manifest.fileHash) {
            throw new Error("File hash mismatch - file may be corrupted");
        }

        return new File([blob], this.manifest.fileName, {
            type: this.manifest.fileType,
            lastModified: this.manifest.lastModified,
        });
    }

    /**
     * Reset the assembler
     * @param deleteFromStorage - Also delete from IndexedDB
     */
    reset(deleteFromStorage: boolean = false): void {
        this.manifest = null;
        this.chunks.clear();
        this.receivedChunks.clear();
        this.failedChunks.clear();

        if (deleteFromStorage && this.storage && this.sessionId) {
            this.storage.deleteState(this.sessionId)
                .catch(() => {});
        }
    }


    /**
     * Save current state to IndexedDB for later resume
     */
    async saveState(): Promise<void> {
        if (!this.sessionId) {
            throw new Error("Cannot save state: no sessionId set");
        }

        if (!this.manifest) {
            throw new Error("Cannot save state: no manifest set");
        }

        const storage = this.storage ?? getTransferStorage();
        const completedChunks = Array.from(this.receivedChunks).sort((a, b) => a - b);
        const bytesTransferred = Array.from(this.chunks.values())
            .reduce((sum, chunk) => sum + chunk.byteLength, 0);

        // Build chunk hashes map
        const chunkHashes = new Map<number, string>();
        for (const chunkInfo of this.manifest.chunks) {
            if (this.receivedChunks.has(chunkInfo.index)) {
                chunkHashes.set(chunkInfo.index, chunkInfo.hash);
            }
        }

        const state: SavedTransferState = createTransferState({
            sessionId: this.sessionId,
            protocol: "chunked",
            direction: "receive",
            fileName: this.manifest.fileName,
            fileSize: this.manifest.fileSize,
            mimeType: this.manifest.fileType,
            totalChunks: this.manifest.totalChunks,
            isE2E: this.isE2E,
            completedChunks,
            bytesTransferred,
            chunks: this.chunks,
            chunkHashes,
            manifest: this.manifest,
            shareUrl: this.shareUrl,
        });

        await storage.saveState(state);
    }

    /**
     * Restore state from IndexedDB
     * @param sessionId - Session ID to restore
     * @returns ChunkAssembler or null if no saved state
     */
    static async restoreFromState(sessionId: string): Promise<ChunkAssembler | null> {
        const storage = getTransferStorage();
        const state = await storage.loadState(sessionId);

        if (!state) {
            return null;
        }

        // Verify it's a chunked protocol state
        if (state.protocol !== "chunked") {
            return null;
        }

        const manifest = state.manifest as FileManifest;
        if (!manifest) {
            return null;
        }

        // Create assembler with saved options
        const assembler = new ChunkAssembler();
        assembler.configure({
            sessionId,
            autoPersist: true,
            isE2E: state.isE2E,
            shareUrl: state.shareUrl,
        });

        // Set manifest
        assembler.manifest = manifest;

        // Restore chunks
        for (const [index, data] of state.chunks) {
            assembler.chunks.set(index, data);
            assembler.receivedChunks.add(index);
        }

        return assembler;
    }

    /**
     * Delete saved state from IndexedDB
     */
    async deleteSavedState(): Promise<void> {
        if (!this.sessionId) return;

        const storage = this.storage ?? getTransferStorage();
        await storage.deleteState(this.sessionId);
    }

    /**
     * Get list of resumable transfers from IndexedDB
     * Only returns incomplete "chunked" protocol transfers
     */
    static async listResumableTransfers(): Promise<Array<{
        sessionId: string;
        fileName: string;
        progress: number;
        bytesTransferred: number;
        totalBytes: number;
        updatedAt: number;
        shareUrl?: string;
    }>> {
        const storage = getTransferStorage();
        const pending = await storage.listPendingTransfers();

        return pending
            .filter(t => t.protocol === "chunked")
            .map(t => ({
                sessionId: t.sessionId,
                fileName: t.fileName,
                progress: Math.round((t.completedChunks.length / t.totalChunks) * 100),
                bytesTransferred: t.bytesTransferred,
                totalBytes: t.fileSize,
                updatedAt: t.updatedAt,
                shareUrl: t.shareUrl,
            }));
    }
}


/**
 * Chunk sender for streaming files
 */
export class ChunkSender {
    private file: File;
    private manifest: FileManifest | null = null;
    private sentChunks: Set<number> = new Set();
    private ackedChunks: Set<number> = new Set();

    constructor(file: File) {
        this.file = file;
    }

    /**
     * Initialize and generate manifest
     */
    async initialize(chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<FileManifest> {
        this.manifest = await generateManifest(this.file, chunkSize);
        this.sentChunks.clear();
        this.ackedChunks.clear();
        return this.manifest;
    }

    getManifest(): FileManifest | null {
        return this.manifest;
    }

    /**
     * Get a chunk by index
     */
    async getChunk(index: number): Promise<ChunkData> {
        if (!this.manifest) {
            throw new Error("Not initialized");
        }

        if (index < 0 || index >= this.manifest.totalChunks) {
            throw new Error(`Invalid chunk index: ${index}`);
        }

        const chunkInfo = this.manifest.chunks[index];
        if (!chunkInfo) {
            throw new Error(`Chunk info not found for index: ${index}`);
        }
        return extractChunk(this.file, chunkInfo);
    }

    /**
     * Mark chunk as sent
     */
    markSent(index: number): void {
        this.sentChunks.add(index);
    }

    /**
     * Mark chunk as acknowledged
     */
    markAcked(index: number): void {
        this.ackedChunks.add(index);
    }

    /**
     * Get chunks pending acknowledgment
     */
    getPendingChunks(): number[] {
        return Array.from(this.sentChunks).filter(i => !this.ackedChunks.has(i));
    }

    /**
     * Get transfer progress
     */
    getProgress(): TransferProgress {
        if (!this.manifest) {
            return {
                totalChunks: 0,
                completedChunks: 0,
                currentChunkIndex: 0,
                bytesTransferred: 0,
                totalBytes: 0,
                progress: 0,
                chunksRemaining: [],
                failedChunks: [],
            };
        }

        const completedChunks = this.ackedChunks.size;
        const bytesTransferred = Array.from(this.ackedChunks)
            .map(i => this.manifest!.chunks[i]?.size ?? 0)
            .reduce((sum, size) => sum + size, 0);

        const remaining: number[] = [];
        for (let i = 0; i < this.manifest.totalChunks; i++) {
            if (!this.ackedChunks.has(i)) {
                remaining.push(i);
            }
        }

        return {
            totalChunks: this.manifest.totalChunks,
            completedChunks,
            currentChunkIndex: this.ackedChunks.size > 0
                ? Math.max(...Array.from(this.ackedChunks)) + 1
                : 0,
            bytesTransferred,
            totalBytes: this.manifest.fileSize,
            progress: Math.round((completedChunks / this.manifest.totalChunks) * 100),
            chunksRemaining: remaining,
            failedChunks: [],
        };
    }

    /**
     * Check if all chunks are acknowledged
     */
    isComplete(): boolean {
        if (!this.manifest) return false;
        return this.ackedChunks.size === this.manifest.totalChunks;
    }
}


/**
 * Serialize chunk data for transmission
 */
export function serializeChunkResponse(chunk: ChunkData): ChunkResponse {
    return {
        type: "chunk_response",
        index: chunk.index,
        data: arrayBufferToBase64(chunk.data),
        hash: chunk.hash,
    };
}

/**
 * Deserialize chunk response
 */
export function deserializeChunkResponse(response: ChunkResponse): ChunkData {
    return {
        index: response.index,
        data: base64ToArrayBuffer(response.data),
        hash: response.hash,
    };
}

/**
 * Create a chunk request message
 */
export function createChunkRequest(index: number): ChunkRequest {
    return {
        type: "chunk_request",
        index,
    };
}

/**
 * Create an acknowledgment message
 */
export function createAck(index: number, success: boolean, error?: string): AckMessage {
    return {
        type: "ack",
        index,
        success,
        error,
    };
}

/**
 * Create a manifest message
 */
export function createManifestMessage(manifest: FileManifest): ManifestMessage {
    return {
        type: "manifest",
        manifest,
    };
}

// Note: arrayBufferToBase64 and base64ToArrayBuffer imported from @/lib/platform
// to eliminate code duplication across the codebase

/**
 * Calculate optimal chunk size based on file size
 */
export function calculateOptimalChunkSize(fileSize: number): number {
    // Small files (<1MB): 64KB chunks
    if (fileSize < 1024 * 1024) {
        return 64 * 1024;
    }
    // Medium files (<100MB): 256KB chunks (default)
    if (fileSize < 100 * 1024 * 1024) {
        return 256 * 1024;
    }
    // Large files (<1GB): 1MB chunks
    if (fileSize < 1024 * 1024 * 1024) {
        return 1024 * 1024;
    }
    // Very large files: 2MB chunks
    return 2 * 1024 * 1024;
}

/**
 * Estimate transfer time based on chunk count and average latency
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
