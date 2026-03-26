/**
 * useP2PFileSender Hook
 * Handles file sending logic for P2P transfers
 * Supports both simple (push-based) and chunked (pull-based) protocols
 * Supports E2E encryption for "double" and "shamir" methods
 */
import { useCallback } from "react";
import {
    FileSender,
    E2EFileSender,
    initE2ESenderSession,
    requiresE2E,
    type SendProgress,
} from "@/lib/p2p";
import { ChunkSender } from "@/lib/p2pChunkedTransfer";
import type { P2PSharedRefs, P2PStateSetters } from "./types";
import { CHUNKED_THRESHOLD } from "./constants";

interface UseP2PFileSenderParams {
    refs: P2PSharedRefs;
    setters: P2PStateSetters;
}

export function useP2PFileSender({
    refs,
    setters,
}: UseP2PFileSenderParams) {
    const { setConnectionState, setTransferState, setError } = setters;

    /**
     * Start file transfer (sender side)
     * Uses ChunkSender (pull-based with SHA-256) for files >= 100MB
     * Uses FileSender/E2EFileSender (push-based) for smaller files
     */
    const startFileTransfer = useCallback(async (file: File) => {
        const dc = refs.dataChannel.current;

        if (!dc) {
            throw new Error("DataChannel not available");
        }

        if (dc.readyState !== "open") {
            throw new Error(`DataChannel not ready (state: ${dc.readyState})`);
        }

        refs.fileToSend.current = file;

        if (file.size >= CHUNKED_THRESHOLD) {
            await startChunkedTransfer(dc, file);
        } else {
            await startSimpleTransfer(dc, file);
        }
    }, [refs]);

    const startChunkedTransfer = useCallback(async (dc: RTCDataChannel, file: File) => {
        const sender = new ChunkSender(file);
        refs.chunkSender.current = sender;

        const manifest = await sender.initialize();

        setConnectionState("transferring");
        setTransferState(prev => ({
            ...prev,
            status: "transferring",
            totalBytes: file.size,
            mode: "chunked" as const,
        }));

        dc.send(JSON.stringify({
            type: "manifest",
            protocol: "chunked",
            manifest,
        }));

        // Sender now waits for chunk_request messages from receiver
        // The handleIncomingData function will respond to them
    }, [refs, setConnectionState, setTransferState]);

    // Automatically uses E2E encryption if encryptionMethod is "double" or "shamir"
    const startSimpleTransfer = useCallback(async (dc: RTCDataChannel, file: File) => {
        const session = refs.session.current;
        const encryptionMethod = session?.encryptionMethod || "webrtc";
        const useE2E = requiresE2E(encryptionMethod) && refs.peerPublicKey.current !== null;

        if (useE2E) {
            await startE2ETransfer(dc, file);
        } else {
            await startPlainTransfer(dc, file);
        }
    }, [refs, setConnectionState, setTransferState, setError]);

    const startPlainTransfer = useCallback(async (dc: RTCDataChannel, file: File) => {
        const sender = new FileSender(file, dc, {
            onProgress: (progress: SendProgress) => {
                setTransferState(prev => ({
                    ...prev,
                    status: "transferring",
                    progress: progress.percent,
                    bytesTransferred: progress.bytesSent,
                    totalBytes: progress.totalBytes,
                    speed: progress.speed,
                    estimatedTimeRemaining: progress.estimatedTimeRemaining,
                }));
            },
            onComplete: () => {
                // Set completion flag SYNCHRONOUSLY before React state updates
                refs.isTransferComplete.current = true;

                setTransferState(prev => ({
                    ...prev,
                    status: "completed",
                    progress: 100,
                }));
                setConnectionState("completed");
            },
            onError: (error: Error) => {
                setError(error.message);
                setConnectionState("failed");
            },
        });

        refs.fileSender.current = sender;
        setConnectionState("transferring");
        setTransferState(prev => ({
            ...prev,
            status: "transferring",
            totalBytes: file.size,
            mode: "stream",
        }));

        await sender.start();
    }, [refs, setConnectionState, setTransferState, setError]);

    const startE2ETransfer = useCallback(async (dc: RTCDataChannel, file: File) => {
        const peerPublicKey = refs.peerPublicKey.current;

        if (!peerPublicKey) {
            throw new Error("Peer public key not available for E2E encryption");
        }

        const myKeyPair = refs.myKeyPair.current;
        if (!myKeyPair) {
            throw new Error("Local key pair not available for E2E encryption");
        }
        const e2eSession = await initE2ESenderSession(myKeyPair.privateKey, peerPublicKey);
        refs.e2eSession.current = e2eSession;

        const sender = new E2EFileSender(file, dc, {
            e2eSession,
            onProgress: (progress: SendProgress) => {
                setTransferState(prev => ({
                    ...prev,
                    status: "transferring",
                    progress: progress.percent,
                    bytesTransferred: progress.bytesSent,
                    totalBytes: progress.totalBytes,
                    speed: progress.speed,
                    estimatedTimeRemaining: progress.estimatedTimeRemaining,
                }));
            },
            onComplete: () => {
                refs.isTransferComplete.current = true;

                setTransferState(prev => ({
                    ...prev,
                    status: "completed",
                    progress: 100,
                }));
                setConnectionState("completed");
            },
            onError: (error: Error) => {
                setError(error.message);
                setConnectionState("failed");
            },
        });

        // Note: We don't store E2EFileSender in refs.fileSender because it has different type
        // The sender is self-contained and manages its own lifecycle

        setConnectionState("transferring");
        setTransferState(prev => ({
            ...prev,
            status: "transferring",
            totalBytes: file.size,
            mode: "stream",
        }));

        await sender.start();
    }, [refs, setConnectionState, setTransferState, setError]);

    return {
        startFileTransfer,
    };
}
