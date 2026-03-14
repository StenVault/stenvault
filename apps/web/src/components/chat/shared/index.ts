/**
 * Chat Shared Components
 *
 * Componentes e utilitários compartilhados entre:
 * - AI Chat (components/ai/chat/)
 * - P2P Chat (components/chat/)
 */

// Base components
export { MessageBubbleBase, MessageContent } from "./MessageBubbleBase";
export type { SenderType, BubbleVariant } from "./MessageBubbleBase";

export { ChatInputBase, useChatInput } from "./ChatInputBase";

export {
    AttachmentPreview,
    getFileType,
    getFileIcon,
    formatFileSize,
} from "./AttachmentPreview";
export type { FileType } from "./AttachmentPreview";
