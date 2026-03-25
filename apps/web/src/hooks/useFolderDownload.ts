/**
 * useFolderDownload Hook
 *
 * Downloads an entire folder tree as a ZIP archive.
 * Decrypts each file individually on the client, streams into a ZIP via fflate,
 * and pipes the ZIP to disk via streamDownloadToDisk (3-tier system).
 *
 * Pipeline:
 *   listFolderTree → decrypt names → createZipStream → per-file decrypt → addFile → end
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useOrgMasterKey } from '@/hooks/useOrgMasterKey';
import { decryptFilename } from '@/lib/fileCrypto';
import { decryptFileHybridFromUrl, extractV4FileKey, deriveManifestHmacKey } from '@/lib/hybridFileCrypto';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';
import { createZipStream } from '@/lib/zipStream';
import { useOperationStore } from '@/stores/operationStore';
import { STREAMING } from '@/lib/constants';
import type { HybridSecretKey } from '@stenvault/shared/platform/crypto';

const V4_CHUNKED_THRESHOLD = STREAMING.THRESHOLD_BYTES;

/**
 * Determine effective encryption version from metadata.
 * - Explicit version takes priority
 * - Default to V4 (Hybrid PQC)
 */
export function resolveEncryptionVersion(
  encryptionVersion: number | null,
): number {
  return encryptionVersion ?? 4;
}

/**
 * Deduplicate a ZIP entry path against already-used paths.
 * Returns the original path if unique, or appends ` (N)` before extension.
 * Mutates `usedPaths` by adding the returned path.
 */
export function deduplicatePath(candidate: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(candidate)) {
    usedPaths.add(candidate);
    return candidate;
  }
  const lastDot = candidate.lastIndexOf('.');
  const base = lastDot > 0 ? candidate.substring(0, lastDot) : candidate;
  const ext = lastDot > 0 ? candidate.substring(lastDot) : '';
  let counter = 1;
  let result = `${base} (${counter})${ext}`;
  while (usedPaths.has(result)) {
    counter++;
    result = `${base} (${counter})${ext}`;
  }
  usedPaths.add(result);
  return result;
}

interface TreeFolder {
  id: number;
  name: string;
  encryptedName: string | null;
  nameIv: string | null;
  parentId: number | null;
  organizationId: number | null;
}

interface TreeFile {
  id: number;
  filename: string;
  size: number;
  folderId: number | null;
  encryptedFilename: string | null;
  filenameIv: string | null;
  plaintextExtension: string | null;
  encryptionVersion: number | null;
  encryptionIv: string | null;
  orgKeyVersion: number | null;
  mimeType: string | null;
  createdAt: Date;
  organizationId: number | null;
}

/** Data returned from listFolderTree, cached from the confirmation dialog */
export interface FolderTreeData {
  folders: TreeFolder[];
  files: TreeFile[];
  totalSize: number;
  totalFiles: number;
}

export function useFolderDownload() {
  const trpcUtils = trpc.useUtils();
  const {
    isUnlocked,
    deriveFilenameKey,
    deriveFoldernameKey,
    getUnlockedHybridSecretKey,
  } = useMasterKey();
  const { unlockOrgVault, deriveOrgFilenameKey, deriveOrgFoldernameKey } = useOrgMasterKey();

  const [isDownloading, setIsDownloading] = useState(false);
  // Ref-based guard prevents double-click race (state update is async)
  const downloadingRef = useRef(false);

  /**
   * Fetch folder tree metadata (for confirmation dialog preview).
   * Returns the tree data so the caller can pass it to downloadFolder.
   */
  const fetchFolderTree = useCallback(async (folderId: number): Promise<FolderTreeData> => {
    return await trpcUtils.folders.listFolderTree.fetch({ folderId });
  }, [trpcUtils]);

  /**
   * Download a folder as ZIP.
   * @param treeData - If provided, skips the listFolderTree fetch (avoids double-fetch from dialog).
   */
  const downloadFolder = useCallback(async (
    folderId: number,
    folderName: string,
    treeData?: FolderTreeData,
  ) => {
    if (!isUnlocked) {
      toast.error('Please unlock your vault first');
      return;
    }
    if (downloadingRef.current) {
      toast.warning('A folder download is already in progress');
      return;
    }

    downloadingRef.current = true;
    setIsDownloading(true);
    const abortController = new AbortController();
    const opStore = useOperationStore.getState();
    const zipFilename = `${folderName}.zip`;
    const opId = opStore.addOperation({
      type: 'download',
      filename: zipFilename,
      status: 'downloading',
      abortController,
    });

    let zip: ReturnType<typeof createZipStream> | null = null;
    let downloadPromise: Promise<unknown> | null = null;

    try {
      // 1. Use cached tree data or fetch fresh
      const tree = treeData ?? await trpcUtils.folders.listFolderTree.fetch({ folderId });
      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const { folders, files } = tree;
      if (files.length === 0) {
        toast.info('Folder is empty — no files to download');
        opStore.removeOperation(opId);
        return;
      }

      // 2. Decrypt folder names — build folderId → decrypted name map
      let nameDecryptFailCount = 0;
      const folderNameMap = new Map<number, string>();
      const personalFolders = folders.filter(f => !f.organizationId);
      const orgFoldersByOrg = new Map<number, TreeFolder[]>();
      for (const f of folders) {
        if (f.organizationId) {
          const list = orgFoldersByOrg.get(f.organizationId) ?? [];
          list.push(f);
          orgFoldersByOrg.set(f.organizationId, list);
        }
      }

      const decryptFolderBatch = async (batch: TreeFolder[], key: CryptoKey) => {
        await Promise.all(batch.map(async (f) => {
          if (f.encryptedName && f.nameIv) {
            try {
              folderNameMap.set(f.id, await decryptFilename(f.encryptedName, key, f.nameIv));
            } catch (err) {
              console.warn('[FolderDownload] Failed to decrypt folder name', f.id, err);
              nameDecryptFailCount++;
              folderNameMap.set(f.id, `folder_${f.id}`);
            }
          } else {
            folderNameMap.set(f.id, f.name);
          }
        }));
      };

      if (personalFolders.length > 0) {
        const fnKey = await deriveFoldernameKey();
        await decryptFolderBatch(personalFolders, fnKey);
      }
      for (const [orgId, orgFolders] of orgFoldersByOrg) {
        try {
          await unlockOrgVault(orgId);
          const key = await deriveOrgFoldernameKey(orgId);
          await decryptFolderBatch(orgFolders, key);
        } catch (err) {
          console.warn('[FolderDownload] Failed to unlock org vault for folder names', orgId, err);
          nameDecryptFailCount += orgFolders.length;
          for (const f of orgFolders) folderNameMap.set(f.id, `folder_${f.id}`);
        }
      }

      // 3. Decrypt file names
      const fileNameMap = new Map<number, string>();
      const personalFiles = files.filter(f => !f.organizationId);
      const orgFilesByOrg = new Map<number, TreeFile[]>();
      for (const f of files) {
        if (f.organizationId) {
          const list = orgFilesByOrg.get(f.organizationId) ?? [];
          list.push(f);
          orgFilesByOrg.set(f.organizationId, list);
        }
      }

      const decryptFileBatch = async (batch: TreeFile[], key: CryptoKey) => {
        await Promise.all(batch.map(async (f) => {
          if (f.encryptedFilename && f.filenameIv) {
            try {
              fileNameMap.set(f.id, await decryptFilename(f.encryptedFilename, key, f.filenameIv));
            } catch (err) {
              console.warn('[FolderDownload] Failed to decrypt file name', f.id, err);
              nameDecryptFailCount++;
              fileNameMap.set(f.id, `file_${f.id}${f.plaintextExtension || ''}`);
            }
          } else {
            fileNameMap.set(f.id, f.filename);
          }
        }));
      };

      if (personalFiles.length > 0) {
        const fnKey = await deriveFilenameKey();
        await decryptFileBatch(personalFiles, fnKey);
      }
      for (const [orgId, orgFiles] of orgFilesByOrg) {
        try {
          await unlockOrgVault(orgId);
          const key = await deriveOrgFilenameKey(orgId);
          await decryptFileBatch(orgFiles, key);
        } catch (err) {
          console.warn('[FolderDownload] Failed to unlock org vault for file names', orgId, err);
          nameDecryptFailCount += orgFiles.length;
          for (const f of orgFiles) fileNameMap.set(f.id, `file_${f.id}${f.plaintextExtension || ''}`);
        }
      }

      if (nameDecryptFailCount > 0) {
        toast.warning(`${nameDecryptFailCount} name(s) could not be decrypted — using generic names`);
      }

      // 4. Build path map: fileId → "RootFolder/Sub/file.txt"
      //    Use Map for O(1) lookup instead of Array.find O(n)
      const folderById = new Map<number, TreeFolder>();
      for (const f of folders) folderById.set(f.id, f);

      const buildFolderPath = (fId: number): string => {
        const parts: string[] = [];
        let current: number | null = fId;
        let depth = 0;
        while (current !== null && depth < 50) {
          const name = folderNameMap.get(current) ?? `folder_${current}`;
          parts.unshift(name);
          const folder = folderById.get(current);
          const parentId = folder?.parentId ?? null;
          // Stop when parent is outside our tree (we've reached the root)
          if (parentId !== null && !folderById.has(parentId)) break;
          current = parentId;
          depth++;
        }
        return parts.join('/');
      };

      const filePathMap = new Map<number, string>();
      const usedPaths = new Set<string>();
      for (const f of files) {
        const folderPath = f.folderId ? buildFolderPath(f.folderId) : folderName;
        const fileName = fileNameMap.get(f.id) ?? f.filename;
        const finalPath = deduplicatePath(`${folderPath}/${fileName}`, usedPaths);
        filePathMap.set(f.id, finalPath);
      }

      // 5. Create ZIP stream and start piping to disk
      zip = createZipStream();

      // Start the consumer (streamDownloadToDisk) — reads from zip.readable in parallel
      downloadPromise = streamDownloadToDisk(zip.readable, {
        filename: zipFilename,
        mimeType: 'application/zip',
        signal: abortController.signal,
      });

      // 6. Producer: decrypt each file and add to ZIP
      let completed = 0;
      let failedCount = 0;

      for (const file of files) {
        if (abortController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const path = filePathMap.get(file.id)!;

        try {
          // Fetch fresh presigned URL
          const dlData = await trpcUtils.files.getDownloadUrl.fetch({ fileId: file.id });
          const { url, encryptionIv, encryptionVersion, organizationId, orgKeyVersion } = dlData;
          const version = resolveEncryptionVersion(encryptionVersion);
          const isOrgFile = !!organizationId;

          if (version === 4) {
            // Resolve hybrid secret key
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
              // Large V4 — stream decrypt → addFile(path, stream)
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
              // Small V4 — single-pass in memory
              const decryptedBlob = await decryptFileHybridFromUrl(
                url,
                { secretKey: hybridSecretKey },
                file.mimeType || 'application/octet-stream',
              );
              const buffer = await decryptedBlob.arrayBuffer();
              await zip.addFile(path, new Uint8Array(buffer));
            }
          } else {
            console.warn('[FolderDownload]', `Skipping file ${file.id}: unsupported version ${version}`);
            failedCount++;
          }
        } catch (fileErr) {
          if (abortController.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          console.warn('[FolderDownload]', `Failed to decrypt file ${file.id}:`, fileErr);
          failedCount++;
        }

        completed++;
        opStore.updateProgress(opId, { progress: Math.round((completed / files.length) * 100) });
      }

      // 7. Finalize ZIP
      zip.end();
      await downloadPromise;

      // 8. Done
      opStore.completeOperation(opId);
      if (failedCount > 0) {
        toast.warning(`Downloaded with ${failedCount} file(s) skipped`, {
          description: `${failedCount} file(s) could not be decrypted and were excluded from the ZIP. Try downloading them individually.`,
          duration: 8000,
        });
      } else {
        toast.success('Folder downloaded');
      }
    } catch (err) {
      // Ensure the ZIP stream is terminated and downloadPromise settles
      zip?.terminate('Download failed');
      await downloadPromise?.catch(() => {});

      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        toast.info('Download cancelled');
        opStore.removeOperation(opId);
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[FolderDownload]', 'Folder download failed:', err);
        toast.error('Folder download failed', { description: message });
        opStore.failOperation(opId, message);
      }
    } finally {
      downloadingRef.current = false;
      setIsDownloading(false);
    }
  }, [
    isUnlocked,
    trpcUtils,
    deriveFilenameKey,
    deriveFoldernameKey,
    getUnlockedHybridSecretKey,
    unlockOrgVault,
    deriveOrgFilenameKey,
    deriveOrgFoldernameKey,
  ]);

  return { downloadFolder, fetchFolderTree, isDownloading };
}
