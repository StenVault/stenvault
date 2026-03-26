/**
 * useP2PDataHandler — Incoming data handler for P2P transfers.
 * Routes binary chunks and JSON control messages to protocol-specific handlers.
 * Uses refs to avoid stale closures in WebRTC callbacks.
 */
import { useCallback, useRef, useEffect } from "react";
import {
    FileAssembler,
    type FileManifest,
    initE2EReceiverSession,
    decryptChunk,
    type E2EManifestData,
} from "@/lib/p2p";
import {
    ChunkAssembler,
    serializeChunkResponse,
    deserializeChunkResponse,
    createChunkRequest,
    type FileManifest as ChunkedFileManifest,
    MAX_CONCURRENT_CHUNKS,
} from "@/lib/p2pChunkedTransfer";
import type {
    ResumeRequestMessage,
    ResumeResponseMessage,
    ResumeRejectMessage,
} from "@/components/p2p/types";
import type { P2PSharedRefs, P2PStateSetters } from "./types";

interface UseP2PDataHandlerParams {
    refs: P2PSharedRefs;
    setters: P2PStateSetters;
    /** Discard key material after transfer completes */
    onTransferComplete?: () => void;
}

/**
 * Hook for handling incoming P2P data
 */
export function useP2PDataHandler({
    refs,
    setters,
    onTransferComplete,
}: UseP2PDataHandlerParams) {
    const { setConnectionState, setTransferState, setError } = setters;

    type ManifestMessageInput = {
        protocol?: string;
        manifest?: ChunkedFileManifest;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        totalChunks?: number;
        e2e?: E2EManifestData;
    };

    const handlersRef = useRef<{
        handleManifest: (message: ManifestMessageInput) => Promise<void>; // Async to await E2E init
        handleChunkRequest: (message: { index: number }) => void;
        handleChunkResponse: (message: { index: number; data: string; hash: string }) => void;
        handleAck: (message: { index: number }) => void;
        handleProgress: (message: { progress: number; bytesTransferred: number }) => void;
        handleComplete: () => void;
        handleBinaryChunk: (data: ArrayBuffer) => void;
        handleChunkedComplete: () => Promise<void>;
        handleResumeRequest: (message: ResumeRequestMessage) => void;
        handleResumeResponse: (message: ResumeResponseMessage) => void;
        handleResumeReject: (message: ResumeRejectMessage) => void;
    }>(null!);

    // Must be async: E2E session MUST be ready before any chunks arrive, otherwise
    // incoming binary data hits an uninitialized decryptor and silently corrupts.
    const handleManifest = useCallback(async (message: ManifestMessageInput) => {
        const dc = refs.dataChannel.current;

        if (message.e2e && refs.myKeyPair.current?.privateKey && refs.peerPublicKey.current) {
            try {
                const e2eSession = await initE2EReceiverSession(
                    message.e2e,
                    refs.myKeyPair.current.privateKey,
                    refs.peerPublicKey.current
                );
                refs.e2eSession.current = e2eSession;
            } catch (err) {
                setError("Failed to initialize encryption");
                setConnectionState("failed");
                return; // Early return - don't proceed with transfer
            }
        }

        if (message.protocol === "chunked" && message.manifest) {
            const chunkedManifest = message.manifest;
            refs.chunkAssembler.current = new ChunkAssembler();
            refs.chunkAssembler.current.setManifest(chunkedManifest);
            refs.pendingChunkRequests.current.clear();

            setTransferState(prev => ({
                ...prev,
                status: "transferring",
                totalBytes: chunkedManifest.fileSize,
                mode: "chunked" as const,
            }));
            setConnectionState("transferring");

            if (dc && dc.readyState === "open") {
                const remaining = refs.chunkAssembler.current.getRemainingChunks();
                const toRequest = remaining.slice(0, MAX_CONCURRENT_CHUNKS);
                for (const index of toRequest) {
                    refs.pendingChunkRequests.current.add(index);
                    dc.send(JSON.stringify(createChunkRequest(index)));
                }
            }
        } else {
            const manifest: FileManifest = {
                fileName: message.fileName || "unknown",
                fileSize: message.fileSize || 0,
                mimeType: message.mimeType || "application/octet-stream",
                totalChunks: message.totalChunks || 0,
            };
            refs.fileAssembler.current = new FileAssembler(manifest);

            setTransferState(prev => ({
                ...prev,
                status: "transferring",
                totalBytes: message.fileSize || 0,
                mode: "stream",
            }));
            setConnectionState("transferring");
        }
    }, [refs, setConnectionState, setTransferState, setError]);

    const handleChunkRequest = useCallback((message: { index: number }) => {
        if (refs.chunkSender.current) {
            const dc = refs.dataChannel.current;
            if (dc && dc.readyState === "open") {
                (async () => {
                    try {
                        const chunk = await refs.chunkSender.current!.getChunk(message.index);
                        const response = serializeChunkResponse(chunk);
                        dc.send(JSON.stringify(response));
                        refs.chunkSender.current!.markSent(message.index);
                    } catch {
                        // non-critical: individual chunk failures handled by retry
                    }
                })();
            }
        }
    }, [refs]);

    const handleChunkedComplete = useCallback(async () => {
        try {
            const file = await refs.chunkAssembler.current!.assemble();
            refs.receivedBlob.current = file;

            triggerDownload(file, file.name);

            // Must be set synchronously — React state updates are batched and deferred,
            // but callers check this ref in the same tick to guard against double-completion.
            refs.isTransferComplete.current = true;

            onTransferComplete?.();

            setTransferState(prev => ({
                ...prev,
                status: "completed",
                progress: 100,
            }));
            setConnectionState("completed");
        } catch {
            setError("File verification failed - may be corrupted");
            setConnectionState("failed");
        }
    }, [refs, setConnectionState, setTransferState, setError, onTransferComplete]);

    const handleChunkResponse = useCallback((message: {
        index: number;
        data: string;
        hash: string;
    }) => {
        if (refs.chunkAssembler.current) {
            const dc = refs.dataChannel.current;
            (async () => {
                try {
                    const chunkData = deserializeChunkResponse({
                        type: "chunk_response" as const,
                        ...message
                    });
                    const success = await refs.chunkAssembler.current!.addChunk(chunkData);
                    refs.pendingChunkRequests.current.delete(message.index);

                    if (dc && dc.readyState === "open") {
                        dc.send(JSON.stringify({ type: "ack", index: message.index, success }));
                    }

                    const progress = refs.chunkAssembler.current!.getProgress();
                    setTransferState(prev => ({
                        ...prev,
                        status: "transferring",
                        progress: progress.progress,
                        bytesTransferred: progress.bytesTransferred,
                        totalBytes: progress.totalBytes,
                    }));

                    if (dc && dc.readyState === "open") {
                        const remaining = refs.chunkAssembler.current!.getRemainingChunks();
                        const pending = refs.pendingChunkRequests.current;
                        const toRequest = remaining
                            .filter(i => !pending.has(i))
                            .slice(0, MAX_CONCURRENT_CHUNKS - pending.size);

                        for (const index of toRequest) {
                            pending.add(index);
                            dc.send(JSON.stringify(createChunkRequest(index)));
                        }
                    }

                    if (refs.chunkAssembler.current!.isComplete()) {
                        await handlersRef.current.handleChunkedComplete();
                    }
                } catch {
                    // non-critical: individual chunk failures handled by retry
                }
            })();
        }
    }, [refs, setTransferState]);

    const handleAck = useCallback((message: { index: number }) => {
        if (refs.chunkSender.current) {
            refs.chunkSender.current.markAcked(message.index);
            const progress = refs.chunkSender.current.getProgress();
            setTransferState(prev => ({
                ...prev,
                progress: progress.progress,
                bytesTransferred: progress.bytesTransferred,
            }));

            if (refs.chunkSender.current.isComplete()) {
                onTransferComplete?.();

                setTransferState(prev => ({
                    ...prev,
                    status: "completed",
                    progress: 100,
                }));
                setConnectionState("completed");
            }
        }
    }, [refs, setConnectionState, setTransferState, onTransferComplete]);

    const handleProgress = useCallback((message: {
        progress: number;
        bytesTransferred: number;
    }) => {
        setTransferState(prev => ({
            ...prev,
            status: "transferring",
            progress: message.progress,
            bytesTransferred: message.bytesTransferred,
        }));
    }, [setTransferState]);

    // E2E decryptions are async — must drain the queue before assembling the file
    const handleComplete = useCallback(() => {
        const waitForDecryptionsAndComplete = async () => {
            const maxWaitMs = 10000;
            const checkIntervalMs = 50;
            let waited = 0;

            while (refs.pendingDecryptions.current > 0 && waited < maxWaitMs) {
                await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
                waited += checkIntervalMs;
            }

            if (!refs.fileAssembler.current?.isComplete()) {
                setError("Transfer incomplete");
                setConnectionState("failed");
                return;
            }

            try {
                const blob = refs.fileAssembler.current.assemble();
                refs.receivedBlob.current = blob;
                const manifest = refs.fileAssembler.current.getManifest();

                triggerDownload(blob, manifest.fileName);

                refs.isTransferComplete.current = true;
                onTransferComplete?.();

                setTransferState(prev => ({
                    ...prev,
                    status: "completed",
                    progress: 100,
                }));
                setConnectionState("completed");
            } catch {
                setError("File assembly failed");
                setConnectionState("failed");
            }
        };

        waitForDecryptionsAndComplete();
    }, [refs, setConnectionState, setTransferState, setError, onTransferComplete]);

    const handleBinaryChunk = useCallback((data: ArrayBuffer) => {
        if (refs.fileAssembler.current) {
            const view = new DataView(data);
            const chunkIndex = view.getUint32(0, false); // big-endian
            const encryptedOrPlainData = data.slice(4);

            const e2eSession = refs.e2eSession.current;
            if (e2eSession) {
                refs.pendingDecryptions.current++;

                (async () => {
                    try {
                        const decryptedData = await decryptChunk(e2eSession, encryptedOrPlainData, chunkIndex);

                        refs.fileAssembler.current?.addChunk({
                            index: chunkIndex,
                            data: decryptedData,
                        });

                        if (refs.fileAssembler.current) {
                            const progress = refs.fileAssembler.current.getProgress();
                            setTransferState(prev => ({
                                ...prev,
                                status: "transferring",
                                progress: progress.percent,
                                bytesTransferred: progress.bytesReceived,
                                totalBytes: progress.totalBytes,
                            }));
                        }
                    } catch {
                        setError("Decryption failed - file may be corrupted");
                        setConnectionState("failed");
                    } finally {
                        refs.pendingDecryptions.current--;
                    }
                })();
            } else {
                refs.fileAssembler.current.addChunk({
                    index: chunkIndex,
                    data: encryptedOrPlainData,
                });

                const progress = refs.fileAssembler.current.getProgress();
                setTransferState(prev => ({
                    ...prev,
                    status: "transferring",
                    progress: progress.percent,
                    bytesTransferred: progress.bytesReceived,
                    totalBytes: progress.totalBytes,
                }));
            }
        }
    }, [refs, setTransferState, setError, setConnectionState]);

    // ============ Resume Protocol Handlers ============

    const handleResumeRequest = useCallback((message: ResumeRequestMessage) => {
        const dc = refs.dataChannel.current;

        if (message.protocol === "simple" && refs.fileSender.current) {
            const fileToSend = refs.fileToSend.current;
            if (!fileToSend) {
                const rejectMessage: ResumeRejectMessage = {
                    type: "resume_reject",
                    sessionId: message.sessionId,
                    reason: "file_unavailable",
                };
                dc?.send(JSON.stringify(rejectMessage));
                return;
            }

            const manifest = refs.fileSender.current.getManifest?.();
            const totalChunks = manifest?.totalChunks ?? 0;
            const receivedSet = new Set(message.receivedChunks);
            const missingChunks: number[] = [];

            for (let i = 0; i < totalChunks; i++) {
                if (!receivedSet.has(i)) {
                    missingChunks.push(i);
                }
            }

            const response: ResumeResponseMessage = {
                type: "resume_response",
                sessionId: message.sessionId,
                missingChunks,
                accepted: true,
            };
            dc?.send(JSON.stringify(response));

            setConnectionState("transferring");

        } else if (message.protocol === "chunked" && refs.chunkSender.current) {
            const manifest = refs.chunkSender.current.getManifest();
            if (!manifest) {
                const rejectMessage: ResumeRejectMessage = {
                    type: "resume_reject",
                    sessionId: message.sessionId,
                    reason: "file_unavailable",
                };
                dc?.send(JSON.stringify(rejectMessage));
                return;
            }

            const receivedSet = new Set(message.receivedChunks);
            const missingChunks: number[] = [];
            for (let i = 0; i < manifest.totalChunks; i++) {
                if (!receivedSet.has(i)) {
                    missingChunks.push(i);
                }
            }

            const response: ResumeResponseMessage = {
                type: "resume_response",
                sessionId: message.sessionId,
                missingChunks,
                accepted: true,
            };
            dc?.send(JSON.stringify(response));
            setConnectionState("transferring");

        } else {
            const rejectMessage: ResumeRejectMessage = {
                type: "resume_reject",
                sessionId: message.sessionId,
                reason: "file_unavailable",
            };
            dc?.send(JSON.stringify(rejectMessage));
        }
    }, [refs, setConnectionState]);

    const handleResumeResponse = useCallback((message: ResumeResponseMessage) => {
        const dc = refs.dataChannel.current;

        if (!message.accepted) {
            setError("Transfer cannot be resumed");
            setConnectionState("failed");
            return;
        }

        setConnectionState("transferring");
        setTransferState(prev => ({
            ...prev,
            status: "transferring",
        }));

        if (refs.chunkAssembler.current && dc?.readyState === "open") {
            const toRequest = message.missingChunks.slice(0, MAX_CONCURRENT_CHUNKS);
            for (const index of toRequest) {
                refs.pendingChunkRequests.current.add(index);
                dc.send(JSON.stringify(createChunkRequest(index)));
            }
        }

    }, [refs, setConnectionState, setTransferState, setError]);

    const handleResumeReject = useCallback((message: ResumeRejectMessage) => {
        let errorMessage: string;
        switch (message.reason) {
            case "file_unavailable":
                errorMessage = "Original file is no longer available. The sender may have closed their browser.";
                break;
            case "session_expired":
                errorMessage = "Transfer session has expired. Please request a new transfer.";
                break;
            case "protocol_mismatch":
                errorMessage = "Protocol mismatch. Transfer cannot be resumed.";
                break;
            default:
                errorMessage = "Transfer cannot be resumed due to an unknown error.";
        }

        setError(errorMessage);
        setConnectionState("failed");

        if (refs.fileAssembler.current) {
            refs.fileAssembler.current.deleteSavedState().catch((err) => {
                if (import.meta.env.DEV) console.warn("[P2P] Failed to delete file assembler state:", err);
            });
        }
        if (refs.chunkAssembler.current) {
            refs.chunkAssembler.current.deleteSavedState().catch((err) => {
                if (import.meta.env.DEV) console.warn("[P2P] Failed to delete chunk assembler state:", err);
            });
        }
    }, [refs, setError, setConnectionState]);

    useEffect(() => {
        handlersRef.current = {
            handleManifest,
            handleChunkRequest,
            handleChunkResponse,
            handleAck,
            handleProgress,
            handleComplete,
            handleBinaryChunk,
            handleChunkedComplete,
            handleResumeRequest,
            handleResumeResponse,
            handleResumeReject,
        };
    }, [
        handleManifest,
        handleChunkRequest,
        handleChunkResponse,
        handleAck,
        handleProgress,
        handleComplete,
        handleBinaryChunk,
        handleChunkedComplete,
        handleResumeRequest,
        handleResumeResponse,
        handleResumeReject,
    ]);

    const handleControlMessage = useCallback((data: string) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case "manifest":
                    handlersRef.current.handleManifest(message).catch((err) => {
                        console.error("[P2P] Manifest handling failed:", err);
                        setError("Failed to process file manifest");
                        setConnectionState("failed");
                    });
                    break;
                case "chunk_request":
                    handlersRef.current.handleChunkRequest(message);
                    break;
                case "chunk_response":
                    handlersRef.current.handleChunkResponse(message);
                    break;
                case "ack":
                    handlersRef.current.handleAck(message);
                    break;
                case "progress":
                    handlersRef.current.handleProgress(message);
                    break;
                case "complete":
                    handlersRef.current.handleComplete();
                    break;
                case "resume_request":
                    handlersRef.current.handleResumeRequest(message as ResumeRequestMessage);
                    break;
                case "resume_response":
                    handlersRef.current.handleResumeResponse(message as ResumeResponseMessage);
                    break;
                case "resume_reject":
                    handlersRef.current.handleResumeReject(message as ResumeRejectMessage);
                    break;
            }
        } catch {
            // malformed JSON — drop silently, sender retries on ack timeout
        }
    }, []);

    const handleIncomingData = useCallback((data: ArrayBuffer | string) => {
        if (typeof data === "string") {
            handleControlMessage(data);
        } else {
            handlersRef.current.handleBinaryChunk(data);
        }
    }, [handleControlMessage]);

    return {
        handleIncomingData,
    };
}

function triggerDownload(blob: Blob | File, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 60s delay — browser holds an internal ref during active download
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}
