/**
 * Transfer State Storage - IndexedDB Persistence for Resumable Transfers
 * 
 * Provides a robust storage layer for persisting P2P transfer state,
 * enabling resume functionality after connection drops or browser restarts.
 * 
 * Features:
 * - Generic interface for storage abstraction
 * - IndexedDB implementation for large data support
 * - Automatic cleanup of expired transfers
 * - Support for both simple and chunked protocols
 * 
 * @module lib/p2p/transferStateStorage
 */


/**
 * Transfer protocol type
 */
export type TransferProtocol = "simple" | "chunked";

/**
 * Transfer direction
 */
export type TransferDirection = "send" | "receive";

/**
 * Metadata about the transfer (small, always persisted)
 */
export interface TransferStateMetadata {
    /** Unique session ID */
    sessionId: string;
    /** Protocol used (simple for <100MB, chunked for >=100MB) */
    protocol: TransferProtocol;
    /** Direction of transfer */
    direction: TransferDirection;
    /** File name */
    fileName: string;
    /** Total file size in bytes */
    fileSize: number;
    /** MIME type */
    mimeType: string;
    /** Total number of chunks */
    totalChunks: number;
    /** Indices of received/sent chunks */
    completedChunks: number[];
    /** Bytes transferred so far */
    bytesTransferred: number;
    /** Timestamp when state was first created */
    createdAt: number;
    /** Timestamp when state was last updated */
    updatedAt: number;
    /** Optional expiration timestamp (auto-cleanup) */
    expiresAt?: number;
    /** E2E encryption enabled */
    isE2E: boolean;
    /** Optional peer identifier for reconnection */
    peerId?: string;
    /** Optional share URL for reconnection */
    shareUrl?: string;
}

/**
 * Full transfer state including chunk data
 */
export interface SavedTransferState extends TransferStateMetadata {
    /** Chunk data stored as ArrayBuffer (receiver only) */
    chunks: Map<number, ArrayBuffer>;
    /** Chunk hashes for verification (optional) */
    chunkHashes?: Map<number, string>;
    /** Original manifest for protocol compatibility */
    manifest?: unknown;
}

/**
 * Serializable version of SavedTransferState for IndexedDB
 */
interface SerializedTransferState {
    metadata: Omit<TransferStateMetadata, "completedChunks"> & {
        completedChunks: string; // JSON array
    };
    /** Chunks stored as base64 strings for IndexedDB compatibility */
    chunks: Array<{ index: number; data: string }>;
    chunkHashes?: Array<{ index: number; hash: string }>;
    manifest?: string; // JSON stringified
}

/**
 * Storage interface for transfer state
 * Allows swapping implementations (IndexedDB, localStorage, etc.)
 */
export interface ITransferStateStorage {
    /**
     * Save transfer state
     */
    saveState(state: SavedTransferState): Promise<void>;

    /**
     * Load transfer state by session ID
     */
    loadState(sessionId: string): Promise<SavedTransferState | null>;

    /**
     * Update only metadata (faster than full save)
     */
    updateMetadata(sessionId: string, updates: Partial<TransferStateMetadata>): Promise<void>;

    /**
     * Add a single chunk to existing state
     */
    addChunk(sessionId: string, index: number, data: ArrayBuffer, hash?: string): Promise<void>;

    /**
     * Delete transfer state
     */
    deleteState(sessionId: string): Promise<void>;

    /**
     * List all pending (incomplete) transfers
     */
    listPendingTransfers(): Promise<TransferStateMetadata[]>;

    /**
     * Clean up expired transfers
     */
    cleanupExpired(): Promise<number>;

    /**
     * Check if a session exists
     */
    hasState(sessionId: string): Promise<boolean>;

    /**
     * Get storage usage info
     */
    getStorageInfo(): Promise<{ used: number; available: number }>;
}


const DB_NAME = "cloudvault-p2p-transfers";
const DB_VERSION = 1;
const STORE_METADATA = "metadata";
const STORE_CHUNKS = "chunks";

/** Default expiration: 24 hours */
const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/** Maximum chunk size for individual IndexedDB writes (5MB) */
const MAX_CHUNK_BATCH_SIZE = 5 * 1024 * 1024;


/**
 * IndexedDB-based transfer state storage
 * 
 * Uses two object stores:
 * - metadata: Small transfer info for fast listing
 * - chunks: Large chunk data, separate for efficiency
 */
export class IndexedDBTransferStorage implements ITransferStateStorage {
    private db: IDBDatabase | null = null;
    private dbPromise: Promise<IDBDatabase> | null = null;

    /**
     * Get or create the IndexedDB database
     */
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

                // Metadata store: indexed by sessionId
                if (!db.objectStoreNames.contains(STORE_METADATA)) {
                    const metadataStore = db.createObjectStore(STORE_METADATA, {
                        keyPath: "sessionId",
                    });
                    metadataStore.createIndex("createdAt", "createdAt", { unique: false });
                    metadataStore.createIndex("expiresAt", "expiresAt", { unique: false });
                    metadataStore.createIndex("direction", "direction", { unique: false });
                }

                // Chunks store: compound key [sessionId, chunkIndex]
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

    /**
     * Save complete transfer state
     */
    async saveState(state: SavedTransferState): Promise<void> {
        const db = await this.getDB();

        // Prepare metadata
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

        // Use transaction for atomicity
        const tx = db.transaction([STORE_METADATA, STORE_CHUNKS], "readwrite");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();

            // Save metadata
            const metadataStore = tx.objectStore(STORE_METADATA);
            metadataStore.put(metadata);

            // Save chunks
            const chunksStore = tx.objectStore(STORE_CHUNKS);
            for (const [index, data] of state.chunks) {
                chunksStore.put({
                    sessionId: state.sessionId,
                    index,
                    data, // ArrayBuffer stored directly
                    hash: state.chunkHashes?.get(index),
                });
            }
        });
    }

    /**
     * Load transfer state by session ID
     */
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

                // Load chunks
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

    /**
     * Update only metadata (faster than full save)
     */
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
                    sessionId, // Ensure key is preserved
                    updatedAt: Date.now(),
                };

                store.put(updated);
            };
        });
    }

    /**
     * Add a single chunk to existing state (optimized for streaming)
     */
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

            // Add chunk
            const chunksStore = tx.objectStore(STORE_CHUNKS);
            chunksStore.put({
                sessionId,
                index,
                data,
                hash,
            });

            // Update metadata
            const metadataStore = tx.objectStore(STORE_METADATA);
            const getRequest = metadataStore.get(sessionId);

            getRequest.onsuccess = () => {
                const metadata = getRequest.result as TransferStateMetadata | undefined;
                if (metadata) {
                    // Add to completedChunks if not already present
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

    /**
     * Delete transfer state and all associated chunks
     */
    async deleteState(sessionId: string): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction([STORE_METADATA, STORE_CHUNKS], "readwrite");

        return new Promise((resolve, reject) => {
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();

            // Delete metadata
            tx.objectStore(STORE_METADATA).delete(sessionId);

            // Delete all chunks for this session
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

    /**
     * List all pending (incomplete) transfers
     */
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

                // Filter: only receive direction, not expired, not complete
                const pending = allTransfers.filter((t) => {
                    const isNotExpired = !t.expiresAt || t.expiresAt > now;
                    const isIncomplete = t.completedChunks.length < t.totalChunks;
                    const isReceiving = t.direction === "receive";
                    return isNotExpired && isIncomplete && isReceiving;
                });

                // Sort by most recent
                pending.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(pending);
            };
        });
    }

    /**
     * Clean up expired transfers
     * Returns number of transfers deleted
     */
    async cleanupExpired(): Promise<number> {
        const db = await this.getDB();
        const tx = db.transaction(STORE_METADATA, "readonly");

        // First, find expired sessions
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

        // Delete each expired session
        for (const sessionId of expiredSessions) {
            await this.deleteState(sessionId);
        }

        return expiredSessions.length;
    }

    /**
     * Check if a session exists
     */
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

    /**
     * Get storage usage information
     */
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

    /**
     * Close the database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.dbPromise = null;
        }
    }
}


let storageInstance: IndexedDBTransferStorage | null = null;

/**
 * Get the singleton storage instance
 */
export function getTransferStorage(): ITransferStateStorage {
    if (!storageInstance) {
        storageInstance = new IndexedDBTransferStorage();
    }
    return storageInstance;
}

/**
 * Create a new SavedTransferState with defaults
 */
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
