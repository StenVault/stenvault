/**
 * File Type Definitions
 * 
 * Centralized file type definitions used across frontend and backend.
 * Import from @cloudvault/shared to ensure consistency.
 */

/**
 * Core file types for Drive files
 * Used for file display, icons, filtering, etc.
 */
export type FileType =
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'folder'
    | 'other';

/**
 * File types without folder (for actual files only)
 * Use when folder is not a valid option
 */
export type FileTypeNoFolder = Exclude<FileType, 'folder'>;

/**
 * File colors for consistent UI across the application
 * Maps file types to their brand colors
 */
export const FILE_TYPE_COLORS: Record<FileType, string> = {
    image: '#10B981',    // Green
    video: '#8B5CF6',    // Purple
    audio: '#F59E0B',    // Amber
    document: '#3B82F6', // Blue
    folder: '#6366F1',   // Indigo
    other: '#6B7280',    // Gray
};

/**
 * Helper to get file type color with fallback
 */
export function getFileTypeColor(type: FileType | string): string {
    return FILE_TYPE_COLORS[type as FileType] ?? FILE_TYPE_COLORS.other;
}

/**
 * Helper to check if a type is a valid FileType
 */
export function isValidFileType(type: string): type is FileType {
    return ['image', 'video', 'audio', 'document', 'folder', 'other'].includes(type);
}

/**
 * Helper to determine FileType from MIME type
 * @param mimeType - The MIME type string (e.g., "image/png")
 * @returns The corresponding FileType
 */
export function getFileTypeFromMime(mimeType: string | null | undefined): FileTypeNoFolder {
    if (!mimeType) return 'other';

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
        mimeType.includes('pdf') ||
        mimeType.includes('document') ||
        mimeType.includes('text/') ||
        mimeType.includes('application/msword') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation')
    ) {
        return 'document';
    }

    return 'other';
}
