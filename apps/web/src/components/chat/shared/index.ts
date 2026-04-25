/**
 * Chat Shared Components
 *
 * Re-export surface for primitives shared across chat surfaces. Keep this
 * narrow — primitives that lose all consumers are deleted, not parked.
 */

export {
    AttachmentPreview,
    getFileType,
    getFileIcon,
    formatFileSize,
} from "./AttachmentPreview";
export type { FileType } from "./AttachmentPreview";
