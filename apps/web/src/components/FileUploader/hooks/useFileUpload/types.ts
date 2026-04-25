import type { Dispatch, SetStateAction, MutableRefObject, RefObject } from 'react';
import type { UploadFile, EncryptedResult, EncryptionState, SignatureParams } from '../../types';
import type { HybridPublicKey, HybridSignatureSecretKey } from '@stenvault/shared/platform/crypto';
import type { DuplicateInfo, DuplicateAction } from '../../components/DuplicateDialog';

// Re-export for convenience within submodules
export type { UploadFile, EncryptedResult, SignatureParams };

// ===== SERVER-SIDE TRACKING =====

export interface ServerUploadInfo {
    serverFileId: number;
    serverFileKey?: string;
    multipartUploadId?: string;
}

// ===== HOOK PARAMS / RETURN =====

export interface SigningContext {
    secretKey: HybridSignatureSecretKey;
    fingerprint: string;
    keyVersion: number;
}

export interface UseFileUploadParams {
    folderId?: number | null;
    maxFiles: number;
    maxSize: number;
    onUploadComplete?: () => void;
    signingContext?: SigningContext | null;
    showDuplicateDialog?: (info: DuplicateInfo) => Promise<DuplicateAction>;
}

export interface UseFileUploadReturn {
    // State
    uploadFiles: UploadFile[];
    isDragging: boolean;
    encryptionState: EncryptionState;
    isMultipartUpload: boolean;

    // File operations
    handleFiles: (fileList: FileList) => Promise<void>;
    handleFilesToFolder: (files: File[], targetFolderId: number | null) => Promise<void>;
    removeFile: (id: string) => void;
    retryFile: (id: string) => void;

    // Drag handlers
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;

    // Ref for file input
    fileInputRef: RefObject<HTMLInputElement | null>;
}

// ===== THUMBNAIL =====

export interface ThumbnailMetadata {
    thumbnailKey: string;
    thumbnailIv: string;
    thumbnailSize: number;
}

// ===== SINGLE UPLOAD TYPES =====

export interface ConfirmUploadInput {
    fileId: number;
    encryptionIv?: string;
    encryptionSalt?: string;
    encryptionVersion?: number;
    orgKeyVersion?: number;
    signatureParams?: SignatureParams;
    thumbnailMetadata?: ThumbnailMetadata;
    contentHash?: string;
    fingerprintVersion?: number;
}

export interface ConfirmUploadOutput {
    success: boolean;
    file: {
        id: number;
        filename: string;
        mimeType: string | null;
        size: number;
        createdAt: Date;
    };
}

export interface SingleUploadParams {
    id: string;
    file: File;
    uploadBlob: Blob;
    uploadSize: number;
    uploadContentType: string;
    encryptedResult: EncryptedResult | null;
    signatureParams?: SignatureParams;
    rawThumbnailBlob?: Blob | null;
    serverFileId: number;
    uploadUrl: string;
    setUploadFiles: Dispatch<SetStateAction<UploadFile[]>>;
    confirmUpload: { mutateAsync: (p: ConfirmUploadInput) => Promise<ConfirmUploadOutput> };
    getThumbnailUploadUrl: { mutateAsync: (p: { fileId: number; size: number }) => Promise<{ uploadUrl: string; thumbnailKey: string; expiresIn: number }> };
    deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
    orgKeyVersion?: number;
    contentHash?: string;
    operationId?: string;
    signal?: AbortSignal;
}

// ===== MULTIPART UPLOAD TYPES =====

export interface PartUrlInput {
    fileId: number;
    uploadId: string;
    fileKey: string;
    partNumber: number;
    partSize: number;
}

export interface CompleteMultipartInput {
    fileId: number;
    uploadId: string;
    fileKey: string;
    parts: { partNumber: number; etag: string }[];
    encryptionIv?: string;
    encryptionSalt?: string;
    encryptionVersion?: number;
    orgKeyVersion?: number;
    signatureParams?: SignatureParams;
    thumbnailMetadata?: ThumbnailMetadata;
    contentHash?: string;
    fingerprintVersion?: number;
}

export interface CompleteMultipartOutput {
    success: boolean;
    fileId: number;
    message: string;
}

export interface AbortMultipartInput {
    fileId: number;
    uploadId: string;
    fileKey: string;
}

export interface AbortMultipartOutput {
    success: boolean;
    message: string;
}

export interface MultipartUploadParams {
    id: string;
    file: File;
    uploadBlob: Blob;
    uploadSize: number;
    encryptedResult: EncryptedResult | null;
    signatureParams?: SignatureParams;
    rawThumbnailBlob?: Blob | null;
    serverFileId: number;
    multipartParams: { uploadId: string; fileKey: string; partSize: number; totalParts: number };
    setIsMultipartUpload: (v: boolean) => void;
    setUploadFiles: Dispatch<SetStateAction<UploadFile[]>>;
    getPartUrl: { mutateAsync: (p: PartUrlInput) => Promise<{ uploadUrl: string }> };
    completeMultipart: { mutateAsync: (p: CompleteMultipartInput) => Promise<CompleteMultipartOutput> };
    abortMultipart: { mutateAsync: (p: AbortMultipartInput) => Promise<AbortMultipartOutput> };
    getThumbnailUploadUrl: { mutateAsync: (p: { fileId: number; size: number }) => Promise<{ uploadUrl: string; thumbnailKey: string; expiresIn: number }> };
    deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
    orgKeyVersion?: number;
    contentHash?: string;
    operationId?: string;
}

// ===== UPLOAD PIPELINE DEPENDENCY INJECTION =====

export interface UploadPipelineDeps {
    // Config
    maxSize: number;
    folderId: number | null | undefined;
    useMasterKeyEncryption: boolean;
    multipartThreshold: number;
    signingContext?: SigningContext | null;

    // State setters
    setUploadFiles: Dispatch<SetStateAction<UploadFile[]>>;
    setIsMultipartUpload: (v: boolean) => void;

    // Server info ref
    serverInfoRef: MutableRefObject<Map<string, ServerUploadInfo>>;

    // tRPC mutations — typed loosely to avoid coupling to tRPC's complex generated types.
    // The pipeline calls mutateAsync with the correct shape; TS verifies at each call site.
     
    getUploadUrl: { mutateAsync: (p: any) => Promise<any> };
     
    checkDuplicate: { mutateAsync: (p: any) => Promise<any> };
     
    confirmUpload: { mutateAsync: (p: any) => Promise<any> };
     
    initiateMultipart: { mutateAsync: (p: any) => Promise<any> };
     
    getPartUrl: { mutateAsync: (p: any) => Promise<any> };
     
    completeMultipart: { mutateAsync: (p: any) => Promise<any> };
     
    abortMultipart: { mutateAsync: (p: any) => Promise<any> };
     
    getThumbnailUploadUrl: { mutateAsync: (p: any) => Promise<any> };

    // tRPC utils (for org hybrid public key fetch)
     
    trpcUtils: { orgKeys: { getOrgHybridPublicKey: { fetch: (p: { organizationId: number }) => Promise<any> } } };

    // Master key functions
    deriveFilenameKey: () => Promise<CryptoKey>;
    deriveFingerprintKey: () => Promise<CryptoKey>;
    deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
    getHybridPublicKey: () => Promise<HybridPublicKey>;

    // Org-aware functions
    currentOrgId?: number | null;
    unlockOrgVault: (orgId: number) => Promise<unknown>;
    getOrgKeyVersion: (orgId: number) => number | null;
    deriveOrgFilenameKey: (orgId: number) => Promise<CryptoKey>;
    deriveOrgThumbnailKey: (orgId: number, fileId: string) => Promise<CryptoKey>;

    // Duplicate dialog
    showDuplicateDialog?: (info: DuplicateInfo) => Promise<DuplicateAction>;

    // Server cleanup
    cleanupServerUpload: (uploadId: string) => void;
}
