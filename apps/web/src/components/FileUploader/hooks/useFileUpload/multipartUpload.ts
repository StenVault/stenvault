import { debugLog, debugError, debugWarn } from '@/lib/debugLogger';
import { toast } from '@stenvault/shared/lib/toast';
import { performMultipartUpload, type UploadPartResult } from '@/lib/multipartUpload';
import { useOperationStore } from '@/stores/operationStore';
import {
    saveUploadResumeRecord,
    updateUploadResumeParts,
    deleteUploadResumeRecord,
    VAULT_RESUME_TTL_MS,
    VAULT_RESUME_WRITE_STRIDE,
} from '@/lib/uploadResume';
import { encryptAndUploadThumbnail } from './thumbnailUpload';
import type { MultipartUploadParams } from './types';

/**
 * Drive a multipart upload from already-encrypted bytes.
 *
 * On the first attempt this just runs the part PUTs and finalises with
 * `completeMultipart`. On a transient failure, instead of aborting the
 * R2 multipart (which would force the user to re-encrypt + re-upload from
 * zero), it stashes a resume closure on `serverInfoRef[id].resume`. The
 * `retryFile` path on the hook calls that closure if present, so the
 * second attempt skips parts already in R2 via `queryMultipartStatus`.
 *
 * R2 keeps an unfinished multipart for ~7 days; our orphan-cleanup cron
 * reaps anything still abandoned after 24 h.
 */
export async function performMultipartUploadFlow(params: MultipartUploadParams) {
    const {
        id, file, uploadBlob, uploadSize,
        encryptedResult, signatureParams, rawThumbnailBlob,
        serverFileId, multipartParams, encryptionSeed, folderId,
        setIsMultipartUpload, setUploadFiles,
        getPartUrl, completeMultipart, queryMultipartStatus,
        getThumbnailUploadUrl, deriveThumbnailKey,
        contentHash, operationId, serverInfoRef,
        userId, hkdfKey,
    } = params;

    const { uploadId, fileKey, partSize, totalParts } = multipartParams;
    const fileId = serverFileId;

    setIsMultipartUpload(true);
    debugLog('[upload]', 'Using MULTIPART upload for large file', { fileId, uploadSize, totalParts });

    // Persist resume record BEFORE the first PUT so a tab close mid-upload
    // leaves a recoverable record. The seed's `fileKey` is wrapped with a
    // master-key-derived KEK inside `saveUploadResumeRecord` — only ciphertext
    // lands in IDB. Failure to persist is non-fatal — upload proceeds, just
    // without cross-session resume coverage.
    const now = Date.now();
    const persisted = await saveUploadResumeRecord(
        {
            serverFileId: fileId,
            multipartUploadId: uploadId,
            serverFileKey: fileKey,
            folderId: folderId ?? null,
            file: {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                mimeType: file.type || 'application/octet-stream',
            },
            seed: encryptionSeed,
            encryptionVersion: encryptedResult?.version ?? 4,
            contentHash,
            fingerprintVersion: contentHash ? 2 : undefined,
            partSize,
            totalParts,
            completedParts: [],
            createdAt: now,
            expiresAt: now + VAULT_RESUME_TTL_MS,
        },
        hkdfKey,
        userId,
    );
    if (!persisted) {
        debugWarn('[upload]', 'Resume record persist failed — upload will run without cross-session recovery');
    }

    /**
     * One end-to-end attempt to drive the upload to `completeMultipart`. The
     * `prefilled` arg is the set of parts R2 already has (empty on the first
     * attempt, populated on resume).
     */
    async function attempt(prefilled: ReadonlyArray<UploadPartResult>): Promise<void> {
        const skipPartNumbers = prefilled.map(p => p.partNumber);
        let writesSinceLastPersist = 0;

        const parts = await performMultipartUpload(uploadBlob, {
            partSize,
            getPartUrl: async (partNumber, partSizeBytes) => {
                const { uploadUrl } = await getPartUrl.mutateAsync({
                    fileId,
                    uploadId,
                    fileKey,
                    partNumber,
                    partSize: partSizeBytes,
                });
                return uploadUrl;
            },
            onProgress: (progress) => {
                setUploadFiles((prev) =>
                    prev.map((f) =>
                        f.id === id ? { ...f, progress: progress.percentage } : f
                    )
                );
                if (operationId) {
                    useOperationStore.getState().updateProgress(operationId, { progress: progress.percentage });
                }
            },
            onPartComplete: (completedSoFar) => {
                writesSinceLastPersist++;
                if (writesSinceLastPersist >= VAULT_RESUME_WRITE_STRIDE) {
                    writesSinceLastPersist = 0;
                    void updateUploadResumeParts(fileId, [...completedSoFar]);
                }
            },
            skipPartNumbers,
            prefilledParts: prefilled,
        });

        debugLog('[upload]', 'All parts uploaded: ' + parts.length);

        const thumbnailMetadata = rawThumbnailBlob
            ? await encryptAndUploadThumbnail({ rawThumbnailBlob, fileId, deriveThumbnailKey, getThumbnailUploadUrl })
            : undefined;

        await completeMultipart.mutateAsync({
            fileId,
            uploadId,
            fileKey,
            parts,
            encryptionIv: encryptedResult?.iv,
            encryptionSalt: encryptedResult?.salt,
            encryptionVersion: encryptedResult?.version,
            signatureParams,
            thumbnailMetadata,
            contentHash,
            fingerprintVersion: contentHash ? 2 : undefined,
        });

        // Success — drop the resume record. A future tab open shouldn't
        // see a banner for an upload that's already in the user's vault.
        await deleteUploadResumeRecord(fileId);

        setUploadFiles((prev) =>
            prev.map((f) =>
                f.id === id ? { ...f, status: 'completed', progress: 100 } : f
            )
        );

        toast.success(`${file.name} uploaded successfully`);
    }

    /**
     * Always-resume entry: ask R2 which parts it already has and skip those
     * PUTs. For a fresh upload the multipart is empty (or 404 — we treat both
     * as "no parts") and `attempt` proceeds normally. For any second-or-later
     * pass — in-session retry, cross-session resume, retry of a network blip —
     * the R2 ListParts result is the source of truth, more authoritative than
     * the IDB completedParts cache (which writes every Nth part, so R2 can
     * legitimately have more parts than IDB knows about).
     */
    async function queryAndAttempt(): Promise<void> {
        let prefilled: ReadonlyArray<UploadPartResult> = [];
        try {
            const status = await queryMultipartStatus({ fileId, uploadId, fileKey });
            prefilled = status.parts;
            if (prefilled.length > 0) {
                debugLog('[upload]', `R2 has ${prefilled.length}/${totalParts} parts already — skipping those PUTs`);
            }
        } catch (statusErr) {
            // 404 = multipart reaped or never existed. For fresh uploads that's
            // unexpected (we just initiated it); for stale resume records it's
            // the right answer (start fresh and let R2 reject if it really is
            // gone). Fall through with prefilled=[]; `attempt` surfaces the
            // real error at the first PUT.
            debugWarn('[upload]', 'queryMultipartStatus failed, attempting full upload', statusErr);
        }
        await attempt(prefilled);
    }

    /**
     * Resume closure used by `retryFile` for in-session retries. Re-runs
     * the query+attempt cycle so a transient failure doesn't lose the parts
     * R2 already has. Cleared on success.
     */
    const resumeClosure = async (): Promise<void> => {
        debugLog('[upload]', 'Resuming multipart (retry)', { fileId, uploadId });
        setIsMultipartUpload(true);
        setUploadFiles((prev) =>
            prev.map((f) =>
                f.id === id ? { ...f, status: 'uploading', error: undefined } : f
            )
        );

        try {
            await queryAndAttempt();
            const info = serverInfoRef.current.get(id);
            if (info) {
                serverInfoRef.current.set(id, { ...info, resume: undefined });
            }
        } finally {
            setIsMultipartUpload(false);
        }
    };

    try {
        await queryAndAttempt();

        // Successful — make sure no stale resume closure lingers.
        const info = serverInfoRef.current.get(id);
        if (info) {
            serverInfoRef.current.set(id, { ...info, resume: undefined });
        }
    } catch (uploadError) {
        // Stash the resume closure so retryFile can pick up where we left off.
        // Do NOT abort the R2 multipart — that would force a re-encrypt-from-zero
        // on retry, which is the brutal mobile experience we're avoiding here.
        debugError('[upload]', 'Multipart upload failed (resumable)', uploadError);
        const info = serverInfoRef.current.get(id);
        if (info) {
            serverInfoRef.current.set(id, { ...info, resume: resumeClosure });
        }
        throw uploadError;
    } finally {
        setIsMultipartUpload(false);
    }
}
