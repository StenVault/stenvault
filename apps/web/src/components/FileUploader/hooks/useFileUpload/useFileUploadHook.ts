import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import { useMasterKey } from '@/hooks/useMasterKey';
import { isImageFile } from '../../utils/mime-types';
import { useOperationStore } from '@/stores/operationStore';
import { processUpload } from './uploadPipeline';
import type { UploadFile } from '../../types';
import type { ServerUploadInfo, UseFileUploadParams, UseFileUploadReturn } from './types';

export function useFileUpload({
    folderId,
    maxFiles,
    maxSize,
    onUploadComplete,
    signingContext,
    showDuplicateDialog,
}: UseFileUploadParams): UseFileUploadReturn {
    // ===== UPLOAD STATE =====
    const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isMultipartUpload, setIsMultipartUpload] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ===== MASTER KEY =====
    const { isUnlocked, isConfigured, deriveFilenameKey, deriveFingerprintKey, deriveThumbnailKey, getHybridPublicKey } = useMasterKey();
    const useMasterKeyEncryption = isConfigured && isUnlocked;

    // ===== TRPC =====
    const trpcUtils = trpc.useUtils();
    const { data: multipartConfig } = trpc.files.getMultipartConfig.useQuery();
    const getUploadUrl = trpc.files.getUploadUrl.useMutation();
    const checkDuplicate = trpc.files.checkDuplicate.useMutation();
    const confirmUpload = trpc.files.confirmUpload.useMutation({
        onSuccess: () => {
            trpcUtils.files.list.invalidate();
            trpcUtils.files.getStorageStats.invalidate();
        },
    });
    const cancelUpload = trpc.files.cancelUpload.useMutation({
        onSuccess: () => {
            trpcUtils.files.list.invalidate();
            trpcUtils.files.getStorageStats.invalidate();
        },
    });
    const getThumbnailUploadUrl = trpc.files.getThumbnailUploadUrl.useMutation();
    const initiateMultipart = trpc.files.initiateMultipartUpload.useMutation();
    const getPartUrl = trpc.files.getUploadPartUrl.useMutation();
    const completeMultipart = trpc.files.completeMultipartUpload.useMutation({
        onSuccess: () => {
            trpcUtils.files.list.invalidate();
            trpcUtils.files.getStorageStats.invalidate();
        },
    });
    const abortMultipart = trpc.files.abortMultipartUpload.useMutation();
    const heartbeatMutation = trpc.auth.heartbeat.useMutation();

    // ===== SERVER INFO REF =====
    const serverInfoRef = useRef<Map<string, ServerUploadInfo>>(new Map());

    // ===== CLEANUP PREVIEWS ON UNMOUNT =====
    const uploadFilesRef = useRef<UploadFile[]>([]);
    uploadFilesRef.current = uploadFiles;
    useEffect(() => {
        return () => {
            uploadFilesRef.current.forEach(f => {
                if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
            });
        };
    }, []);

    // ===== HEARTBEAT (keep server session alive during long uploads) =====
    // Multipart uploads PUT directly to R2; the gap between authenticated
    // tRPC calls can exceed `users.inactivityTimeoutMinutes` and the server
    // will mark the session inactive. A 20s no-op mutation extends the
    // session via the existing `getAuthFromSession` touch path. Ref-counted
    // so concurrent batches share one timer; cleared on unmount.
    const heartbeatMutateRef = useRef(heartbeatMutation.mutateAsync);
    heartbeatMutateRef.current = heartbeatMutation.mutateAsync;
    const heartbeatRef = useRef<{ count: number; intervalId: ReturnType<typeof setInterval> | null }>({
        count: 0,
        intervalId: null,
    });
    const acquireHeartbeat = useCallback(() => {
        heartbeatRef.current.count++;
        if (heartbeatRef.current.count === 1 && heartbeatRef.current.intervalId === null) {
            heartbeatRef.current.intervalId = setInterval(() => {
                heartbeatMutateRef.current().catch(() => {});
            }, 20_000);
        }
    }, []);
    const releaseHeartbeat = useCallback(() => {
        heartbeatRef.current.count = Math.max(0, heartbeatRef.current.count - 1);
        if (heartbeatRef.current.count === 0 && heartbeatRef.current.intervalId !== null) {
            clearInterval(heartbeatRef.current.intervalId);
            heartbeatRef.current.intervalId = null;
        }
    }, []);
    useEffect(() => {
        const ref = heartbeatRef.current;
        return () => {
            if (ref.intervalId !== null) {
                clearInterval(ref.intervalId);
                ref.intervalId = null;
            }
            // Reset counter so a remount (StrictMode dev double-mount, route
            // re-entry) starts fresh. Without this, lingering count > 0 makes
            // the next acquireHeartbeat() skip creating a new interval.
            ref.count = 0;
        };
    }, []);

    // ===== CLEANUP SERVER UPLOAD =====
    const cleanupServerUpload = useCallback((uploadId: string) => {
        const info = serverInfoRef.current.get(uploadId);
        if (!info) return;

        serverInfoRef.current.delete(uploadId);

        if (info.multipartUploadId && info.serverFileKey) {
            abortMultipart.mutateAsync({
                fileId: info.serverFileId,
                uploadId: info.multipartUploadId,
                fileKey: info.serverFileKey,
            }).catch((err) => {
                debugWarn('[upload]', 'Failed to abort multipart on cancel', err);
                cancelUpload.mutateAsync({ fileId: info.serverFileId }).catch(() => {});
            });
        } else {
            cancelUpload.mutateAsync({ fileId: info.serverFileId }).catch((err) => {
                debugWarn('[upload]', 'Failed to cancel upload on server', err);
            });
        }
    }, [abortMultipart, cancelUpload]);

    // ===== PROCESS SINGLE UPLOAD (delegates to pipeline) =====
    const processUploadCallback = useCallback(async (uploadFile: UploadFile, targetFolderId?: number | null) => {
        return processUpload(uploadFile, {
            maxSize,
            folderId,
            useMasterKeyEncryption,
            multipartThreshold: multipartConfig?.threshold ?? 500 * 1024 * 1024,
            signingContext,
            setUploadFiles,
            setIsMultipartUpload,
            serverInfoRef,
            getUploadUrl,
            checkDuplicate,
            confirmUpload,
            initiateMultipart,
            getPartUrl,
            completeMultipart,
            abortMultipart,
            getThumbnailUploadUrl,
            trpcUtils,
            deriveFilenameKey,
            deriveFingerprintKey,
            deriveThumbnailKey,
            getHybridPublicKey,
            showDuplicateDialog,
            cleanupServerUpload,
        }, targetFolderId);
    }, [maxSize, multipartConfig, folderId, getUploadUrl, confirmUpload, cleanupServerUpload, initiateMultipart, getPartUrl, completeMultipart, abortMultipart, signingContext, useMasterKeyEncryption, deriveFilenameKey, deriveFingerprintKey, getHybridPublicKey, deriveThumbnailKey, getThumbnailUploadUrl, trpcUtils, showDuplicateDialog, checkDuplicate]);

    // ===== HANDLE FILES DROP/SELECT =====
    const handleFiles = useCallback(async (fileList: FileList) => {
        const files = Array.from(fileList);

        debugLog('[dir]', 'handleFiles called', {
            fileCount: files.length,
            files: files.map(f => ({ name: f.name, size: f.size, sizeMB: Math.round(f.size / 1024 / 1024) })),
            maxSize,
            maxSizeMB: Math.round(maxSize / 1024 / 1024),
        });

        if (files.length > maxFiles) {
            toast.error(`Maximum ${maxFiles} files allowed at once`);
            return;
        }

        const newUploadFiles: UploadFile[] = files.map((file) => {
            const previewUrl = isImageFile(file)
                ? URL.createObjectURL(file)
                : undefined;

            return {
                id: crypto.randomUUID(),
                file,
                progress: 0,
                status: 'pending' as const,
                previewUrl,
            };
        });

        setUploadFiles((prev) => [...prev, ...newUploadFiles]);

        acquireHeartbeat();
        try {
            const CONCURRENCY = 3;
            for (let i = 0; i < newUploadFiles.length; i += CONCURRENCY) {
                const batch = newUploadFiles.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(f => processUploadCallback(f)));
            }

            onUploadComplete?.();
        } finally {
            releaseHeartbeat();
        }
    }, [maxFiles, maxSize, onUploadComplete, processUploadCallback, acquireHeartbeat, releaseHeartbeat]);

    // ===== HANDLE FILES TO SPECIFIC FOLDER =====
    const handleFilesToFolder = useCallback(async (files: File[], targetFolderId: number | null) => {
        const newUploadFiles: UploadFile[] = files.map((file) => {
            const displayName = file.name.includes('/') ? file.name.split('/').pop()! : file.name;
            const displayFile = new File([file], displayName, { type: file.type, lastModified: file.lastModified });
            const previewUrl = isImageFile(displayFile) ? URL.createObjectURL(displayFile) : undefined;
            return {
                id: crypto.randomUUID(),
                file: displayFile,
                progress: 0,
                status: 'pending' as const,
                previewUrl,
            };
        });

        setUploadFiles((prev) => [...prev, ...newUploadFiles]);

        acquireHeartbeat();
        try {
            const CONCURRENCY = 3;
            for (let i = 0; i < newUploadFiles.length; i += CONCURRENCY) {
                const batch = newUploadFiles.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(f => processUploadCallback(f, targetFolderId)));
            }
        } finally {
            releaseHeartbeat();
        }
    }, [processUploadCallback, acquireHeartbeat, releaseHeartbeat]);

    // ===== REMOVE FILE =====
    const removeFile = useCallback((id: string) => {
        useOperationStore.getState().cancelOperation(id);

        setUploadFiles((prev) => {
            const fileToRemove = prev.find(f => f.id === id);
            if (fileToRemove?.previewUrl) {
                URL.revokeObjectURL(fileToRemove.previewUrl);
            }
            if (fileToRemove && fileToRemove.status !== 'completed') {
                cleanupServerUpload(id);
            }
            return prev.filter((f) => f.id !== id);
        });
    }, [cleanupServerUpload]);

    // ===== RETRY FILE =====
    const retryFile = useCallback((id: string) => {
        const fileToRetry = uploadFilesRef.current.find(f => f.id === id && f.status === 'error');
        if (!fileToRetry) return;

        setUploadFiles((prev) =>
            prev.map((f) => f.id === id ? { ...f, status: 'pending', progress: 0, error: undefined } : f)
        );
        acquireHeartbeat();
        processUploadCallback({ ...fileToRetry, status: 'pending', progress: 0, error: undefined })
            .finally(() => releaseHeartbeat());
    }, [processUploadCallback, acquireHeartbeat, releaseHeartbeat]);

    // ===== DRAG HANDLERS =====
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    }, [handleFiles]);

    return {
        uploadFiles,
        isDragging,
        encryptionState: (() => {
            const encrypting = uploadFiles.filter(f => f.status === 'encrypting');
            const avgProgress = encrypting.length > 0
                ? Math.round(encrypting.reduce((sum, f) => sum + f.progress, 0) / encrypting.length)
                : 0;
            return {
                isEncrypting: encrypting.length > 0,
                encryptingCount: encrypting.length,
                totalCount: uploadFiles.length,
                progress: avgProgress,
            };
        })(),
        isMultipartUpload,
        handleFiles,
        handleFilesToFolder,
        removeFile,
        retryFile,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        fileInputRef,
    };
}
