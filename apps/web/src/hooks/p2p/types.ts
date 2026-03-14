/**
 * P2P Transfer Types and Shared Interfaces
 * Centralized type definitions for P2P hooks
 */
import type { MutableRefObject } from "react";
import type {
    P2PConnectionState,
    P2PTransferState,
    P2PSession,
    P2PSignal,
} from "@/components/p2p/types";
import type { P2PKeyPair } from "@/lib/p2pCrypto";
import type { FileAssembler } from "@/lib/p2p";
import type { FileSender } from "@/lib/p2p";
import type { ChunkSender, ChunkAssembler } from "@/lib/p2pChunkedTransfer";
import type { E2ESession } from "@/lib/p2p";

/**
 * Shared refs interface - passed between sub-hooks
 */
export interface P2PSharedRefs {
    // WebRTC
    peerConnection: MutableRefObject<RTCPeerConnection | null>;
    dataChannel: MutableRefObject<RTCDataChannel | null>;
    pollingInterval: MutableRefObject<NodeJS.Timeout | null>;
    lastSignalTimestamp: MutableRefObject<number>;

    // Key exchange
    myKeyPair: MutableRefObject<P2PKeyPair | null>;
    myFingerprint: MutableRefObject<string | null>;
    peerPublicKey: MutableRefObject<Uint8Array | null>;
    peerFingerprint: MutableRefObject<string | null>;

    // File receiving (receiver side)
    fileAssembler: MutableRefObject<FileAssembler | null>;
    receivedBlob: MutableRefObject<Blob | null>;

    // File sending (sender side)
    fileSender: MutableRefObject<FileSender | null>;
    fileToSend: MutableRefObject<File | null>;

    // Chunked transfer (for large files)
    chunkSender: MutableRefObject<ChunkSender | null>;
    chunkAssembler: MutableRefObject<ChunkAssembler | null>;
    pendingChunkRequests: MutableRefObject<Set<number>>;

    // ICE candidate buffering (for candidates arriving before remote description)
    pendingIceCandidates: MutableRefObject<RTCIceCandidateInit[]>;

    // State refs (to avoid stale closures)
    session: MutableRefObject<P2PSession | null>;
    transferProgress: MutableRefObject<number>;
    currentUserId: MutableRefObject<number | null>; // For filtering self-sent signals

    // Transfer completion flag (prevents race condition with DC/PC close events)
    isTransferComplete: MutableRefObject<boolean>;

    // E2E encryption session (for "double" and "shamir" methods)
    e2eSession: MutableRefObject<E2ESession | null>;

    // Pending async decryption count (for E2E transfers)
    pendingDecryptions: MutableRefObject<number>;
}

/**
 * Shared state setters interface
 */
export interface P2PStateSetters {
    setConnectionState: (state: P2PConnectionState) => void;
    setTransferState: React.Dispatch<React.SetStateAction<P2PTransferState>>;
    setSession: (session: P2PSession | null) => void;
    setError: (error: string | null) => void;
    setPeerFingerprint: (fingerprint: string | null) => void;
    setLocalFingerprint: (fingerprint: string | null) => void;
}

/**
 * WebRTC initialization params
 */
export interface WebRTCInitParams {
    iceServers: Array<{ urls: string }>;
    isInitiator: boolean;
}

/**
 * Default ICE servers
 */
export const DEFAULT_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
];

// Re-export component types for convenience
export type { P2PConnectionState, P2PTransferState, P2PSession, P2PSignal };


/**
 * Chunked file manifest - sent at start of chunked transfer
 */
export interface ChunkedFileManifest {
    fileName: string;
    fileSize: number;
    mimeType: string;
    chunkSize: number;
    totalChunks: number;
    chunkHashes: string[];
    fileHash: string;
}

/**
 * P2P protocol message types
 */
export interface P2PManifestMessage {
    type: 'manifest';
    protocol?: 'chunked' | 'simple';
    manifest?: ChunkedFileManifest;
    // Simple protocol fields
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    // E2E encryption metadata
    e2eIv?: string;
}

export interface P2PChunkRequestMessage {
    type: 'chunk_request';
    chunkIndex: number;
}

export interface P2PChunkResponseMessage {
    type: 'chunk_response';
    chunkIndex: number;
    data: string; // base64
}

export interface P2PResumeRequestMessage {
    type: 'resume_request';
    receivedChunks: number[];
}

export interface P2PResumeResponseMessage {
    type: 'resume_response';
    resumeFrom: number;
}

export interface P2PTransferCompleteMessage {
    type: 'transfer_complete';
}

export interface P2PErrorMessage {
    type: 'error';
    message: string;
    code?: string;
}

/**
 * Union of all P2P message types for type-safe message handling
 */
export type P2PProtocolMessage =
    | P2PManifestMessage
    | P2PChunkRequestMessage
    | P2PChunkResponseMessage
    | P2PResumeRequestMessage
    | P2PResumeResponseMessage
    | P2PTransferCompleteMessage
    | P2PErrorMessage;

/**
 * Type guard for P2P messages
 */
export function isP2PMessage(msg: unknown): msg is P2PProtocolMessage {
    return (
        typeof msg === 'object' &&
        msg !== null &&
        'type' in msg &&
        typeof (msg as { type: unknown }).type === 'string'
    );
}

/**
 * Signaling channel types
 */
export type SignalingChannel = "backend" | "trystero" | "both" | "none";

/**
 * Statistics for signaling health and performance
 */
export interface SignalingStats {
    activeChannel: SignalingChannel;
    backendResponsive: boolean;
    trysteroResponsive: boolean;
    backendLatency: number | null;
    trysteroLatency: number | null;
    signalsSentBackend: number;
    signalsSentTrystero: number;
    signalsReceived: number;
}
