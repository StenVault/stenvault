/**
 * Chat / E2E Encrypted Messaging Types
 * 
 * Types for end-to-end encrypted chat functionality.
 * Re-exported from: apps/api/src/_core/chat/*.procedures.ts
 * 
 * @generated 2026-01-08
 */


export type MessageType = 'text' | 'file' | 'image' | 'video';

export interface ChatMessage {
    id: number;
    fromUserId: number;
    toUserId: number;
    messageType: MessageType;
    content?: string;         // Encrypted content (E2E)
    fileKey?: string;         // S3/R2 key for attachments
    filename?: string;
    fileSize?: number;
    iv?: string;              // AES IV (E2E)
    salt?: string;            // Key derivation salt (E2E)
    isEncrypted: boolean;
    keyVersion?: number;      // Key rotation support
    isRead: boolean;
    isDeleted: boolean;
    createdAt: Date;
    deletedAt?: Date;
}


export type ConnectionStatus = 'pending' | 'accepted' | 'blocked';

export interface ChatConnection {
    id: number;
    userId: number;
    connectedUserId: number;
    nickname?: string | null;
    status: ConnectionStatus;
    createdAt: Date;
    updatedAt: Date;
    connectedUser?: {
        id: number;
        name?: string | null;
        email: string;
    };
    lastMessage?: {
        id: number;
        fromUserId: number;
        toUserId: number;
        content?: string | null;
        messageType: MessageType;
        createdAt: Date;
    } | null;
    unreadCount: number;
}


export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface ChatInvite {
    id: number;
    fromUserId: number;
    inviteCode: string;
    toEmail: string;
    inviteType: 'chat';
    status: InviteStatus;
    expiresAt: Date;
    createdAt: Date;
}


export interface UserKeyPair {
    id: number;
    userId: number;
    publicKey: string;      // JWK stringified
    deviceLabel: string;
    isActive: boolean;
    createdAt: Date;
}

export interface PublicKeyResult {
    publicKey: string;
    keyId: number;
}


export interface CreateInviteInput {
    toEmail: string;
    expiresInHours?: number;  // 1-168, default 24
}

export interface AcceptInviteInput {
    inviteCode: string;
}

export interface RevokeInviteInput {
    inviteId: number;
}

export interface GetConnectionsInput {
    status?: ConnectionStatus;
}

export interface GetConnectionDetailsInput {
    connectedUserId: number;
}

export interface BlockConnectionInput {
    connectionId: number;
}

export interface UnblockConnectionInput {
    connectionId: number;
}

export interface UpdateNicknameInput {
    connectionId: number;
    nickname: string | null;
}

export interface SendMessageInput {
    toUserId: number;
    messageType?: MessageType;
    content?: string;
    fileKey?: string;
    filename?: string;
    fileSize?: number;
    iv?: string;
    salt?: string;
    isEncrypted?: boolean;
    keyVersion?: number;
}

export interface GetMessagesInput {
    withUserId: number;
    limit?: number;         // 1-100, default 50
    beforeMessageId?: number;
}

export interface MarkAsReadInput {
    messageIds: number[];
}

export interface DeleteMessageInput {
    messageId: number;
}

export interface StorePublicKeyInput {
    publicKey: string;
    deviceLabel?: string;   // default "default"
}

export interface GetPublicKeyInput {
    userId: number;
}

export interface GetAttachmentUploadUrlInput {
    filename: string;
    mimeType: string;
    size: number;
}

export interface GetAttachmentDownloadUrlInput {
    messageId: number;
}


export interface CreateInviteResult {
    success: boolean;
    invite: {
        id: number;
        inviteCode: string;
        toEmail: string;
        expiresAt: Date;
    };
}

export interface AcceptInviteResult {
    success: boolean;
    connectionUserId: number;
}

export interface SendMessageResult {
    success: boolean;
    messageId: number;
}

export interface StorePublicKeyResult {
    success: boolean;
    keyId: number;
}

export interface AttachmentUploadResult {
    uploadUrl: string;
    fileKey: string;
    expiresIn: number;
}

export interface AttachmentDownloadResult {
    downloadUrl: string;
    filename: string;
    mimeType: string;
    size: number;
}

export interface SuccessResult {
    success: boolean;
}
