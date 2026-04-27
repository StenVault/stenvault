/**
 * Transfer State Storage — IndexedDB persistence for resumable transfers.
 *
 * Used by `FileAssembler` to checkpoint received chunks so a transfer can
 * resume after a connection drop or browser restart.
 */

export type TransferProtocol = "simple" | "chunked";
export type TransferDirection = "send" | "receive";

export interface TransferStateMetadata {
    sessionId: string;
    protocol: TransferProtocol;
    direction: TransferDirection;
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    completedChunks: number[];
    bytesTransferred: number;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
    isE2E: boolean;
    peerId?: string;
    shareUrl?: string;
}

export interface SavedTransferState extends TransferStateMetadata {
    chunks: Map<number, ArrayBuffer>;
    chunkHashes?: Map<number, string>;
    manifest?: unknown;
}

export interface ITransferStateStorage {
    saveState(state: SavedTransferState): Promise<void>;
    loadState(sessionId: string): Promise<SavedTransferState | null>;
    updateMetadata(sessionId: string, updates: Partial<TransferStateMetadata>): Promise<void>;
    addChunk(sessionId: string, index: number, data: ArrayBuffer, hash?: string): Promise<void>;
    deleteState(sessionId: string): Promise<void>;
    listPendingTransfers(): Promise<TransferStateMetadata[]>;
    cleanupExpired(): Promise<number>;
    hasState(sessionId: string): Promise<boolean>;
    getStorageInfo(): Promise<{ used: number; available: number }>;
}

const DB_NAME = "stenvault-transfers";
const DB_VERSION = 1;
const STORE_METADATA = "metadata";
const STORE_CHUNKS = "chunks";

const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000;

export class IndexedDBTransferStorage implements ITransferStateStorage {
    private db: IDBDatabase | null = null;
    private dbPromise: Promise<IDBDatabase> | null = null;

    private async getDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains(STORE_METADATA)) {
                    const metadataStore = db.createObjectStore(STORE_METADATA, {
                        keyPath: "sessionId",
                    });
                    metadataStore.createIndex("createdAt", "createdAt", { unique: false });
                    metadataStore.createIndex("expiresAt", "expiresAt", { unique: false });
                    metadataStore.createIndex("direction", "direction", { unique: false });
                }

                if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
                    const chunksStore = db.createObjectStore(STORE_CHUNKS, {
                        keyPath: ["sessionId", "index"],
                    });
                    chunksStore.createIndex("sessionId", "sessionId", { unique: false });
                }

            };
        });

        return this.dbPromise;
    }

    async saveState(state: SavedTransferState): Promise<void> {
        const db = await this.getDB();

        const metadata: TransferStateMetadata = {
            sessionId: state.sessionId,
            protocol: state.protocol,
            direction: state.direction,
            fileName: state.fileName,
            fileSize: state.fileSize,
            mimeType: state.mimeType,
            totalChunks: state.totalChunks,
            completedChunks: state.completedChunks,
            bytesTransferred: state.bytesTransferred,
            createdAt: state.createdAt,
            updatedAt: Date.now(),
            expiresAt: state.expiresAt ?? (Date.now() + DEFAULT_EXPIRATION_MS),
            isE2E: state.isE2E,
            peerId: state.peerId,
            shareUrl: state.shareUrl,
        };

        const tx = db.transaction([STORE_METADATA, STORE_CHUNKS], "readwrite");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();

            const metadataStore = tx.objectStore(STORE_METADATA);
            metadataStore.put(metadata);

            const chunksStore = tx.objectStore(STORE_CHUNKS);
            for (const [index, data] of state.chunks) {
                chunksStore.put({
                    sessionId: state.sessionId,
                    index,
                    data,
                    hash: state.chunkHashes?.get(index),
                });
            }
        });
    }

    async loadState(sessionId: string): Promise<SavedTransferState | null> {
        const db = await this.getDB();
        const tx = db.transaction([STORE_METADATA, STORE_CHUNKS], "readonly");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);

            const metadataStore = tx.objectStore(STORE_METADATA);
            const metadataRequest = metadataStore.get(sessionId);

            metadataRequest.onsuccess = () => {
                const metadata = metadataRequest.result as TransferStateMetadata | undefined;
                if (!metadata) {
                    resolve(null);
                    return;
                }

                const chunksStore = tx.objectStore(STORE_CHUNKS);
                const chunksIndex = chunksStore.index("sessionId");
                const chunksRequest = chunksIndex.getAll(sessionId);

                chunksRequest.onsuccess = () => {
                    const chunkRecords = chunksRequest.result as Array<{
                        sessionId: string;
                        index: number;
                        data: ArrayBuffer;
                        hash?: string;
                    }>;

                    const chunks = new Map<number, ArrayBuffer>();
                    const chunkHashes = new Map<number, string>();

                    for (const record of chunkRecords) {
                        chunks.set(record.index, record.data);
                        if (record.hash) {
                            chunkHashes.set(record.index, record.hash);
                        }
                    }

                    resolve({
                        ...metadata,
                        chunks,
                        chunkHashes: chunkHashes.size > 0 ? chunkHashes : undefined,
                    });
                };
            };
        });
    }

    async updateMetadata(
        sessionId: string,
        updates: Partial<TransferStateMetadata>
    ): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_METADATA, "readwrite");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();

            const store = tx.objectStore(STORE_METADATA);
            const getRequest = store.get(sessionId);

            getRequest.onsuccess = () => {
                const existing = getRequest.result as TransferStateMetadata | undefined;
                if (!existing) {
                    reject(new Error(`Session ${sessionId} not found`));
                    return;
                }

                const updated = {
                    ...existing,
                    ...updates,
                    sessionId,
                    updatedAt: Date.now(),
                };

                store.put(updated);
            };
        });
    }

    async addChunk(
        sessionId: string,
        index: number,
        data: ArrayBuffer,
        hash?: string
    ): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction([STORE_METADATA, STORE_CHUNKS], "readwrite");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();

            const chunksStore = tx.objectStore(STORE_CHUNKS);
            chunksStore.put({
                sessionId,
                index,
                data,
                hash,
            });

            const metadataStore = tx.objectStore(STORE_METADATA);
            const getRequest = metadataStore.get(sessionId);

            getRequest.onsuccess = () => {
                const metadata = getRequest.result as TransferStateMetadata | undefined;
                if (metadata) {
                    if (!metadata.completedChunks.includes(index)) {
                        metadata.completedChunks.push(index);
                        metadata.completedChunks.sort((a, b) => a - b);
                    }
                    metadata.bytesTransferred += data.byteLength;
                    metadata.updatedAt = Date.now();
                    metadataStore.put(metadata);
                }
            };
        });
    }

    async deleteState(sessionId: string): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction([STORE_METADATA, STORE_CHUNKS], "readwrite");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();

            tx.objectStore(STORE_METADATA).delete(sessionId);

            const chunksStore = tx.objectStore(STORE_CHUNKS);
            const chunksIndex = chunksStore.index("sessionId");
            const request = chunksIndex.openKeyCursor(IDBKeyRange.only(sessionId));

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    chunksStore.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
        });
    }

    async listPendingTransfers(): Promise<TransferStateMetadata[]> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_METADATA, "readonly");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);

            const store = tx.objectStore(STORE_METADATA);
            const request = store.getAll();

            request.onsuccess = () => {
                const allTransfers = request.result as TransferStateMetadata[];
                const now = Date.now();

                const pending = allTransfers.filter((t) => {
                    const isNotExpired = !t.expiresAt || t.expiresAt > now;
                    const isIncomplete = t.completedChunks.length < t.totalChunks;
                    const isReceiving = t.direction === "receive";
                    return isNotExpired && isIncomplete && isReceiving;
                });

                pending.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(pending);
            };
        });
    }

    async cleanupExpired(): Promise<number> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_METADATA, "readonly");

        const expiredSessions: string[] = await new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);

            const store = tx.objectStore(STORE_METADATA);
            const index = store.index("expiresAt");
            const now = Date.now();
            const range = IDBKeyRange.upperBound(now);
            const request = index.getAll(range);

            request.onsuccess = () => {
                const expired = request.result as TransferStateMetadata[];
                resolve(expired.map((t) => t.sessionId));
            };
        });

        for (const sessionId of expiredSessions) {
            await this.deleteState(sessionId);
        }

        return expiredSessions.length;
    }

    async hasState(sessionId: string): Promise<boolean> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_METADATA, "readonly");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);

            const store = tx.objectStore(STORE_METADATA);
            const request = store.count(sessionId);

            request.onsuccess = () => {
                resolve(request.result > 0);
            };
        });
    }

    async getStorageInfo(): Promise<{ used: number; available: number }> {
        if ("storage" in navigator && "estimate" in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                used: estimate.usage ?? 0,
                available: estimate.quota ?? 0,
            };
        }
        return { used: 0, available: 0 };
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.dbPromise = null;
        }
    }
}

let storageInstance: IndexedDBTransferStorage | null = null;

export function getTransferStorage(): ITransferStateStorage {
    if (!storageInstance) {
        storageInstance = new IndexedDBTransferStorage();
    }
    return storageInstance;
}

export function createTransferState(
    params: Pick<
        SavedTransferState,
        | "sessionId"
        | "protocol"
        | "direction"
        | "fileName"
        | "fileSize"
        | "mimeType"
        | "totalChunks"
        | "isE2E"
    > &
        Partial<SavedTransferState>
): SavedTransferState {
    const now = Date.now();
    return {
        sessionId: params.sessionId,
        protocol: params.protocol,
        direction: params.direction,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        totalChunks: params.totalChunks,
        completedChunks: params.completedChunks ?? [],
        bytesTransferred: params.bytesTransferred ?? 0,
        createdAt: params.createdAt ?? now,
        updatedAt: params.updatedAt ?? now,
        expiresAt: params.expiresAt ?? now + DEFAULT_EXPIRATION_MS,
        isE2E: params.isE2E,
        peerId: params.peerId,
        shareUrl: params.shareUrl,
        chunks: params.chunks ?? new Map(),
        chunkHashes: params.chunkHashes,
        manifest: params.manifest,
    };
}
