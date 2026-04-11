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
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useOrgMasterKey } from '@/hooks/useOrgMasterKey';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import { decryptFileHybridFromUrl, extractV4FileKey, deriveManifestHmacKey } from '@/lib/hybridFileCrypto';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';
import { createZipStream } from '@/lib/zipStream';
import { useOperationStore } from '@/stores/operationStore';
import { STREAMING } from '@/lib/constants';
import { deduplicatePath, resolveEncryptionVersion } from '@/hooks/useFolderDownload';
import { devWarn } from '@/lib/debugLogger';
import type { FileItem } from '@/components/files/types';
import type { HybridSecretKey } from '@stenvault/shared/platform/crypto';

const V4_CHUNKED_THRESHOLD = STREAMING.THRESHOLD_BYTES;

/** Strip path traversal segments so decrypted filenames can't escape the ZIP root */
function sanitizeZipEntryPath(name: string): string {
    return name.replace(/\\/g, '/').split('/')
        .filter(seg => seg !== '..' && seg !== '.' && seg.length > 0)
        .join('/') || 'unnamed';
}

export function useBulkDownload() {
    const trpcUtils = trpc.useUtils();
    const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
    const { unlockOrgVault } = useOrgMasterKey();
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
            let failedCount = 0;

            for (const file of files) {
                if (abortController.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                const path = filePathMap.get(file.id)!;

                try {
                    const dlData = await trpcUtils.files.getDownloadUrl.fetch({ fileId: file.id });
                    const { url, encryptionVersion, organizationId, orgKeyVersion } = dlData;
                    const version = resolveEncryptionVersion(encryptionVersion);
                    const isOrgFile = !!organizationId;

                    if (version === 4) {
                        let hybridSecretKey: HybridSecretKey;
                        if (isOrgFile) {
                            const omk = await unlockOrgVault(organizationId!);
                            const { unwrapOrgHybridSecretKey } = await import('@/lib/orgHybridCrypto');
                            const orgSecretData = await trpcUtils.orgKeys.getOrgHybridSecretKey.fetch({
                                organizationId: organizationId!,
                                ...(orgKeyVersion ? { keyVersion: orgKeyVersion } : {}),
                            });
                            hybridSecretKey = await unwrapOrgHybridSecretKey(omk, orgSecretData);
                        } else {
                            const key = await getUnlockedHybridSecretKey();
                            if (!key) throw new Error('Hybrid secret key not available');
                            hybridSecretKey = key;
                        }

                        if (file.size > V4_CHUNKED_THRESHOLD) {
                            // Large V4 — stream decrypt
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
                                signal: abortController.signal,
                            });
                            await zip.addFile(path, plaintextStream);
                        } else {
                            // Small V4 — in-memory
                            const decryptedBlob = await decryptFileHybridFromUrl(
                                url,
                                { secretKey: hybridSecretKey },
                                file.mimeType || 'application/octet-stream',
                            );
                            const buffer = await decryptedBlob.arrayBuffer();
                            await zip.addFile(path, new Uint8Array(buffer));
                        }
                    } else {
                        devWarn('[BulkDownload]', `Skipping file ${file.id}: unsupported version ${version}`);
                        failedCount++;
                    }
                } catch (fileErr) {
                    if (abortController.signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }
                    devWarn('[BulkDownload]', `Failed to decrypt file ${file.id}:`, fileErr);
                    failedCount++;
                }

                completed++;
                opStore.updateProgress(opId, { progress: Math.round((completed / files.length) * 100) });
            }

            // 4. Finalize ZIP
            zip.end();
            await downloadPromise;

            // 5. Done
            opStore.completeOperation(opId);
            if (failedCount > 0) {
                toast.warning(`Downloaded with ${failedCount} file(s) skipped`, {
                    description: `${failedCount} file(s) could not be decrypted and were excluded from the ZIP.`,
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
                toast.error('Bulk download failed', { description: message });
                opStore.failOperation(opId, message);
            }
        } finally {
            downloadingRef.current = false;
            setIsDownloading(false);
        }
    }, [isUnlocked, trpcUtils, getUnlockedHybridSecretKey, unlockOrgVault, getDisplayName]);

    return { downloadFiles, isDownloading };
}
