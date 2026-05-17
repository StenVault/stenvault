import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useAuth } from '@/_core/hooks/useAuth';
import { isImageFile } from '../../utils/mime-types';
import { useOperationStore } from '@/stores/operationStore';
import { processUpload } from './uploadPipeline';
import { performMultipartUploadFlow } from './multipartUpload';
import { encryptFileV4 } from '@/lib/fileEncryptor';
import {
    deleteUploadResumeRecord,
    listUploadResumeRecords,
    cleanupExpiredUploadResumeRecords,
    unwrapResumeSeed,
    type VaultUploadResumeRecordView,
} from '@/lib/uploadResume';
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
    const { isUnlocked, isConfigured, deriveFilenameKey, deriveFingerprintKey, deriveThumbnailKey, getHybridPublicKey, getCachedKey } = useMasterKey();
    const useMasterKeyEncryption = isConfigured && isUnlocked;

    // ===== AUTH (for resume-record AAD binding) =====
    const { user } = useAuth();

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

    // queryMultipartStatus is a .query, fetched on demand via the utils
    // helper rather than wired through useQuery (we only call it on resume,
    // not on every render).
    const queryMultipartStatus = useCallback(
        async (input: { fileId: number; uploadId: string; fileKey: string }) => {
            return trpcUtils.files.queryMultipartStatus.fetch(input);
        },
        [trpcUtils],
    );

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

        // Drop any IndexedDB resume record for this upload — user cancelled
        // so the in-flight state is no longer recoverable.
        void deleteUploadResumeRecord(info.serverFileId);

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
        // The pipeline's Stage 2 check enforces this too; resolve here so the
        // multipart branch always has a master HKDF key for resume-record wrap.
        const bundle = getCachedKey();
        if (!user?.id || !bundle) {
            toast.error('Vault is locked. Please unlock to upload.');
            return;
        }
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
            queryMultipartStatus,
            getThumbnailUploadUrl,
            trpcUtils,
            deriveFilenameKey,
            deriveFingerprintKey,
            deriveThumbnailKey,
            getHybridPublicKey,
            hkdfKey: bundle.hkdf,
            userId: user.id,
            showDuplicateDialog,
            cleanupServerUpload,
        }, targetFolderId);
    }, [maxSize, multipartConfig, folderId, getUploadUrl, confirmUpload, cleanupServerUpload, initiateMultipart, getPartUrl, completeMultipart, abortMultipart, queryMultipartStatus, signingContext, useMasterKeyEncryption, deriveFilenameKey, deriveFingerprintKey, getHybridPublicKey, deriveThumbnailKey, getThumbnailUploadUrl, trpcUtils, showDuplicateDialog, checkDuplicate, getCachedKey, user?.id]);

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

        // Resume fast-path: a previously failed multipart left a closure on
        // serverInfoRef. Invoking it skips parts already in R2 and finishes
        // the upload without re-encrypting from scratch.
        const info = serverInfoRef.current.get(id);
        if (info?.resume) {
            const resume = info.resume;
            setUploadFiles((prev) =>
                prev.map((f) => f.id === id ? { ...f, status: 'uploading', progress: f.progress, error: undefined } : f)
            );
            acquireHeartbeat();
            resume()
                .catch((err) => {
                    debugWarn('[upload]', 'Resume failed, leaving error state for next retry', err);
                    const message = err instanceof Error ? err.message : 'Resume failed';
                    setUploadFiles((prev) =>
                        prev.map((f) => f.id === id ? { ...f, status: 'error', error: message } : f)
                    );
                })
                .finally(() => releaseHeartbeat());
            return;
        }

        setUploadFiles((prev) =>
            prev.map((f) => f.id === id ? { ...f, status: 'pending', progress: 0, error: undefined } : f)
        );
        acquireHeartbeat();
        processUploadCallback({ ...fileToRetry, status: 'pending', progress: 0, error: undefined })
            .finally(() => releaseHeartbeat());
    }, [processUploadCallback, acquireHeartbeat, releaseHeartbeat]);

    // ===== RESUMABLE UPLOADS (cross-session) =====
    const [resumableRecords, setResumableRecords] = useState<VaultUploadResumeRecordView[]>([]);

    // Load live records on mount + sweep expired so banners don't linger.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            await cleanupExpiredUploadResumeRecords();
            const records = await listUploadResumeRecords();
            if (!cancelled) setResumableRecords(records);
        })();
        return () => { cancelled = true; };
    }, []);

    const refreshResumableRecords = useCallback(async () => {
        const records = await listUploadResumeRecords();
        setResumableRecords(records);
    }, []);

    const dismissResumableRecord = useCallback(async (serverFileId: number) => {
        await deleteUploadResumeRecord(serverFileId);
        // Also abort the R2 multipart so storage doesn't leak waiting for the cron
        const record = resumableRecords.find(r => r.serverFileId === serverFileId);
        if (record) {
            abortMultipart.mutateAsync({
                fileId: record.serverFileId,
                uploadId: record.multipartUploadId,
                fileKey: record.serverFileKey,
            }).catch((err) => debugWarn('[upload]', 'dismiss: failed to abort multipart', err));
        }
        setResumableRecords(prev => prev.filter(r => r.serverFileId !== serverFileId));
    }, [resumableRecords, abortMultipart]);

    /**
     * Resume a previously-failed multipart upload from a stored record, given
     * a freshly-picked File (browser File objects don't survive a reload).
     *
     * The picked file must match the original by name + size + lastModified.
     * The fileKey lives in IndexedDB as ciphertext; we unwrap it here using
     * the master HKDF key (vault must be unlocked) and reconstruct the seed.
     * Re-encrypting with that seed produces byte-identical chunks; R2 accepts
     * them alongside the parts already there.
     */
    const resumeUpload = useCallback(async (record: VaultUploadResumeRecordView, file: File): Promise<void> => {
        // Single gate: unwrapResumeSeed needs the master HKDF key + userId,
        // both of which are only available when the vault is unlocked. The
        // bundle/user.id null branches should never fire when
        // useMasterKeyEncryption is true, but TS narrowing wants them.
        const bundle = getCachedKey();
        if (!useMasterKeyEncryption || !bundle || !user?.id) {
            toast.error('Unlock your vault first to resume the upload');
            return;
        }
        if (file.size !== record.file.size) {
            toast.error(`File size doesn't match — expected ${record.file.size} bytes, got ${file.size}`);
            return;
        }
        if (file.name !== record.file.name) {
            toast.error('Filename doesn\'t match the original — pick the same file');
            return;
        }
        if (file.lastModified !== record.file.lastModified) {
            toast.error('File appears to have changed since the upload started');
            return;
        }

        // Unwrap the persisted seed. Failure here means the master key was
        // rotated (password reset) or the record was tampered with — drop it
        // so the user starts fresh next time.
        let seed: Awaited<ReturnType<typeof unwrapResumeSeed>>;
        try {
            seed = await unwrapResumeSeed(record.serverFileId, bundle.hkdf, user.id);
        } catch (unwrapErr) {
            debugWarn('[upload]', 'Resume seed unwrap failed — record removed', unwrapErr);
            await deleteUploadResumeRecord(record.serverFileId);
            await refreshResumableRecords();
            toast.error('Couldn\'t unlock the saved upload state — record removed. Please start the upload again.');
            return;
        }
        if (!seed) {
            await refreshResumableRecords();
            toast.error('That resume record has expired. Please start the upload again.');
            return;
        }

        const id = `resume-${record.serverFileId}-${Date.now()}`;

        setUploadFiles(prev => [...prev, {
            id,
            file,
            progress: 0,
            status: 'encrypting',
        } as UploadFile]);

        serverInfoRef.current.set(id, {
            serverFileId: record.serverFileId,
            serverFileKey: record.serverFileKey,
            multipartUploadId: record.multipartUploadId,
        });

        // Optimistically remove from the banner list while the resume runs;
        // restored on failure via the dependency on resumableRecords.
        setResumableRecords(prev => prev.filter(r => r.serverFileId !== record.serverFileId));

        acquireHeartbeat();
        setIsMultipartUpload(true);
        try {
            const publicKey = await getHybridPublicKey();
            const hybridResult = await encryptFileV4(file, publicKey, {
                resumeSeed: seed,
                onProgress: (p) => {
                    setUploadFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p.percentage } : f));
                },
            });

            setUploadFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'uploading', progress: 0 } : f));

            const signatureParams = hybridResult.signatureMetadata
                ? {
                    classicalSignature: hybridResult.signatureMetadata.classicalSignature,
                    pqSignature: hybridResult.signatureMetadata.pqSignature,
                    signingContext: hybridResult.signatureMetadata.signingContext,
                    signedAt: hybridResult.signatureMetadata.signedAt,
                    signerFingerprint: hybridResult.signatureMetadata.signerFingerprint,
                    signerKeyVersion: hybridResult.signatureMetadata.signerKeyVersion,
                }
                : undefined;

            await performMultipartUploadFlow({
                id,
                file,
                uploadBlob: hybridResult.blob,
                uploadSize: hybridResult.blob.size,
                encryptedResult: {
                    blob: hybridResult.blob,
                    iv: hybridResult.metadata.iv,
                    salt: '',
                    version: 4,
                },
                signatureParams,
                rawThumbnailBlob: null,
                serverFileId: record.serverFileId,
                multipartParams: {
                    uploadId: record.multipartUploadId,
                    fileKey: record.serverFileKey,
                    partSize: record.partSize,
                    totalParts: record.totalParts,
                },
                encryptionSeed: seed,
                folderId: record.folderId,
                setIsMultipartUpload,
                setUploadFiles,
                getPartUrl,
                completeMultipart,
                abortMultipart,
                queryMultipartStatus,
                getThumbnailUploadUrl,
                deriveThumbnailKey,
                contentHash: record.contentHash,
                serverInfoRef,
                hkdfKey: bundle.hkdf,
                userId: user.id,
            });

            // Successful — refresh list (record was already deleted by the flow on success)
            await refreshResumableRecords();
            serverInfoRef.current.delete(id);
            trpcUtils.files.list.invalidate();
            trpcUtils.files.getStorageStats.invalidate();
        } catch (err) {
            debugWarn('[upload]', 'Resume failed', err);
            const message = err instanceof Error ? err.message : 'Resume failed';
            setUploadFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: message } : f));
            toast.error(`Couldn't resume ${file.name}`);
            // Restore the banner — the record may still be valid for another try
            await refreshResumableRecords();
        } finally {
            setIsMultipartUpload(false);
            releaseHeartbeat();
        }
    }, [
        useMasterKeyEncryption,
        getCachedKey,
        user?.id,
        getHybridPublicKey,
        getPartUrl,
        completeMultipart,
        abortMultipart,
        queryMultipartStatus,
        getThumbnailUploadUrl,
        deriveThumbnailKey,
        trpcUtils,
        acquireHeartbeat,
        releaseHeartbeat,
        refreshResumableRecords,
    ]);

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
        // Cross-session resume
        resumableRecords,
        resumeUpload,
        dismissResumableRecord,
        vaultUnlocked: useMasterKeyEncryption,
    };
}
