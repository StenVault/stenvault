/**
 * FileAssembler - P2P File Assembly Utility
 * 
 * Responsible for collecting chunks and assembling them into a complete file.
 * Used by both offline transfers and real-time P2P transfers.
 * 
 * Features:
 * - Out-of-order chunk reception
 * - Optional hash verification
 * - IndexedDB persistence for resumable transfers
 * - Progress tracking
 * 
 * @module lib/p2p/fileAssembler
 */
import {
    getTransferStorage,
    createTransferState,
    type SavedTransferState,
    type ITransferStateStorage,
} from "./transferStateStorage";
import { streamDownloadToDisk } from '@/lib/platform';

/**
 * File manifest containing metadata about the file being transferred
 */
export interface FileManifest {
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    chunkHashes?: string[]; // Optional SHA-256 hashes for verification
}

/**
 * Individual chunk data
 */
export interface ChunkData {
    index: number;
    data: ArrayBuffer;
    hash?: string;
}

/**
 * Progress information for the assembly process
 */
export interface AssemblyProgress {
    completedChunks: number;
    totalChunks: number;
    percent: number;
    bytesReceived: number;
    totalBytes: number;
}

/**
 * FileAssembler class
 * 
 * Collects file chunks and assembles them into a complete file.
 * Supports out-of-order chunk arrival and hash verification.
 */
export class FileAssembler {
    private chunks: Map<number, ArrayBuffer>;
    private manifest: FileManifest;
    private bytesReceived: number = 0;

    /** Session ID for persistence (optional) */
    private sessionId: string | null = null;

    /** Whether to auto-persist chunks to IndexedDB */
    private autoPersist: boolean = false;

    /** Storage instance for persistence */
    private storage: ITransferStateStorage | null = null;

    /** Whether E2E encryption is enabled */
    private isE2E: boolean = false;

    /** Share URL for reconnection */
    private shareUrl?: string;

    /**
     * Create a new FileAssembler instance
     * @param manifest - File manifest with metadata
     * @param options - Optional configuration
     */
    constructor(
        manifest: FileManifest,
        options?: {
            sessionId?: string;
            autoPersist?: boolean;
            isE2E?: boolean;
            shareUrl?: string;
        }
    ) {
        this.manifest = manifest;
        this.chunks = new Map();

        if (options?.sessionId) {
            this.sessionId = options.sessionId;
        }
        if (options?.autoPersist) {
            this.autoPersist = true;
            this.storage = getTransferStorage();
        }
        if (options?.isE2E !== undefined) {
            this.isE2E = options.isE2E;
        }
        if (options?.shareUrl) {
            this.shareUrl = options.shareUrl;
        }
    }

    /**
     * Set session ID for persistence
     */
    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * Get session ID
     */
    getSessionId(): string | null {
        return this.sessionId;
    }

    /**
     * Enable auto-persistence to IndexedDB
     */
    enableAutoPersist(): void {
        this.autoPersist = true;
        this.storage = getTransferStorage();
    }

    /**
     * Add a chunk to the assembler
     * @param chunk - Chunk data with index and ArrayBuffer
     * @returns true if chunk was added successfully
     */
    addChunk(chunk: ChunkData): boolean {
        if (chunk.index < 0 || chunk.index >= this.manifest.totalChunks) {
            return false;
        }

        if (this.chunks.has(chunk.index)) {
            // Already have this chunk, skip
            return true;
        }

        // Verify hash if provided
        if (this.manifest.chunkHashes && chunk.hash) {
            const expectedHash = this.manifest.chunkHashes[chunk.index];
            if (expectedHash && expectedHash !== chunk.hash) {
                return false;
            }
        }

        this.chunks.set(chunk.index, chunk.data);
        this.bytesReceived += chunk.data.byteLength;

        // Auto-persist to IndexedDB if enabled
        if (this.autoPersist && this.storage && this.sessionId) {
            this.storage.addChunk(this.sessionId, chunk.index, chunk.data, chunk.hash)
                .catch(() => {});
        }

        return true;
    }

    /**
     * Get current assembly progress
     */
    getProgress(): AssemblyProgress {
        const completedChunks = this.chunks.size;
        const totalChunks = this.manifest.totalChunks;
        const percent = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;

        return {
            completedChunks,
            totalChunks,
            percent,
            bytesReceived: this.bytesReceived,
            totalBytes: this.manifest.fileSize,
        };
    }

    /**
     * Check if all chunks have been received
     */
    isComplete(): boolean {
        return this.chunks.size === this.manifest.totalChunks;
    }

    /**
     * Get list of missing chunk indices
     */
    getMissingChunks(): number[] {
        const missing: number[] = [];
        for (let i = 0; i < this.manifest.totalChunks; i++) {
            if (!this.chunks.has(i)) {
                missing.push(i);
            }
        }
        return missing;
    }

    /**
     * Assemble all chunks into a Blob
     * @throws Error if not all chunks are present
     */
    assemble(): Blob {
        if (!this.isComplete()) {
            const missing = this.getMissingChunks();
            throw new Error(`Cannot assemble: missing ${missing.length} chunks (${missing.slice(0, 5).join(", ")}...)`);
        }

        // Collect chunks in order
        const orderedChunks: ArrayBuffer[] = [];
        for (let i = 0; i < this.manifest.totalChunks; i++) {
            const chunk = this.chunks.get(i);
            if (!chunk) {
                throw new Error(`Missing chunk at index ${i}`);
            }
            orderedChunks.push(chunk);
        }

        return new Blob(orderedChunks, { type: this.manifest.mimeType });
    }

    /**
     * Get a blob URL for the assembled file
     * @throws Error if not all chunks are present
     */
    getDownloadUrl(): string {
        const blob = this.assemble();
        return URL.createObjectURL(blob);
    }

    /**
     * Trigger a download of the assembled file
     * @throws Error if not all chunks are present
     */
    downloadFile(): void {
        const url = this.getDownloadUrl();
        const a = document.createElement("a");
        a.href = url;
        a.download = this.manifest.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Revoke after a short delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * Get a ReadableStream that yields chunks in order, releasing each from
     * the Map after yield for progressive memory release.
     * @throws Error if not all chunks are present
     */
    getDownloadStream(): ReadableStream<Uint8Array> {
        if (!this.isComplete()) {
            const missing = this.getMissingChunks();
            throw new Error(`Cannot stream: missing ${missing.length} chunks`);
        }

        const totalChunks = this.manifest.totalChunks;
        const chunksMap = this.chunks;

        return new ReadableStream<Uint8Array>({
            start(controller) {
                for (let i = 0; i < totalChunks; i++) {
                    const chunk = chunksMap.get(i);
                    if (!chunk) {
                        controller.error(new Error(`Missing chunk at index ${i}`));
                        return;
                    }
                    controller.enqueue(new Uint8Array(chunk));
                    chunksMap.delete(i); // Release memory progressively
                }
                controller.close();
            },
        });
    }

    /**
     * Download the assembled file using streaming (progressive memory release).
     * Uses streamDownloadToDisk for best-available tier.
     * @throws Error if not all chunks are present
     */
    async downloadFileStreaming(): Promise<void> {
        const stream = this.getDownloadStream();
        await streamDownloadToDisk(stream, {
            filename: this.manifest.fileName,
            totalSize: this.manifest.fileSize,
            mimeType: this.manifest.mimeType,
        });
    }

    /**
     * Get the file manifest
     */
    getManifest(): FileManifest {
        return { ...this.manifest };
    }

    /**
     * Reset the assembler (clear all chunks)
     * @param deleteFromStorage - Also delete from IndexedDB
     */
    reset(deleteFromStorage: boolean = false): void {
        this.chunks.clear();
        this.bytesReceived = 0;

        if (deleteFromStorage && this.storage && this.sessionId) {
            this.storage.deleteState(this.sessionId)
                .catch(() => {});
        }
    }


    /**
     * Save current state to IndexedDB for later resume
     * @returns Promise<void>
     */
    async saveState(): Promise<void> {
        if (!this.sessionId) {
            throw new Error("Cannot save state: no sessionId set");
        }

        const storage = this.storage ?? getTransferStorage();
        const completedChunks = Array.from(this.chunks.keys()).sort((a, b) => a - b);

        const state: SavedTransferState = createTransferState({
            sessionId: this.sessionId,
            protocol: "simple",
            direction: "receive",
            fileName: this.manifest.fileName,
            fileSize: this.manifest.fileSize,
            mimeType: this.manifest.mimeType,
            totalChunks: this.manifest.totalChunks,
            isE2E: this.isE2E,
            completedChunks,
            bytesTransferred: this.bytesReceived,
            chunks: this.chunks,
            manifest: this.manifest,
            shareUrl: this.shareUrl,
        });

        await storage.saveState(state);
    }

    /**
     * Restore state from IndexedDB
     * @param sessionId - Session ID to restore
     * @returns FileAssembler or null if no saved state
     */
    static async restoreFromState(sessionId: string): Promise<FileAssembler | null> {
        const storage = getTransferStorage();
        const state = await storage.loadState(sessionId);

        if (!state) {
            return null;
        }

        // Verify it's a simple protocol state
        if (state.protocol !== "simple") {
            return null;
        }

        // Recreate manifest from saved state
        const manifest: FileManifest = state.manifest as FileManifest ?? {
            fileName: state.fileName,
            fileSize: state.fileSize,
            mimeType: state.mimeType,
            totalChunks: state.totalChunks,
        };

        // Create assembler with saved options
        const assembler = new FileAssembler(manifest, {
            sessionId,
            autoPersist: true,
            isE2E: state.isE2E,
            shareUrl: state.shareUrl,
        });

        // Restore chunks
        for (const [index, data] of state.chunks) {
            assembler.chunks.set(index, data);
            assembler.bytesReceived += data.byteLength;
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
     * Only returns incomplete "simple" protocol transfers
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
            .filter(t => t.protocol === "simple")
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

