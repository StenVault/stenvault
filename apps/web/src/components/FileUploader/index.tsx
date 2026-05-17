/**
 * FileUploader Component
 *
 * Main orchestrator component for file uploads.
 * Composes EncryptionPanel, SigningPanel, DropZone, and UploadProgress.
 *
 * Features:
 * - Drag and drop file uploads
 * - Folder upload (click + drag-and-drop)
 * - Client-side encryption (mandatory via Master Key)
 * - Hybrid digital signatures (Ed25519 + ML-DSA-65)
 * - Single-file and multipart uploads
 * - Progress tracking
 * - File size validation
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@stenvault/shared/utils';
import { Button } from '@stenvault/shared/ui/button';
import { trpc } from '@/lib/trpc';
import { useFileUpload } from './hooks/useFileUpload';
import { useFolderUpload } from './hooks/useFolderUpload';
import { getSignByDefault } from '@/components/settings/SignatureKeysSection';
import { useSignatureKeys } from '@/hooks/useSignatureKeys';
import { EncryptionPanel } from './components/EncryptionPanel';
import { SigningPanel, type SigningState } from './components/SigningPanel';
import { DropZone } from './components/DropZone';
import { UploadProgress } from './components/UploadProgress';
import { useDuplicateDialog } from './components/DuplicateDialog';
import { UploadResumeBanner } from './components/UploadResumeBanner';
import { VaultUnlockModal } from '@/components/VaultUnlockModal';
import type { FileUploaderProps } from './types';
import type { HybridSignatureSecretKey } from '@stenvault/shared/platform/crypto';

// ===== SIGNING STATE REDUCER =====

type SigningAction =
    | { type: 'ENABLE' }
    | { type: 'DISABLE' }
    | { type: 'KEYS_READY'; secretKey: HybridSignatureSecretKey; fingerprint: string; keyVersion: number }
    | { type: 'ERROR'; error: string }
    | { type: 'CLEAR_KEYS' };

interface SigningReducerState {
    enabled: boolean;
    keysReady: boolean;
    secretKey: HybridSignatureSecretKey | null;
    fingerprint: string | null;
    keyVersion: number | null;
    error: string | null;
}

const signingInitialState: SigningReducerState = {
    enabled: false,
    keysReady: false,
    secretKey: null,
    fingerprint: null,
    keyVersion: null,
    error: null,
};

function signingReducer(state: SigningReducerState, action: SigningAction): SigningReducerState {
    switch (action.type) {
        case 'ENABLE':
            return { ...state, enabled: true };
        case 'DISABLE':
            return signingInitialState;
        case 'KEYS_READY':
            return { ...state, keysReady: true, secretKey: action.secretKey, fingerprint: action.fingerprint, keyVersion: action.keyVersion, error: null };
        case 'ERROR':
            return { ...state, error: action.error };
        case 'CLEAR_KEYS':
            return { ...state, keysReady: false, secretKey: null, fingerprint: null, keyVersion: null };
    }
}

const FOLDER_UPLOAD_PHASE_LABELS: Record<string, string> = {
    'parsing': 'Analyzing folder structure...',
    'checking-conflicts': 'Checking for conflicts...',
    'creating-folders': 'Creating folders...',
    'uploading-files': 'Uploading files...',
};

export function FileUploader({
    folderId,
    onUploadComplete,
    maxFiles = 10,
    maxSize: propMaxSize,
    className,
    folderUploadMaxFiles,
    beforeUpload,
}: FileUploaderProps) {
    // Fetch user's storage stats including their max file size limit
    const { data: storageStats } = trpc.files.getStorageStats.useQuery();

    // Priority: prop > user's personal limit > default 100MB
    const maxSize = propMaxSize ?? storageStats?.maxFileSize ?? 100 * 1024 * 1024;
    const maxSizeMB = Math.round(maxSize / 1024 / 1024);

    const effectiveFolderMaxFiles = folderUploadMaxFiles ?? storageStats?.folderUploadMaxFiles ?? 100;

    // ===== DUPLICATE DETECTION =====
    const { showDuplicateDialog, DuplicateDialogPortal } = useDuplicateDialog();

    // ===== SIGNING STATE =====
    const [signing, dispatchSigning] = useReducer(signingReducer, signingInitialState);
    const { keyInfo: sigKeyInfo } = useSignatureKeys();

    // Auto-enable signing when "sign by default" is ON and the user can sign
    // (keys exist AND plan allows). Free users skip this entirely.
    useEffect(() => {
        if (getSignByDefault() && sigKeyInfo.canSign && !signing.enabled) {
            dispatchSigning({ type: 'ENABLE' });
        }
    }, [sigKeyInfo.canSign]);

    const signingState: SigningState = useMemo(
        () => ({
            enabled: signing.enabled,
            keysReady: signing.keysReady,
            fingerprint: signing.fingerprint,
            keyVersion: signing.keyVersion,
            error: signing.error,
        }),
        [signing.enabled, signing.keysReady, signing.fingerprint, signing.keyVersion, signing.error]
    );

    // Signing context for the upload hook (only when keys are ready)
    const signingContext = useMemo(() => {
        if (!signing.enabled || !signing.keysReady || !signing.secretKey || !signing.fingerprint || !signing.keyVersion) {
            return null;
        }
        return {
            secretKey: signing.secretKey,
            fingerprint: signing.fingerprint,
            keyVersion: signing.keyVersion,
        };
    }, [signing.enabled, signing.keysReady, signing.secretKey, signing.fingerprint, signing.keyVersion]);

    // Handlers for signing state
    const handleSigningEnableChange = useCallback((enabled: boolean) => {
        dispatchSigning(enabled ? { type: 'ENABLE' } : { type: 'DISABLE' });
    }, []);

    const handleSigningKeysReady = useCallback(
        (secretKey: HybridSignatureSecretKey, fingerprint: string, keyVersion: number) => {
            dispatchSigning({ type: 'KEYS_READY', secretKey, fingerprint, keyVersion });
        },
        []
    );

    const handleSigningKeysClear = useCallback(() => {
        // Zero key bytes before discarding references
        if (signing.secretKey) {
            signing.secretKey.classical.fill(0);
            signing.secretKey.postQuantum.fill(0);
        }
        dispatchSigning({ type: 'CLEAR_KEYS' });
    }, [signing.secretKey]);

    // ===== FILE UPLOAD =====
    const {
        uploadFiles,
        isDragging,
        handleFiles,
        handleFilesToFolder,
        removeFile,
        retryFile,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        fileInputRef,
        resumableRecords,
        resumeUpload,
        dismissResumableRecord,
        vaultUnlocked,
    } = useFileUpload({
        folderId,
        maxFiles,
        maxSize,
        onUploadComplete,
        signingContext,
        showDuplicateDialog,
    });

    // Now create the folder upload hook using handleFilesToFolder
    const {
        processFolderFiles,
        processDroppedFolder,
        isFolderUploading,
        folderUploadPhase,
        folderInputRef,
        FolderConflictDialogPortal,
    } = useFolderUpload({
        folderId,
        folderUploadMaxFiles: effectiveFolderMaxFiles,
        handleFilesToFolder,
    });

    // Wire folder drop detection — detect directories before delegating to handleDrop
    const handleDropWithFolders = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        // Always reset drag state immediately (handleDrop does this too, but the folder path bypasses it)
        handleDragLeave(e);

        // Detect folder drops before awaiting any gate — the dataTransfer
        // reference stays valid but reading entries after an await can be
        // flaky across browsers, so classify first.
        let hasDirectory = false;
        if (e.dataTransfer.items) {
            for (let i = 0; i < e.dataTransfer.items.length; i++) {
                const entry = e.dataTransfer.items[i]?.webkitGetAsEntry?.();
                if (entry?.isDirectory) {
                    hasDirectory = true;
                    break;
                }
            }
        }

        const dataTransfer = e.dataTransfer;
        const droppedFiles = dataTransfer.files;
        const hasFiles = droppedFiles.length > 0;

        if (!hasDirectory && !hasFiles) return;

        if (beforeUpload && !(await beforeUpload())) return;

        if (hasDirectory) {
            await processDroppedFolder(dataTransfer);
            return;
        }

        handleFiles(droppedFiles);
    }, [processDroppedFolder, handleFiles, handleDragLeave, beforeUpload]);

    const handleClick = useCallback(async () => {
        if (beforeUpload && !(await beforeUpload())) return;
        fileInputRef.current?.click();
    }, [beforeUpload, fileInputRef]);

    const handleFolderClick = useCallback(async () => {
        if (beforeUpload && !(await beforeUpload())) return;
        folderInputRef.current?.click();
    }, [beforeUpload, folderInputRef]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
            e.target.value = ''; // Reset input
        }
    };

    const handleFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFolderFiles(e.target.files);
            e.target.value = ''; // Reset input
        }
    }, [processFolderFiles]);

    // Vault-lock gate (camada A — defesa estrutural). Renders the unlock prompt
    // in place of the dropzone so the user sees "unlock first" BEFORE the OS
    // file picker opens. Cobre paths que escapam às gates dos botões: drag-drop
    // externo, retry de uploads, URL `?action=upload`, futuros entry points.
    if (!vaultUnlocked) {
        return <UploadLockedPrompt className={className} />;
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* Encryption Panel - Always shown (encryption is mandatory) */}
            <EncryptionPanel />

            {/* Signing Panel - Always available since encryption is always on */}
            <SigningPanel
                signingState={signingState}
                onEnableChange={handleSigningEnableChange}
                onKeysReady={handleSigningKeysReady}
                onKeysClear={handleSigningKeysClear}
            />

            {isFolderUploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    {FOLDER_UPLOAD_PHASE_LABELS[folderUploadPhase] ?? 'Processing folder...'}
                </div>
            )}

            {/* Resume banner — appears when a previous upload was interrupted */}
            <UploadResumeBanner
                records={resumableRecords}
                onResume={resumeUpload}
                onDismiss={dismissResumableRecord}
                vaultUnlocked={vaultUnlocked}
            />

            {/* Drop Zone */}
            <DropZone
                ref={fileInputRef}
                isDragging={isDragging}
                maxFiles={maxFiles}
                maxSizeMB={maxSizeMB}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropWithFolders}
                onClick={handleClick}
                onFileChange={handleFileChange}
                onFolderClick={handleFolderClick}
                onFolderChange={handleFolderChange}
                folderInputRef={folderInputRef}
            />

            {/* Upload Progress List */}
            <UploadProgress
                files={uploadFiles}
                onRemove={removeFile}
                onRetry={retryFile}
            />

            {/* Duplicate Detection Dialog */}
            <DuplicateDialogPortal />

            {/* Folder Conflict Dialog */}
            <FolderConflictDialogPortal />
        </div>
    );
}

/**
 * Rendered in place of the dropzone when the vault is locked. Hosts its own
 * VaultUnlockModal so users can unlock without leaving the upload flow —
 * once unlocked, FileUploader re-renders with the dropzone.
 */
function UploadLockedPrompt({ className }: { className?: string }) {
    const [unlockOpen, setUnlockOpen] = useState(false);
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center',
                className,
            )}
        >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--theme-glow,rgba(0,0,0,0.05))]">
                <Lock className="h-6 w-6 text-[var(--theme-primary,currentColor)]" />
            </div>
            <h3 className="text-base font-medium">Vault is locked</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
                Unlock your vault to upload files. Your encryption key never leaves the browser.
            </p>
            <Button onClick={() => setUnlockOpen(true)} className="mt-1">
                Unlock vault
            </Button>
            <VaultUnlockModal
                isOpen={unlockOpen}
                onUnlock={() => setUnlockOpen(false)}
                onClose={() => setUnlockOpen(false)}
            />
        </div>
    );
}

// Re-export types for convenience
export type { FileUploaderProps, UploadFile } from './types';
