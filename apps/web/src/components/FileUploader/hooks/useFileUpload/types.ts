import type { Dispatch, SetStateAction, MutableRefObject, RefObject } from 'react';
import type { UploadFile, EncryptedResult, EncryptionState, SignatureParams } from '../../types';
import type { HybridPublicKey, HybridSignatureSecretKey } from '@stenvault/shared/platform/crypto';
import type { HybridEncryptionSeed } from '@/lib/hybridFile/types';
import type { VaultUploadResumeRecordView } from '@/lib/uploadResume';
import type { DuplicateInfo, DuplicateAction } from '../../components/DuplicateDialog';

// Re-export for convenience within submodules
export type { UploadFile, EncryptedResult, SignatureParams };

// ===== SERVER-SIDE TRACKING =====

export interface ServerUploadInfo {
    serverFileId: number;
    serverFileKey?: string;
    multipartUploadId?: string;
    /**
     * Closure to resume a multipart upload after a transient failure.
     *
     * Captures the encrypted blob + completion metadata so a retry can call
     * `queryMultipartStatus`, skip parts already in R2, and finish the upload
     * without re-encrypting from scratch. Cleared on success or user-explicit
     * cancel; absence means retry should restart from scratch.
     */
    resume?: () => Promise<void>;
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

    // Cross-session resume — populated on mount with any in-flight uploads
    // whose tabs were closed before completion. Resume requires the user to
    // re-pick the original file via `resumeUpload`. Records are banner-views
    // only — the wrapped fileKey is fetched and unwrapped inside `resumeUpload`
    // (which fails closed if the vault is locked).
    resumableRecords: VaultUploadResumeRecordView[];
    resumeUpload: (record: VaultUploadResumeRecordView, file: File) => Promise<void>;
    dismissResumableRecord: (serverFileId: number) => Promise<void>;
    /** Whether the vault is currently unlocked. Banner uses this to gate the
     *  Resume button — clicking while locked can't unwrap the seed, so we
     *  disable upfront instead of letting the user hit a toast. */
    vaultUnlocked: boolean;
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

export interface QueryMultipartStatusInput {
    fileId: number;
    uploadId: string;
    fileKey: string;
}

export interface QueryMultipartStatusOutput {
    parts: { partNumber: number; etag: string }[];
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
    /** Encryption seed — persisted to IndexedDB for cross-session resume. */
    encryptionSeed: HybridEncryptionSeed;
    /** Folder where the file is being uploaded — pinned in the resume record. */
    folderId: number | null | undefined;
    setIsMultipartUpload: (v: boolean) => void;
    setUploadFiles: Dispatch<SetStateAction<UploadFile[]>>;
    getPartUrl: { mutateAsync: (p: PartUrlInput) => Promise<{ uploadUrl: string }> };
    completeMultipart: { mutateAsync: (p: CompleteMultipartInput) => Promise<CompleteMultipartOutput> };
    abortMultipart: { mutateAsync: (p: AbortMultipartInput) => Promise<AbortMultipartOutput> };
    queryMultipartStatus: (p: QueryMultipartStatusInput) => Promise<QueryMultipartStatusOutput>;
    getThumbnailUploadUrl: { mutateAsync: (p: { fileId: number; size: number }) => Promise<{ uploadUrl: string; thumbnailKey: string; expiresIn: number }> };
    deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
    contentHash?: string;
    operationId?: string;
    /** Pipeline-level ref so the flow can stash a resume closure on failure. */
    serverInfoRef: MutableRefObject<Map<string, ServerUploadInfo>>;
    /** Owner of the upload — bound into the wrap AAD so a record can't be
     *  unwrapped against a different user's master key. */
    userId: number;
    /** Master HKDF key used to derive the upload-resume KEK. Required to
     *  wrap the fileKey before it lands in IndexedDB. */
    hkdfKey: CryptoKey;
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

    queryMultipartStatus: (p: QueryMultipartStatusInput) => Promise<QueryMultipartStatusOutput>;

    getThumbnailUploadUrl: { mutateAsync: (p: any) => Promise<any> };

    // tRPC utils (kept loose for future use)
    trpcUtils: unknown;

    // Master key functions
    deriveFilenameKey: () => Promise<CryptoKey>;
    deriveFingerprintKey: () => Promise<CryptoKey>;
    deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
    getHybridPublicKey: () => Promise<HybridPublicKey>;
    /** Master HKDF key — required to wrap the resume seed before persisting. */
    hkdfKey: CryptoKey;
    /** Authenticated user id — bound into the resume-record AAD. */
    userId: number;

    // Duplicate dialog
    showDuplicateDialog?: (info: DuplicateInfo) => Promise<DuplicateAction>;

    // Server cleanup
    cleanupServerUpload: (uploadId: string) => void;
}
