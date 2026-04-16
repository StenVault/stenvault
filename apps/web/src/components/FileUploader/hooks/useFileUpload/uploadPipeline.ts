import { toast } from 'sonner';
import { debugLog, debugWarn, debugError, devWarn } from '@/lib/debugLogger';
import { encryptFilename, decryptFilename } from '@/lib/fileCrypto';
import { encryptFileV4 } from '@/lib/fileEncryptor';
import { computeStreamingFingerprint } from '@/lib/contentFingerprint';
import { shouldUseMultipart } from '@/lib/multipartUpload';
import { generateThumbnail, isThumbnailSupported } from '@/lib/thumbnailGenerator';
import { getMimeType } from '../../utils/mime-types';
import { useOperationStore } from '@/stores/operationStore';
import { STREAMING } from '@/lib/constants';
import { performSingleUpload } from './singleUpload';
import { performMultipartUploadFlow } from './multipartUpload';
import type { UploadFile, EncryptedResult, SignatureParams, UploadPipelineDeps } from './types';

/**
 * Core upload pipeline — 10-stage sequential process.
 * Extracted from the useFileUpload hook's processUpload callback.
 * All dependencies are injected via `deps` (no closure capture).
 */
export async function processUpload(
    uploadFile: UploadFile,
    deps: UploadPipelineDeps,
    targetFolderId?: number | null,
): Promise<void> {
    const effectiveFolderId = targetFolderId !== undefined ? targetFolderId : deps.folderId;
    const { file, id } = uploadFile;

    const abortController = new AbortController();
    const { signal } = abortController;

    // Stage 1: Validate file size
    if (file.size > deps.maxSize) {
        const errorMsg = `File too large: ${file.name} is ${Math.round(file.size / 1024 / 1024)}MB but max is ${Math.round(deps.maxSize / 1024 / 1024)}MB`;
        debugWarn('[warn]', 'Size validation failed: ' + errorMsg);
        toast.error(errorMsg);
        deps.setUploadFiles((prev) =>
            prev.map((f) =>
                f.id === id
                    ? { ...f, status: 'error', error: `File too large (max ${Math.round(deps.maxSize / 1024 / 1024)}MB)` }
                    : f
            )
        );
        return;
    }

    // Stage 2: Vault lock check
    if (!deps.useMasterKeyEncryption) {
        deps.setUploadFiles((prev) =>
            prev.map((f) =>
                f.id === id
                    ? { ...f, status: 'error', error: 'Vault is locked. Please unlock your vault to upload files.' }
                    : f
            )
        );
        toast.error('Vault is locked. Please unlock your vault to upload files.');
        return;
    }

    let encryptedFilenameData: { encryptedFilename: string; filenameIv: string; plaintextExtension: string } | null = null;

    const opId = useOperationStore.getState().addOperation({ id, type: 'upload', filename: file.name, status: 'encrypting', abortController });

    try {
        devWarn('[Upload] Starting upload pipeline for:', file.name, file.size, 'bytes');

        deps.setUploadFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: 'encrypting' } : f))
        );

        const contentType = getMimeType(file);

        // Stage 3a: Org vault unlock (if applicable)
        const uploadOrgId = deps.currentOrgId;
        let orgKeyVer: number | undefined;
        if (uploadOrgId) {
            await deps.unlockOrgVault(uploadOrgId);
            orgKeyVer = deps.getOrgKeyVersion(uploadOrgId) ?? undefined;
            debugLog('[org]', 'Uploading to org vault', { orgId: uploadOrgId, keyVersion: orgKeyVer });
        }

        // Stage 3b: Encrypt filename (zero-knowledge)
        try {
            const filenameKey = uploadOrgId
                ? await deps.deriveOrgFilenameKey(uploadOrgId)
                : await deps.deriveFilenameKey();
            const { encryptedFilename, iv: filenameIv } = await encryptFilename(file.name, filenameKey);
            const parts = file.name.split('.');
            const extension = parts.length > 1 ? `.${parts.pop()}` : '';

            encryptedFilenameData = {
                encryptedFilename,
                filenameIv,
                plaintextExtension: extension,
            };

            debugLog('[crypto]', 'Filename encrypted', { hasEncrypted: true, extension });
        } catch (filenameErr) {
            toast.error("Failed to encrypt filename. Upload cancelled.");
            throw filenameErr;
        }

        const opaqueFilename = `encrypted${encryptedFilenameData?.plaintextExtension || ''}`;

        // Stage 4: Duplicate detection
        let contentHash: string | undefined;
        if (deps.showDuplicateDialog && !uploadOrgId) {
            try {
                const fpKey = await deps.deriveFingerprintKey();
                contentHash = await computeStreamingFingerprint(file, fpKey);

                const dupResult = await deps.checkDuplicate.mutateAsync({
                    contentHash,
                    size: file.size,
                    folderId: effectiveFolderId ?? undefined,
                });

                if (dupResult.isDuplicate) {
                    let existingName = '[Encrypted]';
                    if (dupResult.existingEncryptedFilename && dupResult.existingFilenameIv) {
                        try {
                            const fnKey = await deps.deriveFilenameKey();
                            existingName = await decryptFilename(
                                dupResult.existingEncryptedFilename,
                                fnKey,
                                dupResult.existingFilenameIv,
                            );
                        } catch {
                            // Decryption failed — use fallback
                        }
                    }

                    const action = await deps.showDuplicateDialog({
                        newFileName: file.name,
                        newFileSize: file.size,
                        existingFileName: existingName,
                        existingSize: dupResult.existingSize ?? file.size,
                        existingFolderId: dupResult.existingFolderId ?? null,
                        existingCreatedAt: new Date(dupResult.existingCreatedAt ?? Date.now()),
                    });

                    if (action === 'skip') {
                        deps.setUploadFiles((prev) =>
                            prev.map((f) =>
                                f.id === id ? { ...f, status: 'completed', progress: 100 } : f
                            )
                        );
                        debugLog('[fingerprint]', 'Duplicate skipped by user', { contentHash });
                        return;
                    }
                }
            } catch (fpError) {
                debugWarn('[fingerprint]', 'Fingerprint/dedup check failed (non-fatal), proceeding with upload', fpError);
            }
        }

        // Stage 5: Estimate encrypted size
        const isStreaming = file.size >= STREAMING.THRESHOLD_BYTES;
        const chunkOverhead = isStreaming
            ? Math.ceil(file.size / 65536) * 20
            : 0;
        const estimatedEncryptedSize = file.size + 6000 + chunkOverhead;

        // Stage 6: Fetch hybrid public key
        devWarn('[Upload] Fetching hybrid public key...');
        let hybridPublicKey: import('@stenvault/shared/platform/crypto').HybridPublicKey;
        if (uploadOrgId) {
            const orgPubKeyData = await deps.trpcUtils.orgKeys.getOrgHybridPublicKey.fetch({ organizationId: uploadOrgId });
            const { toHybridPublicKey } = await import('@/lib/orgHybridCrypto');
            hybridPublicKey = toHybridPublicKey(orgPubKeyData);
        } else {
            hybridPublicKey = await deps.getHybridPublicKey();
        }
        devWarn('[Upload] Hybrid public key obtained', {
            classical: hybridPublicKey.classical.length,
            pq: hybridPublicKey.postQuantum.length,
        });

        // Stage 7: Acquire server slot (file ID)
        const useMultipart = shouldUseMultipart(estimatedEncryptedSize, deps.multipartThreshold);

        let serverFileId: number;
        let serverCreatedAt: Date;
        let uploadUrl: string | undefined;
        let multipartParams: { uploadId: string; fileKey: string; partSize: number; totalParts: number } | undefined;

        const uploadContentType = 'application/octet-stream';

        if (useMultipart) {
            const result = await deps.initiateMultipart.mutateAsync({
                filename: opaqueFilename,
                contentType: uploadContentType,
                size: estimatedEncryptedSize,
                folderId: effectiveFolderId,
                organizationId: uploadOrgId,
                encryptedFilename: encryptedFilenameData?.encryptedFilename,
                filenameIv: encryptedFilenameData?.filenameIv,
                plaintextExtension: encryptedFilenameData?.plaintextExtension,
                originalMimeType: file.type || undefined,
            });
            serverFileId = result.fileId;
            serverCreatedAt = new Date(result.createdAt);
            multipartParams = {
                uploadId: result.uploadId,
                fileKey: result.fileKey,
                partSize: result.partSize,
                totalParts: result.totalParts,
            };
        } else {
            const result = await deps.getUploadUrl.mutateAsync({
                filename: opaqueFilename,
                contentType: uploadContentType,
                size: estimatedEncryptedSize,
                folderId: effectiveFolderId,
                organizationId: uploadOrgId,
                encryptedFilename: encryptedFilenameData?.encryptedFilename,
                filenameIv: encryptedFilenameData?.filenameIv,
                plaintextExtension: encryptedFilenameData?.plaintextExtension,
                originalMimeType: file.type || undefined,
            });
            serverFileId = result.fileId;
            serverCreatedAt = new Date(result.createdAt);
            uploadUrl = result.uploadUrl;
        }

        // Track server info for cleanup on cancel
        deps.serverInfoRef.current.set(id, {
            serverFileId,
            serverFileKey: useMultipart ? multipartParams?.fileKey : undefined,
            multipartUploadId: useMultipart ? multipartParams?.uploadId : undefined,
        });

        debugLog('[upload]', 'Got fileId from server BEFORE encryption', {
            fileId: serverFileId,
            createdAt: serverCreatedAt.toISOString(),
            useMultipart,
        });

        // Stage 8: Client-side encryption (V4 hybrid)
        let encryptedResult: EncryptedResult | null = null;
        let uploadBlob: Blob = file;
        let uploadSize = file.size;

        deps.setUploadFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'encrypting', progress: 0 } : f));

        let hybridResult: Awaited<ReturnType<typeof encryptFileV4>> | null = null;

        try {
            devWarn('[Upload] Starting V4 encryption, fileId:', serverFileId, 'size:', file.size);

            hybridResult = await encryptFileV4(file, hybridPublicKey, {
                signal,
                signing: deps.signingContext ? {
                    secretKey: deps.signingContext.secretKey,
                    fingerprint: deps.signingContext.fingerprint,
                    keyVersion: deps.signingContext.keyVersion,
                } : undefined,
                onProgress: (p) => {
                    deps.setUploadFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p.percentage } : f));
                    useOperationStore.getState().updateProgress(opId, { status: 'encrypting', progress: p.percentage });
                },
            });

            uploadBlob = hybridResult.blob;
            uploadSize = hybridResult.blob.size;

            encryptedResult = {
                blob: hybridResult.blob,
                iv: hybridResult.metadata.iv,
                salt: '',
                version: 4,
            };

            debugLog('[crypto]', 'Hybrid encryption complete', {
                originalSize: file.size,
                encryptedSize: uploadSize,
                version: 4,
                algorithm: hybridResult.metadata.pqcParams?.kemAlgorithm,
            });
        } catch (encryptError) {
            devWarn('[Upload] Encryption FAILED:', encryptError);
            deps.setUploadFiles((prev) =>
                prev.map((f) =>
                    f.id === id
                        ? { ...f, status: 'error', error: 'Encryption failed. Please try again.' }
                        : f
                )
            );
            useOperationStore.getState().failOperation(opId, 'Encryption failed');
            deps.cleanupServerUpload(id);
            return;
        }

        // Transition to uploading
        deps.setUploadFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'uploading', progress: 0 } : f));
        useOperationStore.getState().updateProgress(opId, { status: 'uploading', progress: 0 });

        // Stage 9a: Generate thumbnail
        let rawThumbnailBlob: Blob | null = null;

        if (isThumbnailSupported(contentType)) {
            try {
                debugLog('[thumb]', 'Generating thumbnail client-side', { mimeType: contentType });
                const thumbnailResult = await generateThumbnail(file);
                if (thumbnailResult) {
                    rawThumbnailBlob = thumbnailResult.blob;
                    debugLog('[thumb]', 'Thumbnail generated', {
                        size: thumbnailResult.size,
                        dimensions: `${thumbnailResult.width}x${thumbnailResult.height}`,
                    });
                }
            } catch (thumbnailError) {
                debugWarn('[thumb]', 'Failed to generate thumbnail, continuing without', thumbnailError);
            }
        }

        // Stage 9b: Extract signature params
        let signatureParams: SignatureParams | undefined;
        const finalUploadBlob = uploadBlob;

        if (hybridResult?.signatureMetadata) {
            const sig = hybridResult.signatureMetadata;
            signatureParams = {
                classicalSignature: sig.classicalSignature,
                pqSignature: sig.pqSignature,
                signingContext: sig.signingContext,
                signedAt: sig.signedAt,
                signerFingerprint: sig.signerFingerprint,
                signerKeyVersion: sig.signerKeyVersion,
            };
            debugLog('[sig]', 'File signed at encrypt time (v1.4)', {
                signedAt: sig.signedAt,
                fingerprint: sig.signerFingerprint,
            });
        } else if (deps.signingContext) {
            debugWarn('[sig]', 'Signing was requested but file is unsigned — signing may have failed');
            toast.warning('File uploaded without signature', {
                description: 'Signing failed — file was encrypted successfully but without a digital signature.',
            });
        }

        // Stage 10: Thumbnail key derivation + upload dispatch
        const effectiveThumbnailKey = uploadOrgId
            ? (fileId: string) => deps.deriveOrgThumbnailKey(uploadOrgId, fileId)
            : deps.deriveThumbnailKey;

        if (useMultipart && multipartParams) {
            await performMultipartUploadFlow({
                id,
                file,
                uploadBlob: finalUploadBlob,
                uploadSize,
                encryptedResult,
                signatureParams,
                rawThumbnailBlob,
                serverFileId,
                multipartParams,
                setIsMultipartUpload: deps.setIsMultipartUpload,
                setUploadFiles: deps.setUploadFiles,
                getPartUrl: deps.getPartUrl,
                completeMultipart: deps.completeMultipart,
                abortMultipart: deps.abortMultipart,
                getThumbnailUploadUrl: deps.getThumbnailUploadUrl,
                deriveThumbnailKey: effectiveThumbnailKey,
                orgKeyVersion: orgKeyVer,
                contentHash,
                operationId: opId,
            });
        } else if (uploadUrl) {
            await performSingleUpload({
                id,
                file,
                uploadBlob: finalUploadBlob,
                uploadSize,
                uploadContentType,
                encryptedResult,
                signatureParams,
                rawThumbnailBlob,
                serverFileId,
                uploadUrl,
                setUploadFiles: deps.setUploadFiles,
                confirmUpload: deps.confirmUpload,
                getThumbnailUploadUrl: deps.getThumbnailUploadUrl,
                deriveThumbnailKey: effectiveThumbnailKey,
                orgKeyVersion: orgKeyVer,
                contentHash,
                operationId: opId,
                signal,
            });
        }

        // Upload succeeded — clear server info
        deps.serverInfoRef.current.delete(id);
        useOperationStore.getState().completeOperation(opId);
    } catch (error) {
        // Handle cancellation silently
        if (error instanceof DOMException && error.name === 'AbortError') {
            deps.setUploadFiles((prev) => prev.filter((f) => f.id !== id));
            deps.cleanupServerUpload(id);
            return;
        }

        const message = error instanceof Error ? error.message : 'Upload failed';
        const msg = message.toLowerCase();
        let hint: string;
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
            hint = 'Check your connection and try again';
        } else if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('session')) {
            hint = 'Session expired — please reload';
        } else if (msg.includes('quota') || msg.includes('storage')) {
            hint = 'Storage full — free up space or upgrade';
        } else {
            hint = `Failed to upload ${file.name}`;
        }
        deps.setUploadFiles((prev) =>
            prev.map((f) =>
                f.id === id ? { ...f, status: 'error', error: message } : f
            )
        );
        toast.error(hint);
        useOperationStore.getState().failOperation(opId, message);

        deps.cleanupServerUpload(id);
    }
}
