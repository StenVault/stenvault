/**
 * File Management Types
 *
 * Types for file upload, download, and management.
 */

// ============ File Types ============

import { type FileTypeNoFolder } from '@stenvault/shared';

export type FileType = FileTypeNoFolder;

export interface CloudFile {
    id: number;
    filename: string;
    originalFilename: string;
    mimeType: string;
    size: number;
    fileKey: string;
    fileType: FileType;
    isFavorite?: boolean;
    folderId: number | null;
    thumbnailUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface DeletedFile extends CloudFile {
    deletedAt: Date;
    daysUntilPermanentDeletion: number;
}

export interface Folder {
    id: number;
    name: string;
    parentId: number | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface FolderWithContents extends Folder {
    subfolders: Folder[];
    files: Array<{
        id: number;
        filename: string;
        mimeType: string;
        size: number;
        fileType: string;
        createdAt: Date;
    }>;
}

// ============ Storage Types ============

export interface StorageStats {
    used: number;
    limit: number;
    percentage: number;
    fileCount: number;
}

export interface StorageStatsResponse {
    totalSize: number;
    fileCount: number;
    storageQuota: number;
    storageUsed: number;
    percentUsed: number;
    remainingSpace: number;
    maxFileSize: number;
}

export interface StorageDistribution {
    image: { size: number; count: number };
    video: { size: number; count: number };
    audio: { size: number; count: number };
    document: { size: number; count: number };
    other: { size: number; count: number };
}

// ============ Input Types ============

export interface FileListInput {
    parentId?: number | null;
}

export interface DeleteFileInput {
    fileId: number;
}

export interface RenameFileInput {
    fileId: number;
    newName: string;
}

export interface MoveFileInput {
    fileId: number;
    targetFolderId: number | null;
}

export interface GetDownloadUrlInput {
    fileId: number;
}

export interface ToggleFavoriteInput {
    fileId: number;
}

export interface FolderListInput {
    parentId?: number | null;
}

export interface CreateFolderInput {
    name: string;
    parentId?: number | null;
}

export interface RenameFolderInput {
    folderId: number;
    newName: string;
}

export interface DeleteFolderInput {
    folderId: number;
    recursive?: boolean;
}

export interface MoveFolderInput {
    folderId: number;
    targetParentId: number | null;
}

// ============ Result Types ============

export interface DownloadUrlResult {
    url: string;
}

export interface StreamUrlResult {
    url: string;
    filename: string;
    contentType: string;
    size: number;
    fileType: string;
    encryptionIv?: string;
    encryptionSalt?: string;
    encryptionVersion?: number;
}

export interface ThumbnailUrlResult {
    url: string;
    filename: string;
    mimeType: string;
}

export interface UploadUrlResult {
    uploadUrl: string;
    fileId: number;
    fileKey: string;
}

// ============ Multipart Upload Types ============

export interface MultipartConfig {
    threshold: number;
    partSize: number;
    maxParts: number;
    maxFileSize: number;
}

export interface InitiateMultipartResult {
    fileId: number;
    fileKey: string;
    uploadId: string;
    totalParts: number;
}

export interface UploadPartUrlResult {
    uploadUrl: string;
}

export interface MultipartPart {
    partNumber: number;
    etag: string;
}

// ============ Batch Operation Types ============

export interface BatchDeleteResult {
    deleted: number[];
    failed: { id: number; error: string }[];
}

export interface BatchRenameInput {
    renames: { fileId: number; newName: string }[];
}

export interface BatchRenameResult {
    renamed: { fileId: number; newName: string }[];
    failed: { fileId: number; error: string }[];
}

// ============ Version Types ============

export interface FileVersion {
    id: number;
    versionNumber: number;
    size: number;
    createdBy: number;
    comment?: string;
    createdAt: Date;
}

// ============ Trash Types ============

export interface TrashListResult {
    files: DeletedFile[];
    totalCount: number;
}

export interface RestoreFileInput {
    fileId: number;
}

export interface EmptyTrashResult {
    deletedCount: number;
    freedBytes: number;
}
