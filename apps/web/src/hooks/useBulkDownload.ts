/**
 * useBulkDownload Hook
 *
 * Downloads multiple selected files as a ZIP archive.
 * Decrypts each file individually on the client, streams into a ZIP via fflate,
 * and pipes the ZIP to disk via streamDownloadToDisk (3-tier system).
 *
 * Reuses the same decrypt pipeline as useFolderDownload but starts
 * from an array of FileItem objects instead of a folder tree query.
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from '@stenvault/shared/lib/toast';
import { uiDescription } from '@stenvault/shared/lib/uiMessage';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import { decryptFileHybridFromUrl, extractV4FileKey, deriveManifestHmacKey } from '@/lib/hybridFile';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';
import { createZipStream } from '@/lib/zipStream';
import { useOperationStore } from '@/stores/operationStore';
import { STREAMING } from '@/lib/constants';
import { deduplicatePath, resolveEncryptionVersion } from '@/hooks/useFolderDownload';
import { sanitizeZipEntryPath } from '@/lib/zipUtils';
import { devWarn } from '@/lib/debugLogger';
import type { FileItem } from '@/components/files/types';
import { base64ToArrayBuffer } from '@stenvault/shared/platform/crypto';
import type { HybridSecretKey, HybridSignaturePublicKey } from '@stenvault/shared/platform/crypto';

const V4_CHUNKED_THRESHOLD = STREAMING.THRESHOLD_BYTES;

export function useBulkDownload() {
    const trpcUtils = trpc.useUtils();
    const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
    const { getDisplayName } = useFilenameDecryption();

    const [isDownloading, setIsDownloading] = useState(false);
    const downloadingRef = useRef(false);

    const downloadFiles = useCallback(async (files: FileItem[]) => {
        if (!isUnlocked) {
            toast.error('Please unlock your vault first');
            return;
        }
        if (downloadingRef.current) {
            toast.warning('A bulk download is already in progress');
            return;
        }
        if (files.length === 0) return;

        downloadingRef.current = true;
        setIsDownloading(true);
        const abortController = new AbortController();
        const opStore = useOperationStore.getState();
        const zipFilename = `StenVault-${files.length}-files.zip`;
        const opId = opStore.addOperation({
            type: 'download',
            filename: zipFilename,
            status: 'downloading',
            abortController,
        });

        let zip: ReturnType<typeof createZipStream> | null = null;
        let downloadPromise: Promise<unknown> | null = null;

        try {
            // 1. Build flat filename map with deduplication
            const usedPaths = new Set<string>();
            const filePathMap = new Map<number, string>();
            for (const file of files) {
                const displayName = getDisplayName(file);
                const finalPath = deduplicatePath(sanitizeZipEntryPath(displayName), usedPaths);
                filePathMap.set(file.id, finalPath);
            }

            // 2. Create ZIP stream and start piping to disk
            zip = createZipStream();
            downloadPromise = streamDownloadToDisk(zip.readable, {
                filename: zipFilename,
                mimeType: 'application/zip',
                signal: abortController.signal,
            });

            // 3. Decrypt each file and add to ZIP
            let completed = 0;
            const failedFiles: string[] = [];
            // Single-user product: signer is always the current user, so we fetch
            // our own public key once and reuse it across every signed file.
            // `undefined` = not yet fetched, `null` = fetched and absent/failed.
            let cachedSignerKey: { ed25519PublicKey: string; mldsa65PublicKey: string } | null | undefined;

            for (const file of files) {
                if (abortController.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                const path = filePathMap.get(file.id)!;

                try {
                    const dlData = await trpcUtils.files.getDownloadUrl.fetch({ fileId: file.id });
                    const { url, encryptionVersion, signatureInfo } = dlData;
                    const version = resolveEncryptionVersion(encryptionVersion);

                    if (version === 4) {
                        const hybridSecretKey: HybridSecretKey = (await getUnlockedHybridSecretKey()) ??
                            (() => { throw new Error('Hybrid secret key not available'); })();

                        // Signature verification (fail-closed)
                        let signerPublicKeyData: { ed25519PublicKey: string; mldsa65PublicKey: string } | null = null;
                        if (signatureInfo?.signerId) {
                            if (cachedSignerKey === undefined) {
                                try {
                                    cachedSignerKey = (await trpcUtils.hybridSignature.getPublicKey.fetch()) ?? null;
                                } catch {
                                    cachedSignerKey = null;
                                }
                            }
                            signerPublicKeyData = cachedSignerKey;
                            if (!signerPublicKeyData) {
                                devWarn('[BulkDownload]', `Signer key unavailable for file ${file.id} — skipping (fail-closed)`);
                                failedFiles.push(getDisplayName(file));
                                completed++;
                                opStore.updateProgress(opId, { progress: Math.round((completed / files.length) * 100) });
                                continue;
                            }
                        }
                        const isSigned = !!signatureInfo && !!signerPublicKeyData;

                        // Build signerPublicKey for decryption (used by both in-memory and streaming paths)
                        let signerPubKey: HybridSignaturePublicKey | undefined;
                        if (isSigned) {
                            signerPubKey = {
                                classical: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData!.ed25519PublicKey)),
                                postQuantum: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData!.mldsa65PublicKey)),
                            };
                        }

                        if (file.size > V4_CHUNKED_THRESHOLD) {
                            // Large V4 — stream decrypt (handles both signed and unsigned)
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
                            if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);

                            const plaintextStream = decryptV4ChunkedToStream(response.body, {
                                fileKey,
                                hmacKey,
                                signerPublicKey: signerPubKey,
                                signal: abortController.signal,
                            });
                            await zip.addFile(path, plaintextStream);
                        } else {
                            // Small V4 — in-memory (decryptFileHybrid handles signature verification internally)
                            const decryptedBlob = await decryptFileHybridFromUrl(
                                url,
                                { secretKey: hybridSecretKey, signerPublicKey: signerPubKey },
                                file.mimeType || 'application/octet-stream',
                            );
                            const buffer = await decryptedBlob.arrayBuffer();
                            await zip.addFile(path, new Uint8Array(buffer));
                        }
                    } else {
                        devWarn('[BulkDownload]', `Skipping file ${file.id}: unsupported version ${version}`);
                        failedFiles.push(getDisplayName(file));
                    }
                } catch (fileErr) {
                    if (abortController.signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }
                    devWarn('[BulkDownload]', `Failed to decrypt file ${file.id}:`, fileErr);
                    failedFiles.push(getDisplayName(file));
                }

                completed++;
                opStore.updateProgress(opId, { progress: Math.round((completed / files.length) * 100) });
            }

            // 4. Finalize ZIP
            zip.end();
            await downloadPromise;

            // 5. Done
            opStore.completeOperation(opId);
            if (failedFiles.length > 0) {
                const detail = failedFiles.length <= 5
                    ? failedFiles.join(', ')
                    : `${failedFiles.slice(0, 5).join(', ')} and ${failedFiles.length - 5} more`;
                toast.warning(`Downloaded with ${failedFiles.length} file(s) skipped`, {
                    description: uiDescription(`Skipped: ${detail}`),
                    duration: 8000,
                });
            } else {
                toast.success(`${files.length} files downloaded as ZIP`);
            }
        } catch (err) {
            zip?.terminate('Download failed');
            await downloadPromise?.catch(() => {});

            if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
                toast.info('Download cancelled');
                opStore.removeOperation(opId);
            } else {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error('[BulkDownload]', 'Bulk download failed:', err);
                toast.error('Bulk download failed', { description: uiDescription(message) });
                opStore.failOperation(opId, message);
            }
        } finally {
            downloadingRef.current = false;
            setIsDownloading(false);
        }
    }, [isUnlocked, trpcUtils, getUnlockedHybridSecretKey, getDisplayName]);

    return { downloadFiles, isDownloading };
}
