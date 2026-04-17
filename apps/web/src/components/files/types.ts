/**
 * FileList Component Types
 * 
 * Shared types and interfaces for the FileList component family.
 * Note: FileType is imported from @stenvault/shared for consistency.
 */

import { type FileTypeNoFolder, type TimestampStatus } from "@stenvault/shared";

// Re-export for backward compatibility
export type { FileType, FileTypeNoFolder, TimestampStatus } from "@stenvault/shared";

/**
 * Timestamp props for file list components
 * Groups related timestamp functionality together
 */
export interface TimestampProps<T = FileItem> {
    /** Get timestamp status for a file by ID */
    getStatus: (fileId: number) => TimestampStatus | null;
    /** Callback when timestamp action is triggered */
    onClick?: (file: T) => void;
}

export type ViewMode = 'grid' | 'list' | 'gallery';

export interface FileItem {
    id: number;
    filename: string;
    mimeType: string | null;
    size: number;
    fileType: FileTypeNoFolder;
    folderId: number | null;
    createdAt: Date;
    // Additional fields from API
    updatedAt?: Date;
    isFavorite?: boolean;
    organizationId?: number | null;
    userId?: number;
    // Encryption version (V4 = Hybrid PQC)
    encryptionVersion?: number | null;
    // Encrypted filename (zero-knowledge).
    encryptedFilename?: string | null;
    filenameIv?: string | null;
    plaintextExtension?: string | null;
    /** Decrypted filename (populated client-side) */
    decryptedFilename?: string;
    // Encrypted thumbnail.
    /** URL to fetch encrypted thumbnail from R2 */
    thumbnailUrl?: string | null;
    /** IV for decrypting thumbnail */
    thumbnailIv?: string | null;
    /** Source file ID for duplicates — thumbnail HKDF uses this instead of file.id */
    duplicatedFromId?: number | null;
    /** Whether this file has been cryptographically signed */
    isSigned?: boolean;
    /** When the file was signed (null if not signed) */
    signedAt?: Date | null;
}

/**
 * Extended file interface for preview modal
 * Includes optional encryption metadata needed for decryption
 *
 * Note: All files are always encrypted (zero-knowledge architecture).
 * - encryptionIv/encryptionSalt carry the per-file encryption params
 */
export interface PreviewableFile {
    id: number;
    filename: string;
    mimeType: string | null;
    size: number;
    fileType: FileTypeNoFolder;
    /** When the file was created */
    createdAt?: Date;
    /** Encryption IV (always present for encrypted files) */
    encryptionIv?: string | null;
    /** Encryption salt */
    encryptionSalt?: string | null;
    /** Encryption version (V4 = Hybrid PQC) */
    encryptionVersion?: number | null;
    /** Encrypted filename (zero-knowledge) */
    encryptedFilename?: string | null;
    filenameIv?: string | null;
    plaintextExtension?: string | null;
    /** Decrypted filename (populated client-side by useFilenameDecryption) */
    decryptedFilename?: string;
    /** Vault Model: organization this file belongs to (null = personal) */
    organizationId?: number | null;
    /** Vault Model: OMK key version used to encrypt (null = personal MK) */
    orgKeyVersion?: number | null;
}


export interface FolderItem {
    id: number;
    name: string;                    // opaque "Folder" for encrypted folders, or legacy plaintext
    encryptedName?: string | null;   // Base64 AES-GCM ciphertext
    nameIv?: string | null;          // Base64 IV
    parentId: number | null;
    createdAt: Date;
    organizationId?: number | null;  // needed for org key derivation
}

export interface FileListProps {
    folderId?: number | null;
    /** Vault Model: organization context (null/undefined = personal files) */
    organizationId?: number | null;
    onFolderClick?: (folderId: number) => void;
    onFilePreview?: (file: FileItem) => void;
    onFileDownload?: (file: FileItem) => void;
    onUploadRequest?: () => void;
    className?: string;
    isVaultLocked?: boolean;
}

export interface BreadcrumbItem {
    id: number | null;
    name: string;
}

export interface DialogState<T> {
    open: boolean;
    item: T | null;
}

export interface RenameDialogState extends DialogState<FileItem | FolderItem> {
    type: 'file' | 'folder';
}

export interface DeleteDialogState extends DialogState<FileItem | FolderItem> {
    type: 'file' | 'folder';
}

export interface ShareDialogState {
    open: boolean;
    file: FileItem | null;
}

export interface FileActionsProps {
    onPreview?: (file: FileItem) => void;
    onDownload: (file: FileItem) => void;
    onShare: (file: FileItem) => void;
    onRename: (item: FileItem | FolderItem, type: 'file' | 'folder') => void;
    onDelete: (item: FileItem | FolderItem, type: 'file' | 'folder') => void;
}
