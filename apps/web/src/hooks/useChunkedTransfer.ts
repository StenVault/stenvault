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

    const senderRef = useRef<ChunkSender | null>(null);
    const assemblerRef = useRef<ChunkAssembler | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const startTimeRef = useRef<number>(0);
    const lastProgressRef = useRef<TransferProgress | null>(null);
    const pendingRequestsRef = useRef<Set<number>>(new Set());
    const isSenderRef = useRef<boolean>(false);

    const speedWindowRef = useRef<Array<{ bytes: number; time: number }>>([]);
    const SPEED_WINDOW_SIZE = 10;

    const calculateSpeed = useCallback((bytesTransferred: number): number => {
        const now = Date.now();
        speedWindowRef.current.push({ bytes: bytesTransferred, time: now });

        if (speedWindowRef.current.length > SPEED_WINDOW_SIZE) {
            speedWindowRef.current.shift();
        }

        if (speedWindowRef.current.length < 2) return 0;

        const first = speedWindowRef.current[0];
        const last = speedWindowRef.current[speedWindowRef.current.length - 1];

        if (!first || !last) return 0;

        const bytesDiff = last.bytes - first.bytes;
        const timeDiff = (last.time - first.time) / 1000;

        return timeDiff > 0 ? Math.round(bytesDiff / timeDiff) : 0;
    }, []);

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

        const manifestMessage = createManifestMessage(manifest);
        dataChannel.send(JSON.stringify(manifestMessage));

        setState(prev => ({ ...prev, status: "transferring" }));

        return manifest;
    }, []);

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

    const handleMessage = useCallback(async (event: MessageEvent) => {
        try {
            const message: ChunkMessage = JSON.parse(event.data);

            switch (message.type) {
                case "manifest":
                    if (assemblerRef.current) {
                        assemblerRef.current.setManifest(message.manifest);
                        setState(prev => ({ ...prev, status: "transferring" }));
                        requestNextChunks();
                    }
                    break;

                case "chunk_request":
                    if (senderRef.current && dataChannelRef.current) {
                        const chunk = await senderRef.current.getChunk(message.index);
                        const response = serializeChunkResponse(chunk);
                        dataChannelRef.current.send(JSON.stringify(response));
                        senderRef.current.markSent(message.index);
                    }
                    break;

                case "chunk_response":
                    if (assemblerRef.current && dataChannelRef.current) {
                        const chunk = deserializeChunkResponse(message);
                        const success = await assemblerRef.current.addChunk(chunk);

                        const ack = createAck(message.index, success);
                        dataChannelRef.current.send(JSON.stringify(ack));
                        pendingRequestsRef.current.delete(message.index);
                        updateProgress(assemblerRef.current.getProgress());

                        if (assemblerRef.current.isComplete()) {
                            await handleTransferComplete();
                        } else {
                            requestNextChunks();
                        }
                    }
                    break;

                case "ack":
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

    const requestNextChunks = useCallback(() => {
        if (!assemblerRef.current || !dataChannelRef.current) return;

        const remaining = assemblerRef.current.getRemainingChunks();
        const pending = pendingRequestsRef.current;
        const available = remaining.filter(i => !pending.has(i));

        const toRequest = available.slice(0, maxConcurrentChunks - pending.size);

        for (const index of toRequest) {
            const request = createChunkRequest(index);
            dataChannelRef.current.send(JSON.stringify(request));
            pending.add(index);
        }
    }, [maxConcurrentChunks]);

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

    const retryFailed = useCallback(() => {
        if (!assemblerRef.current || !dataChannelRef.current) return;

        const failed = assemblerRef.current.getFailedChunks();
        for (const index of failed) {
            const request = createChunkRequest(index);
            dataChannelRef.current.send(JSON.stringify(request));
            pendingRequestsRef.current.add(index);
        }
    }, []);

    const getAssembler = useCallback(() => assemblerRef.current, []);
    const getSender = useCallback(() => senderRef.current, []);

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
