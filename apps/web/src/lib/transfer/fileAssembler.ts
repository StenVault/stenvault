/**
 * FileAssembler — collect chunks and assemble into a complete Blob.
 *
 * Used by Local Send (LAN WebRTC AirDrop). Supports out-of-order arrival,
 * optional SHA-256 chunk verification, IndexedDB persistence for resume,
 * and progressive memory release via streaming download.
 */
import {
    getTransferStorage,
    createTransferState,
    type SavedTransferState,
    type ITransferStateStorage,
} from "./transferStateStorage";
import { streamDownloadToDisk } from '@/lib/platform';

export interface FileManifest {
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    chunkHashes?: string[];
}

export interface ChunkData {
    index: number;
    data: ArrayBuffer;
    hash?: string;
}

export interface AssemblyProgress {
    completedChunks: number;
    totalChunks: number;
    percent: number;
    bytesReceived: number;
    totalBytes: number;
}

export class FileAssembler {
    private chunks: Map<number, ArrayBuffer>;
    private manifest: FileManifest;
    private bytesReceived: number = 0;

    private sessionId: string | null = null;
    private autoPersist: boolean = false;
    private storage: ITransferStateStorage | null = null;
    private isE2E: boolean = false;
    private shareUrl?: string;

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

    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    getSessionId(): string | null {
        return this.sessionId;
    }

    enableAutoPersist(): void {
        this.autoPersist = true;
        this.storage = getTransferStorage();
    }

    addChunk(chunk: ChunkData): boolean {
        if (chunk.index < 0 || chunk.index >= this.manifest.totalChunks) {
            return false;
        }

        if (this.chunks.has(chunk.index)) {
            return true;
        }

        if (this.manifest.chunkHashes && chunk.hash) {
            const expectedHash = this.manifest.chunkHashes[chunk.index];
            if (expectedHash && expectedHash !== chunk.hash) {
                return false;
            }
        }

        this.chunks.set(chunk.index, chunk.data);
        this.bytesReceived += chunk.data.byteLength;

        if (this.autoPersist && this.storage && this.sessionId) {
            this.storage.addChunk(this.sessionId, chunk.index, chunk.data, chunk.hash)
                .catch(() => {});
        }

        return true;
    }

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

    isComplete(): boolean {
        return this.chunks.size === this.manifest.totalChunks;
    }

    getMissingChunks(): number[] {
        const missing: number[] = [];
        for (let i = 0; i < this.manifest.totalChunks; i++) {
            if (!this.chunks.has(i)) {
                missing.push(i);
            }
        }
        return missing;
    }

    assemble(): Blob {
        if (!this.isComplete()) {
            const missing = this.getMissingChunks();
            throw new Error(`Cannot assemble: missing ${missing.length} chunks (${missing.slice(0, 5).join(", ")}...)`);
        }

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

    getDownloadUrl(): string {
        const blob = this.assemble();
        return URL.createObjectURL(blob);
    }

    downloadFile(): void {
        const url = this.getDownloadUrl();
        const a = document.createElement("a");
        a.href = url;
        a.download = this.manifest.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

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
                    chunksMap.delete(i);
                }
                controller.close();
            },
        });
    }

    async downloadFileStreaming(): Promise<void> {
        const stream = this.getDownloadStream();
        await streamDownloadToDisk(stream, {
            filename: this.manifest.fileName,
            totalSize: this.manifest.fileSize,
            mimeType: this.manifest.mimeType,
        });
    }

    getManifest(): FileManifest {
        return { ...this.manifest };
    }

    reset(deleteFromStorage: boolean = false): void {
        this.chunks.clear();
        this.bytesReceived = 0;

        if (deleteFromStorage && this.storage && this.sessionId) {
            this.storage.deleteState(this.sessionId)
                .catch(() => {});
        }
    }

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

    static async restoreFromState(sessionId: string): Promise<FileAssembler | null> {
        const storage = getTransferStorage();
        const state = await storage.loadState(sessionId);

        if (!state) {
            return null;
        }

        if (state.protocol !== "simple") {
            return null;
        }

        const manifest: FileManifest = state.manifest as FileManifest ?? {
            fileName: state.fileName,
            fileSize: state.fileSize,
            mimeType: state.mimeType,
            totalChunks: state.totalChunks,
        };

        const assembler = new FileAssembler(manifest, {
            sessionId,
            autoPersist: true,
            isE2E: state.isE2E,
            shareUrl: state.shareUrl,
        });

        for (const [index, data] of state.chunks) {
            assembler.chunks.set(index, data);
            assembler.bytesReceived += data.byteLength;
        }

        return assembler;
    }

    async deleteSavedState(): Promise<void> {
        if (!this.sessionId) return;

        const storage = this.storage ?? getTransferStorage();
        await storage.deleteState(this.sessionId);
    }

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
