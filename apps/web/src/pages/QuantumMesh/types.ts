/**
 * Quantum Mesh Network - Types
 * Type definitions for the P2P Transfers Dashboard
 */

export type SessionStatus = "waiting" | "connecting" | "transferring" | "completed" | "failed" | "expired" | "cancelled";

export interface Session {
    id: number;
    sessionId: string;
    senderId: number;
    recipientId?: number | null;
    fileName?: string;
    fileSize?: number;
    status: SessionStatus;
    progress?: number;
    createdAt: Date;
    expiresAt: Date;
    completedAt?: Date | null;
    encryptionMethod?: string;
}

export interface OfflineTransfer {
    sessionId: string;
    senderName?: string;
    senderEmail: string;
    fileName?: string;
    fileSize?: number;
    expiresAt: Date;
    createdAt: Date;
}

export interface QuantumMeshStats {
    total: number;
    active: number;
    pending: number;
    completed: number;
}

export interface ViewProps {
    isEnabled: boolean;
    sessions: Session[];
    pendingTransfers: OfflineTransfer[];
    stats: QuantumMeshStats;
    isLoading: boolean;
    onRefresh: () => void;
}
