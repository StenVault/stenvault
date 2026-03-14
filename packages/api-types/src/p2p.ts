/**
 * P2P / Quantum Mesh Network Types
 * 
 * Types for peer-to-peer file sharing functionality.
 * Re-exported from: apps/api/src/_core/p2p/types.ts
 * 
 * @generated 2026-01-08
 */


export const P2PSessionStatus = {
    WAITING: "waiting",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    TRANSFERRING: "transferring",
    COMPLETED: "completed",
    FAILED: "failed",
    EXPIRED: "expired",
    CANCELLED: "cancelled",
} as const;

export type P2PSessionStatusType = (typeof P2PSessionStatus)[keyof typeof P2PSessionStatus];

export const EncryptionMethod = {
    WEBRTC: "webrtc",
    DOUBLE: "double",
    SHAMIR: "shamir",
} as const;

export type EncryptionMethodType = (typeof EncryptionMethod)[keyof typeof EncryptionMethod];

export const SignalType = {
    OFFER: "offer",
    ANSWER: "answer",
    ICE_CANDIDATE: "ice_candidate",
    KEY_EXCHANGE: "key_exchange",
    RECIPIENT_JOINED: "recipient_joined",
} as const;

export type SignalTypeType = (typeof SignalType)[keyof typeof SignalType];


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
    encryptionMethod: EncryptionMethodType;
    splitShares: number;
    status: P2PSessionStatusType;
    progress: number;
    bytesTransferred: number;
    expiresAt: Date;
    createdAt: Date;
    connectedAt?: Date;
    completedAt?: Date;
    senderPublicKey?: string;
    recipientPublicKey?: string;
    senderFingerprint?: string;
    recipientFingerprint?: string;
}

export interface P2PSignal {
    id: number;
    sessionId: string;
    senderId: number;
    signalType: SignalTypeType;
    signalData: string;
    createdAt: Date;
}


export interface CreateSessionInput {
    fileId: number;
    recipientEmail?: string;
    encryptionMethod?: 'webrtc' | 'double' | 'shamir';
    splitShares?: number;
    expiresInMinutes?: number;
    senderPublicKey?: string;
}

export interface JoinSessionInput {
    sessionId: string;
    recipientPublicKey?: string;
}

export interface SendSignalInput {
    sessionId: string;
    signalType: 'offer' | 'answer' | 'ice_candidate' | 'key_exchange' | 'recipient_joined';
    signalData: string;
}

export interface GetSignalsInput {
    sessionId: string;
    since?: number;
}

export interface UpdateProgressInput {
    sessionId: string;
    progress: number;
    bytesTransferred: number;
}

export interface CompleteSessionInput {
    sessionId: string;
    success: boolean;
    errorMessage?: string;
}

export interface ListSessionsInput {
    status?: 'all' | 'active' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
}


export interface CreateSessionResult {
    sessionId: string;
    shareUrl: string;
    expiresAt: Date;
    encryptionKey?: string;
}

export interface JoinSessionResult {
    session: P2PSession;
    senderPublicKey?: string;
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


export interface OfflineSession {
    id: number;
    sessionId: string;
    senderId: number;
    recipientEmail?: string;
    fileId: number;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
    status: 'pending' | 'uploading' | 'ready' | 'downloading' | 'completed' | 'failed' | 'expired';
    totalChunks: number;
    uploadedChunks: number;
    downloadedChunks: number;
    expiresAt: Date;
    createdAt: Date;
}

export interface OfflineChunk {
    chunkNumber: number;
    size: number;
    uploadUrl?: string;
    downloadUrl?: string;
}

export interface OfflineStats {
    pendingTransfers: number;
    completedTransfers: number;
    totalBytesSent: number;
    totalBytesReceived: number;
}
