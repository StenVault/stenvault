import { debugLog, debugError } from '@/lib/debugLogger';
import { toast } from '@stenvault/shared/lib/toast';
import { performMultipartUpload } from '@/lib/multipartUpload';
import { useOperationStore } from '@/stores/operationStore';
import { encryptAndUploadThumbnail } from './thumbnailUpload';
import type { MultipartUploadParams } from './types';

export async function performMultipartUploadFlow(params: MultipartUploadParams) {
    const {
        id, file, uploadBlob, uploadSize,
        encryptedResult, signatureParams, rawThumbnailBlob,
        serverFileId, multipartParams,
        setIsMultipartUpload, setUploadFiles,
        getPartUrl, completeMultipart, abortMultipart, getThumbnailUploadUrl, deriveThumbnailKey,
        orgKeyVersion, contentHash, operationId,
    } = params;

    const { uploadId, fileKey, partSize, totalParts } = multipartParams;
    const fileId = serverFileId;

    setIsMultipartUpload(true);
    debugLog('[upload]', 'Using MULTIPART upload for large file', { fileId, uploadSize, totalParts });

    try {
        try {
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
            });

            debugLog('[upload]', 'All parts uploaded: ' + parts.length);

            // Encrypt and upload thumbnail (deduplicated)
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
                orgKeyVersion,
                signatureParams,
                thumbnailMetadata,
                contentHash,
                fingerprintVersion: contentHash ? 2 : undefined,
            });

            setUploadFiles((prev) =>
                prev.map((f) =>
                    f.id === id ? { ...f, status: 'completed', progress: 100 } : f
                )
            );

            toast.success(`${file.name} uploaded successfully`);
        } catch (uploadError) {
            debugError('[upload]', 'Multipart upload failed, aborting', uploadError);
            try {
                await abortMultipart.mutateAsync({ fileId, uploadId, fileKey });
            } catch (abortError) {
                debugError('[upload]', 'Failed to abort multipart', abortError);
            }
            throw uploadError;
        }
    } finally {
        setIsMultipartUpload(false);
    }
}
