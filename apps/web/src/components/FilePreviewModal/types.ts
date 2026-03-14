/**
 * FilePreviewModal Types
 * 
 * Centralized type definitions for the FilePreviewModal module.
 */

import { type PreviewableFile } from '@/components/files/types';
import { type FileTypeNoFolder } from '@cloudvault/shared';

/**
 * Props for the FilePreviewModal component
 */
export interface FilePreviewModalProps {
    file: PreviewableFile | null;
    open: boolean;
    onClose: () => void;
    /** When 'download', auto-triggers download after decryption and closes the modal */
    mode?: 'preview' | 'download';
}

/**
 * Media player state
 */
export interface MediaState {
    isPlaying: boolean;
    isMuted: boolean;
    volume: number;
    currentTime: number;
    duration: number;
    isFullscreen: boolean;
    error: string | null;
}

/**
 * Image viewer state
 */
export interface ImageState {
    zoom: number;
    rotation: number;
    error: string | null;
}

/**
 * Decryption state
 */
export interface DecryptionState {
    isDecrypting: boolean;
    progress: number;
    error: string | null;
    decryptedBlobUrl: string | null;
}

/**
 * Encryption metadata from API
 */
export interface EncryptionMetadata {
    iv?: string;
    salt?: string;
    version?: number;
}

/**
 * Signature info from API (Phase 3.4 Sovereign)
 */
export interface SignatureInfo {
    signerId: number;
    signerFingerprint: string | null;
    signerKeyVersion: number;
    signedAt: Date | string;
    signingContext: 'FILE' | 'TIMESTAMP' | 'SHARE';
}

/**
 * Signature verification state (Phase 3.4 Sovereign)
 */
export interface SignatureVerificationState {
    /** Whether the file has a signature */
    hasSignature: boolean;
    /** Whether verification is in progress */
    isVerifying: boolean;
    /** Verification result */
    result: {
        valid: boolean;
        classicalValid: boolean;
        postQuantumValid: boolean;
        error?: string;
    } | null;
    /** Signer info */
    signerInfo: SignatureInfo | null;
    /** Whether AES-GCM decryption confirmed content integrity */
    decryptionVerified: boolean;
}

/**
 * File type for preview categorization
 * Uses shared FileTypeNoFolder for consistency across the codebase
 */
export type FileType = FileTypeNoFolder;

// Re-export PreviewableFile for convenience
export type { PreviewableFile };
