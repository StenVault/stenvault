/**
 * P2P Module - Frontend Types
 * TypeScript types for P2P file sharing UI components.
 */


export type P2PSessionStatus =
    | "waiting"
    | "connecting"
    | "connected"
    | "transferring"
    | "completed"
    | "failed"
    | "expired"
    | "cancelled";

export type EncryptionMethod = "webrtc" | "double" | "shamir";

export interface P2PSession {
    id: number;
    sessionId: string;
    senderId: number;
    senderName?: string;
    senderEmail?: string;
    fileId: number;
    fileName?: string;
    fileSize?: number;
    fileMimeType?: string;
    recipientId?: number;
    recipientEmail?: string;
    encryptionMethod: EncryptionMethod;
    splitShares: number;
    status: P2PSessionStatus;
    progress: number;
    bytesTransferred: number;
    expiresAt: Date | string;
    createdAt: Date | string;
    connectedAt?: Date | string;
    completedAt?: Date | string;
    senderPublicKey?: string; // Base64url X25519 public key
    recipientPublicKey?: string; // Base64url X25519 public key
}

export interface P2PSignal {
    senderId: number; // ID of the user who sent this signal
    signalType: "offer" | "answer" | "ice_candidate" | "key_exchange" | "recipient_joined";
    signalData: string;
    timestamp: number;
}


/**
 * Message sent by receiver to request resuming a transfer
 */
export interface ResumeRequestMessage {
    type: "resume_request";
    sessionId: string;
    /** Chunks already received by the receiver */
    receivedChunks: number[];
    /** Protocol used (simple or chunked) */
    protocol: "simple" | "chunked";
}

/**
 * Message sent by sender to accept resume request
 */
export interface ResumeResponseMessage {
    type: "resume_response";
    sessionId: string;
    /** Chunks the sender will re-send */
    missingChunks: number[];
    /** Whether sender accepts the resume */
    accepted: boolean;
}

/**
 * Message sent when resume cannot be completed
 */
export interface ResumeRejectMessage {
    type: "resume_reject";
    sessionId: string;
    reason: "file_unavailable" | "session_expired" | "protocol_mismatch" | "unknown";
}

/**
 * Union type for all resume-related messages
 */
export type ResumeMessage = ResumeRequestMessage | ResumeResponseMessage | ResumeRejectMessage;

/**
 * Information about a resumable transfer stored in IndexedDB
 */
export interface ResumableTransferInfo {
    sessionId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    progress: number; // 0-100
    bytesTransferred: number;
    totalBytes: number;
    completedChunks: number;
    totalChunks: number;
    protocol: "simple" | "chunked";
    isE2E: boolean;
    shareUrl?: string;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}


export interface KeyExchangeData {
    publicKeyBase64: string; // Base64url X25519 raw public key
    fingerprint: string; // 16 char hex fingerprint for verification
}

export interface KeyExchangeState {
    myKeyPair: CryptoKeyPair | null;
    myFingerprint: string | null;
    peerPublicKey: Uint8Array | null; // Raw X25519 public key bytes
    peerFingerprint: string | null;
    isExchangeComplete: boolean;
}


export type P2PConnectionState =
    | "idle"
    | "creating"
    | "waiting"
    | "key_exchange" // Exchanging X25519 public keys
    | "connecting"
    | "connected"
    | "manifest" // Chunked: receiving file manifest
    | "transferring"
    | "verifying" // Chunked: verifying file integrity
    | "completed"
    | "failed"
    | "disconnected";

export type TransferMode = "stream" | "chunked";

export interface P2PTransferState {
    status: P2PConnectionState;
    progress: number;
    bytesTransferred: number;
    totalBytes: number;
    speed: number; // bytes per second
    estimatedTimeRemaining: number; // seconds
    error?: string;
    isEncrypted: boolean; // Whether E2E encryption is active
    peerFingerprint?: string; // Peer's key fingerprint for display
    // Chunked transfer fields
    mode: TransferMode;
    totalChunks?: number;
    completedChunks?: number;
    failedChunks?: number[];
}

export interface P2PShareOptions {
    fileId: number;
    recipientEmail?: string;
    encryptionMethod: EncryptionMethod;
    splitShares: number;
    expiresInMinutes: number;
    useChunkedTransfer?: boolean; // Enable BitTorrent-style transfer
}

export interface ICEServer {
    urls: string | string[];
    username?: string;
    credential?: string;
}

export interface P2PConfig {
    iceServers: ICEServer[];
    maxFileSizeMb: number;
    signalingTimeoutMs: number;
    maxConcurrentTransfers: number;
}


export interface UseP2PTransferResult {
    // State
    connectionState: P2PConnectionState;
    transferState: P2PTransferState;
    session: P2PSession | null;

    // Actions
    createSession: (options: P2PShareOptions) => Promise<{ sessionId: string; shareUrl: string }>;
    joinSession: (sessionId: string) => Promise<void>;
    cancelTransfer: () => void;

    // Connection
    isConnected: boolean;
    error: string | null;
}

export interface UseP2PSignalingResult {
    sendSignal: (signal: P2PSignal) => Promise<void>;
    signals: P2PSignal[];
    isPolling: boolean;
    startPolling: () => void;
    stopPolling: () => void;
}


export interface P2PShareModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileId: number;
    fileName: string;
    fileSize?: number;
}

export interface P2PReceivePageProps {
    sessionId: string;
}

export interface P2PTransferProgressProps {
    state: P2PTransferState;
    fileName?: string;
    onCancel?: () => void;
}

export interface P2PConnectionStatusProps {
    status: P2PConnectionState;
    peerName?: string;
}
