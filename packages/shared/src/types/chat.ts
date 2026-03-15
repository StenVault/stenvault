/**
 * Chat Type Definitions
 *
 * Centralized type definitions for E2E encrypted chat features.
 * Import from @stenvault/shared to ensure consistency.
 */

/**
 * File attachment type for chat messages
 */
export type ChatFileAttachmentType = "image" | "video" | "file";

/**
 * File attachment data for chat messages
 */
export interface ChatFileAttachment {
    fileKey: string;
    filename: string;
    size: number;
    type: ChatFileAttachmentType;
}

/**
 * Input data for sending a chat message
 */
export interface ChatMessageInput {
    content: string;
    fileAttachment?: ChatFileAttachment;
}

/**
 * Chat connection status
 */
export type ChatConnectionStatus = "pending" | "accepted" | "blocked";

/**
 * Chat message type
 */
export type ChatMessageType = "text" | "file" | "image" | "video";
