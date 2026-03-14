/**
 * E2EFileSender - P2P File Sending with E2E Encryption
 * 
 * Extends FileSender to add End-to-End encryption.
 * Encrypts each chunk before sending.
 * 
 * Protocol (E2E mode):
 * 1. Send manifest (JSON): { type, fileName, fileSize, mimeType, totalChunks, e2e: { iv } }
 * 2. Send encrypted chunks (Binary): [4-byte BE index][encrypted chunk data + auth tag]
 * 3. Send complete (JSON): { type: "complete" }
 * 
 * @module lib/p2p/e2eFileSender
 */

import type { SendProgress, FileSenderOptions } from "./fileSender";
import type { E2ESession, E2EManifestData } from "./e2eEncryption";
import { encryptChunk, createE2EManifestData } from "./e2eEncryption";

import { WEBRTC_CHUNK_SIZE, WEBRTC_BUFFER_THRESHOLD } from "@cloudvault/shared/core/transfer";

/**
 * E2E FileSender Options
 */
export interface E2EFileSenderOptions extends FileSenderOptions {
    /** E2E encryption session (required for encryption) */
    e2eSession: E2ESession;
}

/**
 * E2EFileSender class
 * 
 * Handles chunked file transfer with E2E encryption.
 */
export class E2EFileSender {
    private file: File;
    private dataChannel: RTCDataChannel;
    private e2eSession: E2ESession;
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

    constructor(file: File, dataChannel: RTCDataChannel, options: E2EFileSenderOptions) {
        this.file = file;
        this.dataChannel = dataChannel;
        this.e2eSession = options.e2eSession;
        this.chunkSize = options.chunkSize ?? WEBRTC_CHUNK_SIZE;
        this.bufferThreshold = options.bufferThreshold ?? WEBRTC_BUFFER_THRESHOLD;
        this.onProgress = options.onProgress;
        this.onComplete = options.onComplete;
        this.onError = options.onError;

        // Calculate total chunks
        this.totalChunks = Math.ceil(file.size / this.chunkSize);
        if (this.totalChunks === 0) {
            this.totalChunks = 1;
        }

        // Set binary type
        this.dataChannel.binaryType = "arraybuffer";
    }

    /**
     * Start the encrypted file transfer
     */
    async start(): Promise<void> {
        if (this.dataChannel.readyState !== "open") {
            throw new Error("DataChannel is not open");
        }

        this.startTime = Date.now();
        this.isCancelled = false;
        this.isComplete = false;

        try {
            // Send manifest with E2E data
            await this.sendManifest();

            // Send all encrypted chunks
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
     * Cancel the transfer
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
     * Send manifest with E2E encryption data
     */
    private async sendManifest(): Promise<void> {
        // Create E2E data for manifest
        const e2eData: E2EManifestData = createE2EManifestData(this.e2eSession);

        const manifest = {
            type: "manifest",
            fileName: this.file.name,
            fileSize: this.file.size,
            mimeType: this.file.type || "application/octet-stream",
            totalChunks: this.totalChunks,
            // E2E encryption data
            e2e: e2eData,
        };

        await this.waitForBuffer();
        this.dataChannel.send(JSON.stringify(manifest));
    }

    /**
     * Send all chunks with encryption
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

            // Encrypt the chunk
            const encryptedChunk = await encryptChunk(this.e2eSession, chunkData, i);

            // Create chunk buffer with index prefix
            const chunkBuffer = this.createChunkBuffer(i, encryptedChunk);

            // Wait for buffer space
            await this.waitForBuffer();

            // Send encrypted chunk
            this.dataChannel.send(chunkBuffer);

            // Update progress (track original bytes, not encrypted size)
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
     * Create chunk buffer with 4-byte big-endian index prefix
     */
    private createChunkBuffer(index: number, data: ArrayBuffer): ArrayBuffer {
        const buffer = new ArrayBuffer(4 + data.byteLength);
        const view = new DataView(buffer);
        view.setUint32(0, index, false);
        const uint8 = new Uint8Array(buffer);
        uint8.set(new Uint8Array(data), 4);
        return buffer;
    }

    /**
     * Read Blob as ArrayBuffer
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
     * Wait for buffer to have space
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
                    const listener = () => {
                        this.dataChannel.removeEventListener("bufferedamountlow", listener);
                        resolve();
                    };
                    this.dataChannel.bufferedAmountLowThreshold = this.bufferThreshold / 2;
                    this.dataChannel.addEventListener("bufferedamountlow", listener);
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
