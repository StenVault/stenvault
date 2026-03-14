/**
 * FileSender - P2P File Sending Utility
 * 
 * Responsible for sending a file over WebRTC DataChannel.
 * Implements chunked transfer with flow control for optimal performance.
 * 
 * Protocol:
 * 1. Send manifest (JSON): { type, fileName, fileSize, mimeType, totalChunks }
 * 2. Send chunks (Binary): [4-byte BE index][chunk data]
 * 3. Send complete (JSON): { type: "complete" }
 * 
 * @module lib/p2p/fileSender
 */

/**
 * Progress information for file sending
 */
export interface SendProgress {
    sentChunks: number;
    totalChunks: number;
    percent: number;
    bytesSent: number;
    totalBytes: number;
    speed: number; // bytes per second
    estimatedTimeRemaining: number; // milliseconds
}

/**
 * Configuration options for FileSender
 */
export interface FileSenderOptions {
    /** Size of each chunk in bytes (default: 64KB) */
    chunkSize?: number;
    /** Buffer threshold before waiting (default: 1MB) */
    bufferThreshold?: number;
    /** Progress callback */
    onProgress?: (progress: SendProgress) => void;
    /** Completion callback */
    onComplete?: () => void;
    /** Error callback */
    onError?: (error: Error) => void;
}

import { WEBRTC_CHUNK_SIZE, WEBRTC_BUFFER_THRESHOLD } from "@cloudvault/shared/core/transfer";

/**
 * FileSender class
 * 
 * Handles chunked file transfer over WebRTC DataChannel.
 * Includes flow control to prevent buffer overflow.
 */
export class FileSender {
    private file: File;
    private dataChannel: RTCDataChannel;
    private chunkSize: number;
    private bufferThreshold: number;
    private onProgress?: (progress: SendProgress) => void;
    private onComplete?: () => void;
    private onError?: (error: Error) => void;

    private totalChunks: number;
    private sentChunks: number = 0;
    private bytesSent: number = 0;
    private startTime: number = 0;
    private isCancelled: boolean = false;
    private isComplete: boolean = false;

    /**
     * Create a new FileSender instance
     * @param file - File to send
     * @param dataChannel - Open RTCDataChannel
     * @param options - Configuration options
     */
    constructor(file: File, dataChannel: RTCDataChannel, options: FileSenderOptions = {}) {
        this.file = file;
        this.dataChannel = dataChannel;
        this.chunkSize = options.chunkSize ?? WEBRTC_CHUNK_SIZE;
        this.bufferThreshold = options.bufferThreshold ?? WEBRTC_BUFFER_THRESHOLD;
        this.onProgress = options.onProgress;
        this.onComplete = options.onComplete;
        this.onError = options.onError;

        // Calculate total chunks
        this.totalChunks = Math.ceil(file.size / this.chunkSize);
        if (this.totalChunks === 0) {
            this.totalChunks = 1; // Empty file = 1 empty chunk
        }

        // Set binary type for data channel
        this.dataChannel.binaryType = "arraybuffer";
    }

    /**
     * Start the file transfer
     * Sends manifest, all chunks, and completion message
     */
    async start(): Promise<void> {
        if (this.dataChannel.readyState !== "open") {
            throw new Error("DataChannel is not open");
        }

        this.startTime = Date.now();
        this.isCancelled = false;
        this.isComplete = false;

        try {
            // Send manifest
            await this.sendManifest();

            // Send all chunks
            await this.sendAllChunks();

            // Send completion
            if (!this.isCancelled) {
                await this.sendComplete();
                this.isComplete = true;
                this.onComplete?.();
            }
        } catch (error) {
            if (!this.isCancelled) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.onError?.(err);
            }
            throw error;
        }
    }

    /**
     * Cancel the file transfer
     */
    cancel(): void {
        this.isCancelled = true;
    }

    /**
     * Check if transfer is complete
     */
    isTransferComplete(): boolean {
        return this.isComplete;
    }

    /**
     * Get file manifest information
     * Used for resumable transfers to calculate missing chunks
     */
    getManifest(): { fileName: string; fileSize: number; mimeType: string; totalChunks: number } {
        return {
            fileName: this.file.name,
            fileSize: this.file.size,
            mimeType: this.file.type || "application/octet-stream",
            totalChunks: this.totalChunks,
        };
    }

    /**
     * Send only specific chunks (for resumable transfers)
     * @param chunkIndices - Array of chunk indices to send
     */
    async sendSpecificChunks(chunkIndices: number[]): Promise<void> {
        if (this.dataChannel.readyState !== "open") {
            throw new Error("DataChannel is not open");
        }

        this.startTime = Date.now();
        this.isCancelled = false;

        try {
            // Send each missing chunk
            for (let i = 0; i < chunkIndices.length; i++) {
                const chunkIndex = chunkIndices[i];
                if (chunkIndex === undefined) continue;

                if (this.isCancelled) {
                    throw new Error("Transfer cancelled");
                }

                // Validate chunk index
                if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
                    continue;
                }

                // Read chunk from file
                const start = chunkIndex * this.chunkSize;
                const end = Math.min(start + this.chunkSize, this.file.size);
                const blob = this.file.slice(start, end);
                const chunkData = await this.readBlobAsArrayBuffer(blob);

                // Create chunk buffer with index prefix
                const chunkBuffer = this.createChunkBuffer(chunkIndex, chunkData);

                // Wait for buffer space
                await this.waitForBuffer();

                // Send chunk
                this.dataChannel.send(chunkBuffer);

                // Update progress
                this.sentChunks = i + 1;
                this.bytesSent += chunkData.byteLength;
                this.updateProgress();
            }

            // Send completion after all missing chunks sent
            if (!this.isCancelled) {
                await this.sendComplete();
                this.isComplete = true;
                this.onComplete?.();
            }
        } catch (error) {
            if (!this.isCancelled) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.onError?.(err);
            }
            throw error;
        }
    }

    /**
     * Send the file manifest (metadata)
     */
    private async sendManifest(): Promise<void> {
        const manifest = {
            type: "manifest",
            fileName: this.file.name,
            fileSize: this.file.size,
            mimeType: this.file.type || "application/octet-stream",
            totalChunks: this.totalChunks,
        };

        await this.waitForBuffer();
        this.dataChannel.send(JSON.stringify(manifest));
    }

    /**
     * Send all file chunks
     */
    private async sendAllChunks(): Promise<void> {
        for (let i = 0; i < this.totalChunks; i++) {
            if (this.isCancelled) {
                throw new Error("Transfer cancelled");
            }

            // Read chunk from file
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, this.file.size);
            const blob = this.file.slice(start, end);
            const chunkData = await this.readBlobAsArrayBuffer(blob);

            // Create chunk buffer with index prefix
            const chunkBuffer = this.createChunkBuffer(i, chunkData);

            // Wait for buffer space if needed
            await this.waitForBuffer();

            // Send chunk
            this.dataChannel.send(chunkBuffer);

            // Update progress
            this.sentChunks = i + 1;
            this.bytesSent += chunkData.byteLength;
            this.updateProgress();
        }
    }

    /**
     * Send completion message
     */
    private async sendComplete(): Promise<void> {
        const complete = { type: "complete" };
        await this.waitForBuffer();
        this.dataChannel.send(JSON.stringify(complete));
    }

    /**
     * Create a chunk buffer with 4-byte big-endian index prefix
     * @param index - Chunk index
     * @param data - Chunk data
     */
    private createChunkBuffer(index: number, data: ArrayBuffer): ArrayBuffer {
        const buffer = new ArrayBuffer(4 + data.byteLength);
        const view = new DataView(buffer);

        // Write index as big-endian 32-bit unsigned int
        view.setUint32(0, index, false);

        // Copy chunk data
        const uint8 = new Uint8Array(buffer);
        uint8.set(new Uint8Array(data), 4);

        return buffer;
    }

    /**
     * Read a Blob as ArrayBuffer
     */
    private readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error("Failed to read file chunk"));
            reader.readAsArrayBuffer(blob);
        });
    }

    /**
     * Wait for buffer to have space before sending more data
     * Implements flow control to prevent buffer overflow
     */
    private waitForBuffer(): Promise<void> {
        return new Promise((resolve) => {
            const check = () => {
                if (this.isCancelled) {
                    resolve();
                    return;
                }

                if (this.dataChannel.bufferedAmount < this.bufferThreshold) {
                    resolve();
                } else {
                    // Wait for buffer to drain
                    const listener = () => {
                        this.dataChannel.removeEventListener("bufferedamountlow", listener);
                        resolve();
                    };

                    // Set threshold and listen
                    this.dataChannel.bufferedAmountLowThreshold = this.bufferThreshold / 2;
                    this.dataChannel.addEventListener("bufferedamountlow", listener);

                    // Fallback timeout in case event doesn't fire
                    setTimeout(check, 50);
                }
            };
            check();
        });
    }

    /**
     * Update and emit progress
     */
    private updateProgress(): void {
        const elapsed = Date.now() - this.startTime;
        const speed = elapsed > 0 ? (this.bytesSent / elapsed) * 1000 : 0;
        const remaining = this.file.size - this.bytesSent;
        const estimatedTimeRemaining = speed > 0 ? (remaining / speed) * 1000 : 0;

        const progress: SendProgress = {
            sentChunks: this.sentChunks,
            totalChunks: this.totalChunks,
            percent: Math.round((this.sentChunks / this.totalChunks) * 100),
            bytesSent: this.bytesSent,
            totalBytes: this.file.size,
            speed: Math.round(speed),
            estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
        };

        this.onProgress?.(progress);
    }
}
