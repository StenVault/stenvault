/**
 * useP2PTransfer Hook
 * Main orchestrator for P2P file transfers
 * Composes sub-hooks for modular, maintainable code
 */
import { useState, useCallback, useRef, useEffect } from "react";
import type {
    P2PConnectionState,
    P2PTransferState,
    P2PSession,
} from "@/components/p2p/types";
import type { P2PKeyPair } from "@/lib/p2pCrypto";
import type { FileAssembler, FileSender, E2ESession } from "@/lib/p2p";
import type { ChunkSender, ChunkAssembler } from "@/lib/p2pChunkedTransfer";
import type { P2PSharedRefs, P2PStateSetters } from "./types";
import { INITIAL_TRANSFER_STATE } from "./constants";
import { useP2PDataHandler } from "./useP2PDataHandler";
import { useP2PWebRTC } from "./useP2PWebRTC";
import { useP2PSignaling } from "./useP2PSignaling";
import { useP2PSession } from "./useP2PSession";
import { useP2PFileSender } from "./useP2PFileSender";
import { trpc } from "@/lib/trpc";

/**
 * Main P2P Transfer hook
 * Manages WebRTC peer-to-peer file transfer with signaling and RSA key exchange
 */
export function useP2PTransfer() {
    // ==========================================================================
    // CONFIG (from backend, respects admin toggle)
    // ==========================================================================
    const { data: p2pConfig } = trpc.p2p.getConfig.useQuery(undefined, {
        staleTime: 60000, // Cache for 1 minute
    });
    const trysteroEnabled = p2pConfig?.trysteroFallbackEnabled ?? false;

    // ==========================================================================
    // STATE
    // ==========================================================================
    const [connectionState, setConnectionState] = useState<P2PConnectionState>("idle");
    const [transferState, setTransferState] = useState<P2PTransferState>(INITIAL_TRANSFER_STATE);
    const [session, setSession] = useState<P2PSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [peerFingerprint, setPeerFingerprint] = useState<string | null>(null);
    const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);

    // ==========================================================================
    // REFS (shared between sub-hooks)
    // ==========================================================================
    const refs: P2PSharedRefs = {
        // WebRTC
        peerConnection: useRef<RTCPeerConnection | null>(null),
        dataChannel: useRef<RTCDataChannel | null>(null),
        pollingInterval: useRef<NodeJS.Timeout | null>(null),
        lastSignalTimestamp: useRef<number>(0),

        // Key exchange
        myKeyPair: useRef<P2PKeyPair | null>(null),
        myFingerprint: useRef<string | null>(null),
        peerPublicKey: useRef<Uint8Array | null>(null),
        peerFingerprint: useRef<string | null>(null),

        // File receiving
        fileAssembler: useRef<FileAssembler | null>(null),
        receivedBlob: useRef<Blob | null>(null),

        // File sending
        fileSender: useRef<FileSender | null>(null),
        fileToSend: useRef<File | null>(null),

        // Chunked transfer
        chunkSender: useRef<ChunkSender | null>(null),
        chunkAssembler: useRef<ChunkAssembler | null>(null),
        pendingChunkRequests: useRef<Set<number>>(new Set()),

        // ICE candidate buffering (for candidates arriving before remote description)
        pendingIceCandidates: useRef<RTCIceCandidateInit[]>([]),

        // State refs (avoid stale closures)
        session: useRef<P2PSession | null>(null),
        transferProgress: useRef<number>(0),
        currentUserId: useRef<number | null>(null),

        // Transfer completion flag (sync, prevents race with DC/PC close)
        isTransferComplete: useRef<boolean>(false),

        // E2E encryption session
        e2eSession: useRef<E2ESession | null>(null),

        // Pending async decryption count
        pendingDecryptions: useRef<number>(0),
    };

    // Keep state refs in sync
    useEffect(() => {
        refs.session.current = session;
    }, [session]);

    useEffect(() => {
        refs.transferProgress.current = transferState.progress;
    }, [transferState.progress]);

    // ==========================================================================
    // STATE SETTERS (passed to sub-hooks)
    // ==========================================================================
    const setters: P2PStateSetters = {
        setConnectionState,
        setTransferState,
        setSession,
        setError,
        setPeerFingerprint,
        setLocalFingerprint,
    };

    // ==========================================================================
    // CLEANUP
    // ==========================================================================

    /**
     * Discard cryptographic key material only (keys, fingerprints, E2E session).
     * Called after transfer completes — WebRTC stays open for UI.
     */
    const cleanupKeys = useCallback(() => {
        refs.myKeyPair.current = null;
        refs.myFingerprint.current = null;
        refs.peerPublicKey.current = null;
        refs.peerFingerprint.current = null;
        refs.e2eSession.current = null;
    }, []);

    const cleanup = useCallback(() => {
        if (refs.pollingInterval.current) {
            clearInterval(refs.pollingInterval.current);
            refs.pollingInterval.current = null;
        }
        if (refs.dataChannel.current) {
            refs.dataChannel.current.close();
            refs.dataChannel.current = null;
        }
        if (refs.peerConnection.current) {
            refs.peerConnection.current.close();
            refs.peerConnection.current = null;
        }
        // Clear key exchange state
        refs.myKeyPair.current = null;
        refs.myFingerprint.current = null;
        refs.peerPublicKey.current = null;
        setPeerFingerprint(null);
        setLocalFingerprint(null);
        // Clear file receiving state
        if (refs.fileAssembler.current) {
            refs.fileAssembler.current.reset();
            refs.fileAssembler.current = null;
        }
        refs.receivedBlob.current = null;
        // Clear file sending state
        if (refs.fileSender.current) {
            refs.fileSender.current.cancel();
            refs.fileSender.current = null;
        }
        refs.fileToSend.current = null;
        // Clear chunked transfer state
        refs.chunkSender.current = null;
        if (refs.chunkAssembler.current) {
            refs.chunkAssembler.current.reset();
            refs.chunkAssembler.current = null;
        }
        refs.pendingChunkRequests.current.clear();

        // Reset transfer completion flag
        refs.isTransferComplete.current = false;

        // Clear E2E encryption session
        refs.e2eSession.current = null;
        refs.pendingDecryptions.current = 0;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    // ==========================================================================
    // SUB-HOOKS
    // ==========================================================================

    // Data handler (incoming messages)
    const { handleIncomingData } = useP2PDataHandler({
        refs,
        setters,
        onTransferComplete: cleanupKeys,
    });

    // WebRTC connection
    const { initializeWebRTC } = useP2PWebRTC({
        refs,
        setters,
        onDataChannelMessage: handleIncomingData,
    });

    // Signaling (offer/answer/ICE) - with optional Trystero fallback
    const { startSignalPolling } = useP2PSignaling({
        refs,
        setters,
        initializeWebRTC,
        trysteroEnabled,
    });

    // Session management
    const {
        createSession,
        joinSession,
        cancelTransfer,
        createSessionMutation,
        joinSessionMutation,
    } = useP2PSession({
        refs,
        setters,
        startSignalPolling,
        initializeWebRTC,
        cleanup,
    });

    // File sending
    const { startFileTransfer } = useP2PFileSender({
        refs,
        setters,
    });

    // ==========================================================================
    // RETURN PUBLIC API
    // ==========================================================================
    return {
        // State
        connectionState,
        transferState,
        session,
        error,
        peerFingerprint,
        localFingerprint,

        // Actions
        createSession,
        joinSession,
        cancelTransfer,
        startFileTransfer,

        // Derived
        isConnected: connectionState === "connected" || connectionState === "transferring",
        isLoading: createSessionMutation.isPending || joinSessionMutation.isPending,
    };
}
