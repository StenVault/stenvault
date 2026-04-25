import { debugLog, debugError } from '@/lib/debugLogger';
import { toast } from '@stenvault/shared/lib/toast';
import { useOperationStore } from '@/stores/operationStore';
import { encryptAndUploadThumbnail } from './thumbnailUpload';
import type { SingleUploadParams } from './types';

export async function performSingleUpload(params: SingleUploadParams) {
    const {
        id, file, uploadBlob, uploadSize, uploadContentType,
        encryptedResult, signatureParams, rawThumbnailBlob,
        serverFileId, uploadUrl,
        setUploadFiles, confirmUpload, getThumbnailUploadUrl, deriveThumbnailKey,
        orgKeyVersion, contentHash, operationId, signal,
    } = params;

    const fileId = serverFileId;

    debugLog('[upload]', 'Starting single upload to R2', { fileId, size: uploadSize });

    await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }

        const xhr = new XMLHttpRequest();

        const onAbort = () => {
            xhr.abort();
        };
        signal?.addEventListener('abort', onAbort);

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                setUploadFiles((prev) =>
                    prev.map((f) => (f.id === id ? { ...f, progress } : f))
                );
                if (operationId) {
                    useOperationStore.getState().updateProgress(operationId, { progress });
                }
            }
        });

        xhr.addEventListener('load', () => {
            signal?.removeEventListener('abort', onAbort);
            debugLog('[upload]', 'Upload response', { status: xhr.status });
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed: ${xhr.status} - ${xhr.responseText}`));
            }
        });

        xhr.addEventListener('error', (e) => {
            signal?.removeEventListener('abort', onAbort);
            debugError('[upload]', 'Upload XHR error', e);
            reject(new Error('Upload failed - network error'));
        });

        xhr.addEventListener('abort', () => {
            signal?.removeEventListener('abort', onAbort);
            reject(new DOMException('Aborted', 'AbortError'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', uploadContentType);
        xhr.send(uploadBlob);
    });

    // Encrypt and upload thumbnail (deduplicated)
    const thumbnailMetadata = rawThumbnailBlob
        ? await encryptAndUploadThumbnail({ rawThumbnailBlob, fileId, deriveThumbnailKey, getThumbnailUploadUrl })
        : undefined;

    await confirmUpload.mutateAsync({
        fileId,
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
}
