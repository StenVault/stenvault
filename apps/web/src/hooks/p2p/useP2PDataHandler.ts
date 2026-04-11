/**
 * useP2PDataHandler Hook
 * Handles incoming data (file chunks and control messages) for P2P transfers
 * Supports E2E encryption for "double" and "shamir" methods
 * Supports resumable transfers via resume_request/resume_response messages
 * 
 * Fixed: Stale closures by using refs for handler functions
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
import { devWarn } from '@/lib/debugLogger';

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

    // Type for manifest message handler input
    type ManifestMessageInput = {
        protocol?: string;
        manifest?: ChunkedFileManifest;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        totalChunks?: number;
        e2e?: E2EManifestData;
    };

    // Refs to hold the latest handler functions (avoids stale closures)
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

    /**
     * Handle manifest message (initiates file receiving)
     * Supports E2E encryption when manifest contains e2e data
     * 
     * CRITICAL: This function is async to ensure E2E session is initialized
     * BEFORE any chunk requests are sent. This prevents a race condition
     * where chunks could arrive before decryption is ready.
     */
    const handleManifest = useCallback(async (message: ManifestMessageInput) => {
        const dc = refs.dataChannel.current;

        // Initialize E2E encryption session FIRST (before any chunk handling)
        // This is CRITICAL: we MUST await this before proceeding to prevent
        // race conditions where chunks arrive before decryption is ready
        if (message.e2e && refs.myKeyPair.current?.privateKey && refs.peerPublicKey.current) {
            try {
                const e2eSession = await initE2EReceiverSession(
                    message.e2e,
                    refs.myKeyPair.current.privateKey,
                    refs.peerPublicKey.current
                );
                refs.e2eSession.current = e2eSession;
            } catch (err) {
                // Failed to initialize E2E session
                setError("Failed to initialize encryption");
                setConnectionState("failed");
                return; // Early return - don't proceed with transfer
            }
        }

        // Now safe to proceed with manifest handling - E2E session is ready
        if (message.protocol === "chunked" && message.manifest) {
            // Chunked protocol (for large files)
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

            // Start requesting chunks in parallel (E2E session is now ready)
            if (dc && dc.readyState === "open") {
                const remaining = refs.chunkAssembler.current.getRemainingChunks();
                const toRequest = remaining.slice(0, MAX_CONCURRENT_CHUNKS);
                for (const index of toRequest) {
                    refs.pendingChunkRequests.current.add(index);
                    dc.send(JSON.stringify(createChunkRequest(index)));
                }
            }
        } else {
            // Simple protocol (for small files)
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

    /**
     * Handle chunk request (sender side - chunked protocol)
     */
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
                        // Error sending chunk - ignore
                    }
                })();
            }
        }
    }, [refs]);

    /**
     * Handle chunked transfer completion
     */
    const handleChunkedComplete = useCallback(async () => {
        try {
            const file = await refs.chunkAssembler.current!.assemble();
            refs.receivedBlob.current = file;

            // Trigger download
            triggerDownload(file, file.name);

            // Set completion flag SYNCHRONOUSLY before React state updates
            refs.isTransferComplete.current = true;

            // Discard key material — transfer is done
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

    /**
     * Handle chunk response (receiver side - chunked protocol)
     */
    const handleChunkResponse = useCallback((message: {
        index: number;
        data: string;
        hash: string;
    }) => {
        if (refs.chunkAssembler.current) {
            const dc = refs.dataChannel.current;
            (async () => {
                try {
                    // Add type field for deserializeChunkResponse compatibility
                    const chunkData = deserializeChunkResponse({
                        type: "chunk_response" as const,
                        ...message
                    });
                    const success = await refs.chunkAssembler.current!.addChunk(chunkData);
                    refs.pendingChunkRequests.current.delete(message.index);

                    // Send ack
                    if (dc && dc.readyState === "open") {
                        dc.send(JSON.stringify({ type: "ack", index: message.index, success }));
                    }

                    // Update progress
                    const progress = refs.chunkAssembler.current!.getProgress();
                    setTransferState(prev => ({
                        ...prev,
                        status: "transferring",
                        progress: progress.progress,
                        bytesTransferred: progress.bytesTransferred,
                        totalBytes: progress.totalBytes,
                    }));

                    // Request more chunks if available
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

                    // Check if complete - use ref to get latest handler
                    if (refs.chunkAssembler.current!.isComplete()) {
                        await handlersRef.current.handleChunkedComplete();
                    }
                } catch {
                    // Error processing chunk response - ignore
                }
            })();
        }
    }, [refs, setTransferState]);

    /**
     * Handle ack message (sender side - chunked protocol)
     */
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
                // Discard key material — transfer is done
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

    /**
     * Handle progress message
     */
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

    /**
     * Handle complete message (simple protocol)
     * Fixed: Now waits for async decryptions before checking completion
     */
    const handleComplete = useCallback(() => {
        // For E2E transfers, we need to wait for all async decryptions
        const waitForDecryptionsAndComplete = async () => {
            // Wait for pending decryptions with timeout
            const maxWaitMs = 10000; // 10 seconds max
            const checkIntervalMs = 50;
            let waited = 0;

            while (refs.pendingDecryptions.current > 0 && waited < maxWaitMs) {
                await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
                waited += checkIntervalMs;
            }

            if (!refs.fileAssembler.current?.isComplete()) {
                // Transfer incomplete - set error state
                setError("Transfer incomplete");
                setConnectionState("failed");
                return;
            }

            try {
                const blob = refs.fileAssembler.current.assemble();
                refs.receivedBlob.current = blob;
                const manifest = refs.fileAssembler.current.getManifest();

                // Trigger download
                triggerDownload(blob, manifest.fileName);

                // Set completion flag SYNCHRONOUSLY before React state updates
                refs.isTransferComplete.current = true;

                // Discard key material — transfer is done
                onTransferComplete?.();

                // Only set completed on success
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

        // Execute async
        waitForDecryptionsAndComplete();
    }, [refs, setConnectionState, setTransferState, setError, onTransferComplete]);

    /**
     * Handle binary data (ArrayBuffer) - simple protocol only
     * Supports E2E decryption when e2eSession is active
     */
    const handleBinaryChunk = useCallback((data: ArrayBuffer) => {
        if (refs.fileAssembler.current) {
            // Chunks are received with index as first 4 bytes (big-endian)
            const view = new DataView(data);
            const chunkIndex = view.getUint32(0, false); // big-endian
            const encryptedOrPlainData = data.slice(4);

            // Check if E2E decryption is needed
            const e2eSession = refs.e2eSession.current;
            if (e2eSession) {
                // Track pending decryption
                refs.pendingDecryptions.current++;

                // Decrypt the chunk asynchronously
                (async () => {
                    try {
                        const decryptedData = await decryptChunk(e2eSession, encryptedOrPlainData, chunkIndex);

                        refs.fileAssembler.current?.addChunk({
                            index: chunkIndex,
                            data: decryptedData,
                        });

                        // Update progress
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
                        // Always decrement, even on error
                        refs.pendingDecryptions.current--;
                    }
                })();
            } else {
                // No E2E - add chunk directly
                refs.fileAssembler.current.addChunk({
                    index: chunkIndex,
                    data: encryptedOrPlainData,
                });

                // Update progress
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

    /**
     * Handle resume request from receiver (sender side)
     * Receiver sends list of chunks they already have, sender calculates what to resend
     */
    const handleResumeRequest = useCallback((message: ResumeRequestMessage) => {
        const dc = refs.dataChannel.current;

        // Determine which type of sender we have
        if (message.protocol === "simple" && refs.fileSender.current) {
            // Simple protocol: sender needs to send remaining chunks
            const fileToSend = refs.fileToSend.current;
            if (!fileToSend) {
                // File not available (user may have navigated away)
                const rejectMessage: ResumeRejectMessage = {
                    type: "resume_reject",
                    sessionId: message.sessionId,
                    reason: "file_unavailable",
                };
                dc?.send(JSON.stringify(rejectMessage));
                return;
            }

            // Calculate missing chunks
            const manifest = refs.fileSender.current.getManifest?.();
            const totalChunks = manifest?.totalChunks ?? 0;
            const receivedSet = new Set(message.receivedChunks);
            const missingChunks: number[] = [];

            for (let i = 0; i < totalChunks; i++) {
                if (!receivedSet.has(i)) {
                    missingChunks.push(i);
                }
            }

            // Send resume response
            const response: ResumeResponseMessage = {
                type: "resume_response",
                sessionId: message.sessionId,
                missingChunks,
                accepted: true,
            };
            dc?.send(JSON.stringify(response));

            // Sender will start sending missing chunks (handled by useP2PFileSender)
            setConnectionState("transferring");

        } else if (message.protocol === "chunked" && refs.chunkSender.current) {
            // Chunked protocol: sender responds to chunk_request, nothing special needed
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

            // Calculate missing chunks
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
            // Cannot handle resume
            const rejectMessage: ResumeRejectMessage = {
                type: "resume_reject",
                sessionId: message.sessionId,
                reason: "file_unavailable",
            };
            dc?.send(JSON.stringify(rejectMessage));
        }
    }, [refs, setConnectionState]);

    /**
     * Handle resume response from sender (receiver side)
     * Sender tells us which chunks to request
     */
    const handleResumeResponse = useCallback((message: ResumeResponseMessage) => {
        const dc = refs.dataChannel.current;

        if (!message.accepted) {
            setError("Transfer cannot be resumed");
            setConnectionState("failed");
            return;
        }

        // Update state to transferring
        setConnectionState("transferring");
        setTransferState(prev => ({
            ...prev,
            status: "transferring",
        }));

        // For chunked protocol, start requesting missing chunks
        if (refs.chunkAssembler.current && dc?.readyState === "open") {
            // Request missing chunks in parallel
            const toRequest = message.missingChunks.slice(0, MAX_CONCURRENT_CHUNKS);
            for (const index of toRequest) {
                refs.pendingChunkRequests.current.add(index);
                dc.send(JSON.stringify(createChunkRequest(index)));
            }
        }

        // For simple protocol, sender will push chunks automatically
        // No action needed from receiver

    }, [refs, setConnectionState, setTransferState, setError]);

    /**
     * Handle resume rejection from sender
     */
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

        // Optionally delete the saved state since it cannot be resumed
        if (refs.fileAssembler.current) {
            refs.fileAssembler.current.deleteSavedState().catch((err) => {
                if (import.meta.env.DEV) devWarn("[P2P] Failed to delete file assembler state:", err);
            });
        }
        if (refs.chunkAssembler.current) {
            refs.chunkAssembler.current.deleteSavedState().catch((err) => {
                if (import.meta.env.DEV) devWarn("[P2P] Failed to delete chunk assembler state:", err);
            });
        }
    }, [refs, setError, setConnectionState]);

    // Keep handlers ref updated with latest functions
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

    /**
     * Handle JSON control messages
     * Uses refs to always access latest handler versions
     */
    const handleControlMessage = useCallback((data: string) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case "manifest":
                    // handleManifest is async - await to ensure E2E session is ready
                    // before any subsequent messages are processed
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
            // Failed to parse control message - ignore
        }
    }, []); // Empty deps is now safe - uses refs

    /**
     * Handle incoming data (file chunks or control messages)
     * Uses refs to always access latest handler versions
     */
    const handleIncomingData = useCallback((data: ArrayBuffer | string) => {
        if (typeof data === "string") {
            handleControlMessage(data);
        } else {
            handlersRef.current.handleBinaryChunk(data);
        }
    }, [handleControlMessage]); // handleControlMessage is stable

    return {
        handleIncomingData,
    };
}

/**
 * Trigger browser download for a blob
 * Revokes URL after 5 minutes to ensure download completes for slow connections
 */
function triggerDownload(blob: Blob | File, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after 60 seconds - browser maintains internal reference during download
    // Reduced from 5 minutes to prevent memory accumulation with multiple downloads
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}
