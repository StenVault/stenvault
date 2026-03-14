/**
 * useChunkedTransfer Hook
 * 
 * Manages BitTorrent-style chunked file transfers over WebRTC.
 * Supports resumable downloads and parallel chunk requests.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
    ChunkSender,
    ChunkAssembler,
    generateManifest,
    serializeChunkResponse,
    deserializeChunkResponse,
    createChunkRequest,
    createAck,
    createManifestMessage,
    calculateOptimalChunkSize,
    estimateTransferTime,
    type FileManifest,
    type ChunkMessage,
    type TransferProgress,
    type ChunkData,
    MAX_CONCURRENT_CHUNKS,
} from "@/lib/p2pChunkedTransfer";

export interface ChunkedTransferState {
    status: "idle" | "preparing" | "transferring" | "verifying" | "completed" | "failed";
    progress: TransferProgress | null;
    error: string | null;
    speed: number; // bytes per second
    estimatedTimeRemaining: number; // milliseconds
}

export interface UseChunkedTransferOptions {
    onProgress?: (progress: TransferProgress) => void;
    onComplete?: (file: File) => void;
    onError?: (error: Error) => void;
    maxConcurrentChunks?: number;
}

export function useChunkedTransfer(options: UseChunkedTransferOptions = {}) {
    const {
        onProgress,
        onComplete,
        onError,
        maxConcurrentChunks = MAX_CONCURRENT_CHUNKS,
    } = options;

    const [state, setState] = useState<ChunkedTransferState>({
        status: "idle",
        progress: null,
        error: null,
        speed: 0,
        estimatedTimeRemaining: 0,
    });

    // Refs
    const senderRef = useRef<ChunkSender | null>(null);
    const assemblerRef = useRef<ChunkAssembler | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const startTimeRef = useRef<number>(0);
    const lastProgressRef = useRef<TransferProgress | null>(null);
    const pendingRequestsRef = useRef<Set<number>>(new Set());
    const isSenderRef = useRef<boolean>(false);

    // Speed calculation
    const speedWindowRef = useRef<Array<{ bytes: number; time: number }>>([]);
    const SPEED_WINDOW_SIZE = 10;

    /**
     * Calculate current transfer speed
     */
    const calculateSpeed = useCallback((bytesTransferred: number): number => {
        const now = Date.now();
        speedWindowRef.current.push({ bytes: bytesTransferred, time: now });

        // Keep only last N measurements
        if (speedWindowRef.current.length > SPEED_WINDOW_SIZE) {
            speedWindowRef.current.shift();
        }

        if (speedWindowRef.current.length < 2) return 0;

        const first = speedWindowRef.current[0];
        const last = speedWindowRef.current[speedWindowRef.current.length - 1];

        if (!first || !last) return 0;

        const bytesDiff = last.bytes - first.bytes;
        const timeDiff = (last.time - first.time) / 1000; // Convert to seconds

        return timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0;
    }, []);

    /**
     * Update progress state
     */
    const updateProgress = useCallback((progress: TransferProgress) => {
        const speed = calculateSpeed(progress.bytesTransferred);
        const elapsed = Date.now() - startTimeRef.current;
        const estimated = estimateTransferTime(
            progress.totalChunks,
            progress.completedChunks,
            elapsed
        );

        setState(prev => ({
            ...prev,
            progress,
            speed,
            estimatedTimeRemaining: estimated,
        }));

        lastProgressRef.current = progress;
        onProgress?.(progress);
    }, [calculateSpeed, onProgress]);

    /**
     * Initialize as sender
     */
    const initializeSender = useCallback(async (
        file: File,
        dataChannel: RTCDataChannel
    ): Promise<FileManifest> => {
        setState(prev => ({ ...prev, status: "preparing", error: null }));
        startTimeRef.current = Date.now();
        speedWindowRef.current = [];
        isSenderRef.current = true;

        const chunkSize = calculateOptimalChunkSize(file.size);
        const sender = new ChunkSender(file);
        const manifest = await sender.initialize(chunkSize);

        senderRef.current = sender;
        dataChannelRef.current = dataChannel;

        // Send manifest to receiver
        const manifestMessage = createManifestMessage(manifest);
        dataChannel.send(JSON.stringify(manifestMessage));

        setState(prev => ({ ...prev, status: "transferring" }));

        return manifest;
    }, []);

    /**
     * Initialize as receiver
     */
    const initializeReceiver = useCallback((
        dataChannel: RTCDataChannel
    ): void => {
        setState(prev => ({ ...prev, status: "preparing", error: null }));
        startTimeRef.current = Date.now();
        speedWindowRef.current = [];
        isSenderRef.current = false;

        assemblerRef.current = new ChunkAssembler();
        dataChannelRef.current = dataChannel;
        pendingRequestsRef.current.clear();
    }, []);

    /**
     * Handle incoming message (for both sender and receiver)
     */
    const handleMessage = useCallback(async (event: MessageEvent) => {
        try {
            const message: ChunkMessage = JSON.parse(event.data);

            switch (message.type) {
                case "manifest":
                    // Receiver: got manifest, start requesting chunks
                    if (assemblerRef.current) {
                        assemblerRef.current.setManifest(message.manifest);
                        setState(prev => ({ ...prev, status: "transferring" }));
                        // Request first batch of chunks
                        requestNextChunks();
                    }
                    break;

                case "chunk_request":
                    // Sender: got chunk request, send chunk
                    if (senderRef.current && dataChannelRef.current) {
                        const chunk = await senderRef.current.getChunk(message.index);
                        const response = serializeChunkResponse(chunk);
                        dataChannelRef.current.send(JSON.stringify(response));
                        senderRef.current.markSent(message.index);
                    }
                    break;

                case "chunk_response":
                    // Receiver: got chunk, verify and store
                    if (assemblerRef.current && dataChannelRef.current) {
                        const chunk = deserializeChunkResponse(message);
                        const success = await assemblerRef.current.addChunk(chunk);

                        // Send acknowledgment
                        const ack = createAck(message.index, success);
                        dataChannelRef.current.send(JSON.stringify(ack));

                        pendingRequestsRef.current.delete(message.index);

                        // Update progress
                        updateProgress(assemblerRef.current.getProgress());

                        // Check if complete
                        if (assemblerRef.current.isComplete()) {
                            await handleTransferComplete();
                        } else {
                            // Request more chunks
                            requestNextChunks();
                        }
                    }
                    break;

                case "ack":
                    // Sender: got acknowledgment
                    if (senderRef.current) {
                        if (message.success) {
                            senderRef.current.markAcked(message.index);
                            updateProgress(senderRef.current.getProgress());

                            if (senderRef.current.isComplete()) {
                                setState(prev => ({ ...prev, status: "completed" }));
                            }
                        } else {
                            console.error(`Chunk ${message.index} failed: ${message.error}`);
                        }
                    }
                    break;
            }
        } catch (err) {
            console.error("Error handling message:", err);
        }
    }, [updateProgress]);

    /**
     * Request next batch of chunks (receiver side)
     */
    const requestNextChunks = useCallback(() => {
        if (!assemblerRef.current || !dataChannelRef.current) return;

        const remaining = assemblerRef.current.getRemainingChunks();
        const pending = pendingRequestsRef.current;
        const available = remaining.filter(i => !pending.has(i));

        // Request up to maxConcurrentChunks
        const toRequest = available.slice(0, maxConcurrentChunks - pending.size);

        for (const index of toRequest) {
            const request = createChunkRequest(index);
            dataChannelRef.current.send(JSON.stringify(request));
            pending.add(index);
        }
    }, [maxConcurrentChunks]);

    /**
     * Handle transfer completion (receiver side)
     */
    const handleTransferComplete = useCallback(async () => {
        if (!assemblerRef.current) return;

        setState(prev => ({ ...prev, status: "verifying" }));

        try {
            const file = await assemblerRef.current.assemble();
            setState(prev => ({ ...prev, status: "completed" }));
            onComplete?.(file);
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Assembly failed");
            setState(prev => ({
                ...prev,
                status: "failed",
                error: error.message,
            }));
            onError?.(error);
        }
    }, [onComplete, onError]);

    /**
     * Cancel the transfer
     */
    const cancel = useCallback(() => {
        senderRef.current = null;
        assemblerRef.current?.reset();
        assemblerRef.current = null;
        pendingRequestsRef.current.clear();

        setState({
            status: "idle",
            progress: null,
            error: null,
            speed: 0,
            estimatedTimeRemaining: 0,
        });
    }, []);

    /**
     * Retry failed chunks
     */
    const retryFailed = useCallback(() => {
        if (!assemblerRef.current || !dataChannelRef.current) return;

        const failed = assemblerRef.current.getFailedChunks();
        for (const index of failed) {
            const request = createChunkRequest(index);
            dataChannelRef.current.send(JSON.stringify(request));
            pendingRequestsRef.current.add(index);
        }
    }, []);

    /**
     * Get assembler for direct access
     */
    const getAssembler = useCallback(() => assemblerRef.current, []);

    /**
     * Get sender for direct access
     */
    const getSender = useCallback(() => senderRef.current, []);

    // Cleanup
    useEffect(() => {
        return () => {
            cancel();
        };
    }, [cancel]);

    return {
        state,
        initializeSender,
        initializeReceiver,
        handleMessage,
        cancel,
        retryFailed,
        getAssembler,
        getSender,
        isSender: isSenderRef.current,
    };
}
