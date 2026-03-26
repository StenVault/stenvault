/**
 * useDirectDownload Hook
 *
 * Background file download without opening the FilePreviewModal.
 * Handles V4 (Hybrid PQC) decryption,
 * then triggers a save-to-disk via anchor click or streaming download.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useOrgMasterKey } from '@/hooks/useOrgMasterKey';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import { decryptFileHybrid, decryptFileHybridFromUrl, extractV4FileKey, deriveManifestHmacKey } from '@/lib/hybridFileCrypto';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';
import { base64ToArrayBuffer } from '@/lib/platform';
import { unwrapOrgHybridSecretKey } from '@/lib/orgHybridCrypto';
import { verifySignedFile } from '@/lib/signedFileCrypto';
import { getEffectiveMimeType } from '@/components/FilePreviewModal/hooks/useFileDecryption';
import { debugLog, debugWarn, debugError } from '@/lib/debugLogger';
import { useOperationStore } from '@/stores/operationStore';
import { STREAMING } from '@/lib/constants';
import type { FileItem } from '@/components/files/types';
import type { HybridSecretKey, HybridSignaturePublicKey } from '@stenvault/shared/platform/crypto';
import { VaultLockedError, DecryptionKeyError, FileCorruptedError } from '@/lib/errors/cryptoErrors';

const V4_CHUNKED_THRESHOLD = STREAMING.THRESHOLD_BYTES;

/**
 * Verify file signature before decryption (defense-in-depth for direct downloads).
 * Returns true if decryption should proceed, false to block.
 * On infra errors (WASM, network), allows decrypt with warning (matches FilePreviewModal behavior).
 */
async function verifySignatureForDownload(
    encryptedData: ArrayBuffer,
    pubKeyData: { ed25519PublicKey: string; mldsa65PublicKey: string },
): Promise<boolean> {
    debugLog('[SIG]', 'Verifying signature before direct download');
    try {
        const encryptedBlob = new Blob([encryptedData]);
        const publicKey: HybridSignaturePublicKey = {
            classical: new Uint8Array(base64ToArrayBuffer(pubKeyData.ed25519PublicKey)),
            postQuantum: new Uint8Array(base64ToArrayBuffer(pubKeyData.mldsa65PublicKey)),
        };

        const result = await verifySignedFile(encryptedBlob, { publicKey });

        if (result.valid) {
            toast.success('Signature verified');
            debugLog('[SIG]', 'Signature verification passed — proceeding to decrypt');
            return true;
        } else {
            toast.error('Signature verification failed', {
                description: 'The file signature could not be verified. Download blocked for security.',
            });
            debugWarn('[SIG]', 'Signature verification FAILED — blocking download', result);
            return false;
        }
    } catch (verifyError) {
        // Infra error (WASM, parsing) — allow decrypt with warning
        debugError('[SIG]', 'Signature verification infra error', verifyError);
        toast.warning('Could not verify signature', {
            description: 'Proceeding with download — verification encountered an infrastructure error',
        });
        return true;
    }
}

function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function useDirectDownload() {
    const trpcUtils = trpc.useUtils();
    const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
    const { unlockOrgVault } = useOrgMasterKey();
    const { getDisplayName } = useFilenameDecryption();

    const download = useCallback(async (file: FileItem) => {
        const toastId = toast.loading('Downloading & decrypting on your device...');
        const opStore = useOperationStore.getState();
        let opId: string | undefined;
        const abortController = new AbortController();

        try {
            const data = await trpcUtils.files.getDownloadUrl.fetch({ fileId: file.id });
            const { url, encryptionIv, encryptionVersion, organizationId, orgKeyVersion, signatureInfo } = data;

            const displayName = getDisplayName(file);
            const mimeType = getEffectiveMimeType(file);
            const isOrgFile = !!organizationId;

            const version = encryptionVersion ?? 4;

            let signerPublicKeyData: { ed25519PublicKey: string; mldsa65PublicKey: string } | null = null;
            if (signatureInfo?.signerId) {
                try {
                    signerPublicKeyData = await trpcUtils.hybridSignature.getPublicKeyByUserId.fetch(
                        { userId: signatureInfo.signerId }
                    );
                } catch (sigKeyErr) {
                    debugWarn('[SIG]', 'Failed to fetch signer public key — skipping verification', sigKeyErr);
                }
            }

            opId = opStore.addOperation({ type: 'download', filename: displayName, status: 'downloading', abortController });
            // Panel takes over as sole progress tracker
            toast.dismiss(toastId);

            if (!isUnlocked) {
                toast.error('Please unlock your vault first');
                if (opId) opStore.failOperation(opId, 'Vault locked');
                return;
            }

            if (opId) opStore.updateProgress(opId, { status: 'decrypting' });

            if (version === 4) {
                let hybridSecretKey: HybridSecretKey;
                if (isOrgFile) {
                    const omk = await unlockOrgVault(organizationId!);
                    const orgSecretData = await trpcUtils.orgKeys.getOrgHybridSecretKey.fetch({
                        organizationId: organizationId!,
                        ...(orgKeyVersion ? { keyVersion: orgKeyVersion } : {}),
                    });
                    hybridSecretKey = await unwrapOrgHybridSecretKey(omk, orgSecretData);
                } else {
                    const personalKey = await getUnlockedHybridSecretKey();
                    if (!personalKey) {
                        toast.error('Hybrid secret key not available');
                        if (opId) opStore.failOperation(opId, 'Hybrid secret key not available');
                        return;
                    }
                    hybridSecretKey = personalKey;
                }

                const isSigned = !!signatureInfo && !!signerPublicKeyData;

                if (isSigned) {
                    // Must load full file into memory for SHA-256 signature verification
                    if (opId) opStore.updateProgress(opId, { status: 'downloading', progress: 0 });
                    const response = await fetch(url, { signal: abortController.signal });
                    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
                    const encryptedData = await response.arrayBuffer();

                    if (opId) opStore.updateProgress(opId, { status: 'decrypting', progress: 30 });
                    const allowed = await verifySignatureForDownload(encryptedData, signerPublicKeyData!);
                    if (!allowed) {
                        if (opId) opStore.failOperation(opId, 'Signature verification failed');
                        return;
                    }

                    if (opId) opStore.updateProgress(opId, { progress: 50 });
                    const decryptedData = await decryptFileHybrid(encryptedData, { secretKey: hybridSecretKey });
                    const decryptedBlob = new Blob([decryptedData], { type: mimeType });
                    triggerBlobDownload(decryptedBlob, displayName);
                    toast.success('Downloaded — signature & integrity verified');
                    if (opId) opStore.completeOperation(opId);
                    return;
                } else if (file.size > V4_CHUNKED_THRESHOLD) {
                    if (opId) opStore.updateProgress(opId, { status: 'downloading', progress: 0 });

                    const { fileKeyBytes, zeroBytes } = await extractV4FileKey(url, hybridSecretKey);
                    const hmacKey = await deriveManifestHmacKey(fileKeyBytes);
                    const fileKey = await crypto.subtle.importKey(
                        'raw',
                        fileKeyBytes.buffer.slice(
                            fileKeyBytes.byteOffset,
                            fileKeyBytes.byteOffset + fileKeyBytes.byteLength,
                        ) as ArrayBuffer,
                        { name: 'AES-GCM', length: 256 },
                        false,
                        ['decrypt'],
                    );
                    zeroBytes();

                    const response = await fetch(url, { signal: abortController.signal });
                    if (!response.ok || !response.body) {
                        throw new Error(`Download failed: ${response.status}`);
                    }

                    const plaintextStream = decryptV4ChunkedToStream(response.body, { fileKey, hmacKey, signal: abortController.signal });
                    try {
                        await streamDownloadToDisk(plaintextStream, {
                            filename: displayName,
                            totalSize: file.size,
                            mimeType,
                            signal: abortController.signal,
                            onProgress: (p) => {
                                if (opId) opStore.updateProgress(opId, { progress: p.percentage });
                            },
                        });
                    } catch (streamErr) {
                        if (!abortController.signal.aborted) {
                            abortController.abort(); // Cancel fetch + decrypt if save picker was cancelled
                        }
                        throw streamErr;
                    }
                } else {
                    if (opId) opStore.updateProgress(opId, { status: 'decrypting', progress: 50 });
                    const decryptedBlob = await decryptFileHybridFromUrl(
                        url,
                        { secretKey: hybridSecretKey },
                        mimeType,
                    );
                    triggerBlobDownload(decryptedBlob, displayName);
                }

                toast.success('Downloaded');
                if (opId) opStore.completeOperation(opId);
                return;
            }

            toast.error(`Unsupported encryption version (${version})`);
            if (opId) opStore.failOperation(opId, `Unsupported encryption version (${version})`);
        } catch (err) {
            if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
                toast.info('Download cancelled');
                if (opId) opStore.removeOperation(opId);
                return;
            }
            const message = err instanceof Error ? err.message : 'Unknown error';
            debugWarn('[DirectDownload]', 'Download failed', err);

            let description: string;
            if (err instanceof VaultLockedError) {
                description = 'Your vault has locked. Please unlock and try again.';
            } else if (err instanceof DecryptionKeyError) {
                description = 'Unable to decrypt this file. The encryption key may have changed.';
            } else if (err instanceof FileCorruptedError) {
                description = 'This file appears to be corrupted or tampered with.';
            } else if (message.includes('expired')) {
                description = 'The download link may have expired. Please try again.';
            } else if (message.includes('OperationError') || message.includes('Vault is locked')) {
                description = 'Your vault may have locked. Please unlock and try again.';
            } else {
                description = 'Please check your connection and try again.';
            }

            toast.error('Download failed', { description });
            if (opId) opStore.failOperation(opId, message);
        }
    }, [trpcUtils, isUnlocked, getUnlockedHybridSecretKey, unlockOrgVault, getDisplayName]);

    return { download };
}
