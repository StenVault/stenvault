/**
 * MIME Type Utilities
 * 
 * Detect MIME type from file extension when browser doesn't provide it.
 */

/**
 * Map of file extensions to MIME types
 */
const MIME_TYPE_MAP: Record<string, string> = {
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'ogv': 'video/ogg',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'flv': 'video/x-flv',
    '3gp': 'video/3gpp',
    'mpeg': 'video/mpeg',
    'mpg': 'video/mpeg',
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'oga': 'audio/ogg',
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt': 'application/vnd.oasis.opendocument.text',
    'ods': 'application/vnd.oasis.opendocument.spreadsheet',
    'odp': 'application/vnd.oasis.opendocument.presentation',
    // Text
    'txt': 'text/plain',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'ts': 'text/typescript',
    'md': 'text/markdown',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv',
    'yaml': 'text/yaml',
    'yml': 'text/yaml',
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'bz2': 'application/x-bzip2',
    // Code
    'py': 'text/x-python',
    'java': 'text/x-java',
    'c': 'text/x-c',
    'cpp': 'text/x-c++',
    'h': 'text/x-c',
    'go': 'text/x-go',
    'rs': 'text/x-rust',
    'rb': 'text/x-ruby',
    'php': 'text/x-php',
    'sh': 'text/x-shellscript',
    'sql': 'text/x-sql',
};

/**
 * Get MIME type for a file, using browser-provided type or falling back to extension mapping
 * @param file - The file to get MIME type for
 * @returns The MIME type string
 */
export function getMimeType(file: File): string {
    // If browser provides a type, use it
    if (file.type) {
        return file.type;
    }

    // Otherwise, infer from extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    return MIME_TYPE_MAP[extension || ''] || 'application/octet-stream';
}

/**
 * Check if a file is an image based on MIME type
 */
export function isImageFile(file: File): boolean {
    const mimeType = getMimeType(file);
    return mimeType.startsWith('image/');
}

/**
 * Check if a file is a video based on MIME type
 */
export function isVideoFile(file: File): boolean {
    const mimeType = getMimeType(file);
    return mimeType.startsWith('video/');
}

/**
 * Check if a file is audio based on MIME type
 */
export function isAudioFile(file: File): boolean {
    const mimeType = getMimeType(file);
    return mimeType.startsWith('audio/');
}
