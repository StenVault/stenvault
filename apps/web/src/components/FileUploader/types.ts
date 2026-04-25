/**
 * FileUploader Types
 * 
 * Centralized type definitions for the FileUploader module.
 */

/**
 * Represents a file in the upload queue
 */
export interface UploadFile {
    id: string;
    file: File;
    progress: number;
    status: 'pending' | 'encrypting' | 'uploading' | 'completed' | 'error';
    error?: string;
    previewUrl?: string;
}

/**
 * Props for the FileUploader component
 */
export interface FileUploaderProps {
    /** Folder ID to upload files to (null for root) */
    folderId?: number | null;
    /** Callback when all uploads complete */
    onUploadComplete?: () => void;
    /** Maximum number of files allowed (default: 10) */
    maxFiles?: number;
    /** Maximum file size in bytes (if not provided, uses server value) */
    maxSize?: number;
    /** Additional CSS classes */
    className?: string;
    /** Maximum files per folder upload (from plan, -1 = unlimited) */
    folderUploadMaxFiles?: number;
    /**
     * Optional pre-upload gate. Called before a file picker opens or a
     * drop is processed; if the returned promise resolves to `false`,
     * the upload attempt is abandoned. Used by the Trusted Circle
     * soft-gate.
     */
    beforeUpload?: () => Promise<boolean>;
}

/**
 * Encryption state for the uploader
 * Encryption is always mandatory via Master Key - no toggle needed.
 */
export interface EncryptionState {
    isEncrypting: boolean;
    /** Number of files currently encrypting */
    encryptingCount: number;
    /** Total files in the current batch */
    totalCount: number;
    /** Average progress across encrypting files (0-100) */
    progress: number;
}

/**
 * Upload state for the uploader
 */
export interface UploadState {
    files: UploadFile[];
    isDragging: boolean;
    isMultipartUpload: boolean;
}

/**
 * Encrypted file result from encryption process
 */
export interface EncryptedResult {
    blob: Blob;
    iv: string;
    salt: string;
    version: number;
}

/**
 * Upload configuration from server
 */
export interface UploadConfig {
    maxFileSize: number;
    multipartThreshold: number;
    multipartPartSize: number;
}

/**
 * Signature parameters attached to a signed upload.
 */
export interface SignatureParams {
    /** Ed25519 signature (Base64 encoded) */
    classicalSignature: string;
    /** ML-DSA-65 signature (Base64 encoded) */
    pqSignature: string;
    /** Signing context (domain separator) */
    signingContext: 'FILE' | 'TIMESTAMP' | 'SHARE';
    /** When the signature was created (Unix ms) */
    signedAt: number;
    /** Signer's key fingerprint */
    signerFingerprint: string;
    /** Signer's key version at signing time */
    signerKeyVersion: number;
}

/**
 * Signing state tracked by the uploader.
 */
export interface SigningState {
    /** Whether signing is enabled */
    enabled: boolean;
    /** Whether signing keys are unlocked and ready */
    keysReady: boolean;
    /** Signer's key fingerprint (if keys ready) */
    fingerprint: string | null;
    /** Signer's key version (if keys ready) */
    keyVersion: number | null;
    /** Error message if any */
    error: string | null;
}
