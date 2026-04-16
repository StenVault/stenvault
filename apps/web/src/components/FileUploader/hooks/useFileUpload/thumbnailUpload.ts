import { encryptThumbnail } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import type { ThumbnailMetadata } from './types';

/**
 * Encrypt and upload a thumbnail to R2.
 * Non-fatal: returns undefined on failure so the main upload continues.
 */
export async function encryptAndUploadThumbnail(params: {
    rawThumbnailBlob: Blob;
    fileId: number;
    deriveThumbnailKey: (fileId: string) => Promise<CryptoKey>;
    getThumbnailUploadUrl: { mutateAsync: (p: { fileId: number; size: number }) => Promise<{ uploadUrl: string; thumbnailKey: string; expiresIn: number }> };
}): Promise<ThumbnailMetadata | undefined> {
    const { rawThumbnailBlob, fileId, deriveThumbnailKey, getThumbnailUploadUrl } = params;

    try {
        const thumbCryptoKey = await deriveThumbnailKey(fileId.toString());
        const encrypted = await encryptThumbnail(rawThumbnailBlob, thumbCryptoKey);

        const { uploadUrl: thumbnailUploadUrl, thumbnailKey } = await getThumbnailUploadUrl.mutateAsync({
            fileId,
            size: encrypted.size,
        });

        const thumbnailResponse = await fetch(thumbnailUploadUrl, {
            method: 'PUT',
            body: encrypted.encryptedBlob,
            headers: { 'Content-Type': 'application/octet-stream' },
        });

        if (!thumbnailResponse.ok) {
            throw new Error(`Thumbnail upload failed: ${thumbnailResponse.status}`);
        }

        debugLog('[thumb]', 'Encrypted thumbnail uploaded', { fileId, thumbnailKey });

        return {
            thumbnailKey,
            thumbnailIv: encrypted.iv,
            thumbnailSize: encrypted.size,
        };
    } catch (thumbnailUploadError) {
        debugWarn('[thumb]', 'Failed to upload thumbnail, continuing without', thumbnailUploadError);
        return undefined;
    }
}
