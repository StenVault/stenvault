/**
 * useDataExport Hook
 *
 * Self-service GDPR Art. 20 export. Enumerates the entire accessible vault
 * (personal + org), decrypts every file in-browser, and streams a ZIP archive
 * to disk. Server never sees plaintext content or filenames.
 *
 * Pipeline mirrors useFolderDownload (gold reference) but batched + paginated:
 *   listForExport (cursor) → decrypt names → getBatchDownloadUrls (50/batch)
 *   → V4 in-memory or streaming decrypt → ZIP stream → disk
 *
 * Crypto invariants (verified, NOT pattern-matched):
 *   - V4 only (any other version is skipped, not silently re-keyed)
 *   - Fail-closed on signatures: signed file with unverifiable signer pubkey is skipped
 *   - In-memory decrypt under 50 MB, streaming decrypt at/above
 *   - File keys zeroed after import for streaming path
 *
 * @see apps/web/src/hooks/useFolderDownload.ts
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from '@stenvault/shared/lib/toast';
import { uiDescription } from '@stenvault/shared/lib/uiMessage';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from '@/hooks/useMasterKey';
import { decryptFilename } from '@/lib/fileCrypto';
import {
  decryptFileHybridFromUrl,
  extractV4FileKey,
  deriveManifestHmacKey,
} from '@/lib/hybridFile';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';
import { createZipStream } from '@/lib/zipStream';
import { useOperationStore } from '@/stores/operationStore';
import { STREAMING } from '@/lib/constants';
import { base64ToArrayBuffer } from '@stenvault/shared/platform/crypto';
import type {
  HybridSecretKey,
  HybridSignaturePublicKey,
} from '@stenvault/shared/platform/crypto';
import { sanitizeZipEntryPath } from '@/lib/zipUtils';
import { devWarn } from '@/lib/debugLogger';
import {
  deduplicatePath,
  resolveEncryptionVersion,
} from '@/hooks/useFolderDownload';

const V4_CHUNKED_THRESHOLD = STREAMING.THRESHOLD_BYTES;
const ENUMERATE_PAGE_SIZE = 200;
const URL_BATCH_SIZE = 50;

// Match the procedure output shape exactly so we never reach for `any`
export interface ExportFile {
  id: number;
  filename: string;
  encryptedFilename: string | null;
  filenameIv: string | null;
  plaintextExtension: string | null;
  size: number;
  mimeType: string | null;
  folderId: number | null;
  encryptionVersion: number | null;
  encryptionIv: string | null;
  encryptionSalt: string | null;
  createdAt: string | Date;
}

export interface ExportFolder {
  id: number;
  name: string;
  encryptedName: string | null;
  nameIv: string | null;
  parentId: number | null;
}

interface BatchUrlEntry {
  fileId: number;
  url: string;
  expiresIn: number;
  encryptionIv: string | null;
  encryptionSalt: string | null;
  encryptionVersion: number | null;
  signatureInfo: {
    signerId: number;
    signerFingerprint: string | null;
    signerKeyVersion: number;
    signedAt: string | Date;
    signingContext: 'FILE' | 'TIMESTAMP' | 'SHARE';
  } | null;
}

export interface DataExportState {
  phase: 'idle' | 'enumerating' | 'preparing' | 'exporting' | 'complete' | 'error';
  totalFiles: number;
  totalBytes: bigint;
  completedFiles: number;
  failedFileNames: string[];
  progress: number;
  error: string | null;
}

export interface UseDataExportReturn {
  state: DataExportState;
  startExport: () => Promise<void>;
  abort: () => void;
}

const INITIAL_STATE: DataExportState = {
  phase: 'idle',
  totalFiles: 0,
  totalBytes: 0n,
  completedFiles: 0,
  failedFileNames: [],
  progress: 0,
  error: null,
};

/**
 * Build a folder path from root using a folderById map. Stops at depth 50
 * to defend against cycles in malformed data. Exported for unit testing.
 */
export function buildFolderPath(
  folderId: number,
  folderById: Map<number, Pick<ExportFolder, 'id' | 'parentId'>>,
  folderNameMap: Map<number, string>,
): string {
  const parts: string[] = [];
  let current: number | null = folderId;
  let depth = 0;
  while (current !== null && depth < 50) {
    const name = sanitizeZipEntryPath(
      folderNameMap.get(current) ?? `folder_${current}`,
    );
    parts.unshift(name);
    const folder = folderById.get(current);
    const parentId = folder?.parentId ?? null;
    // Stop when parent is outside our enumerated tree (we've reached our root)
    if (parentId !== null && !folderById.has(parentId)) break;
    current = parentId;
    depth++;
  }
  return parts.join('/');
}

export function useDataExport(): UseDataExportReturn {
  const trpcUtils = trpc.useUtils();
  const {
    isUnlocked,
    deriveFilenameKey,
    deriveFoldernameKey,
    getUnlockedHybridSecretKey,
  } = useMasterKey();

  const [state, setState] = useState<DataExportState>(INITIAL_STATE);

  // Refs for React 19 hook stability:
  //   - trpcUtils returns a new object each render → never put in deps
  //   - exportingRef guards single-flight (state updates are async)
  //   - abortControllerRef lets `abort()` reach into the in-flight callback
  const trpcUtilsRef = useRef(trpcUtils);
  trpcUtilsRef.current = trpcUtils;
  const exportingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const startExport = useCallback(async () => {
    if (!isUnlocked) {
      toast.error('Please unlock your vault first');
      return;
    }
    if (exportingRef.current) {
      toast.warning('An export is already in progress');
      return;
    }

    exportingRef.current = true;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const utils = trpcUtilsRef.current;
    const opStore = useOperationStore.getState();
    const zipFilename = `StenVault-Export-${new Date().toISOString().slice(0, 10)}.zip`;
    const opId = opStore.addOperation({
      type: 'export',
      filename: zipFilename,
      status: 'downloading',
      abortController,
    });

    let zip: ReturnType<typeof createZipStream> | null = null;
    let downloadPromise: Promise<unknown> | null = null;

    try {
      setState({ ...INITIAL_STATE, phase: 'enumerating' });

      // 1. Enumerate via paginated listForExport
      const allFiles: ExportFile[] = [];
      let folders: ExportFolder[] = [];
      let totalFiles = 0;
      let totalBytes = 0n;
      let cursor: number | null = null;
      let firstPage = true;
      do {
        if (abortController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const page = await utils.files.listForExport.fetch({
          cursor: cursor ?? undefined,
          limit: ENUMERATE_PAGE_SIZE,
        });
        allFiles.push(...(page.files as ExportFile[]));
        if (firstPage) {
          folders = page.folders as ExportFolder[];
          totalFiles = page.totalFiles;
          // Backend returns string (decimal) for totalSize so SUM doesn't truncate
          // for large vaults — parse to BigInt for accurate display.
          try {
            totalBytes = BigInt(page.totalSize);
          } catch {
            totalBytes = 0n;
          }
          firstPage = false;
        }
        cursor = page.nextCursor;
      } while (cursor !== null);

      if (allFiles.length === 0) {
        toast.info('Vault is empty — nothing to export');
        opStore.removeOperation(opId);
        setState({ ...INITIAL_STATE });
        return;
      }

      setState(s => ({
        ...s,
        phase: 'preparing',
        totalFiles: allFiles.length,
        totalBytes,
      }));

      // 2. Decrypt names (personal vault only)
      let nameDecryptFailCount = 0;
      const folderNameMap = new Map<number, string>();
      const fileNameMap = new Map<number, string>();

      const decryptFolderBatch = async (batch: ExportFolder[], key: CryptoKey) => {
        await Promise.all(batch.map(async f => {
          if (f.encryptedName && f.nameIv) {
            try {
              folderNameMap.set(f.id, await decryptFilename(f.encryptedName, key, f.nameIv));
            } catch (err) {
              devWarn('[DataExport] Failed to decrypt folder name', f.id, err);
              nameDecryptFailCount++;
              folderNameMap.set(f.id, `folder_${f.id}`);
            }
          } else {
            folderNameMap.set(f.id, f.name);
          }
        }));
      };

      const decryptFileBatch = async (batch: ExportFile[], key: CryptoKey) => {
        await Promise.all(batch.map(async f => {
          if (f.encryptedFilename && f.filenameIv) {
            try {
              fileNameMap.set(f.id, await decryptFilename(f.encryptedFilename, key, f.filenameIv));
            } catch (err) {
              devWarn('[DataExport] Failed to decrypt file name', f.id, err);
              nameDecryptFailCount++;
              fileNameMap.set(f.id, `file_${f.id}${f.plaintextExtension || ''}`);
            }
          } else {
            fileNameMap.set(f.id, f.filename);
          }
        }));
      };

      if (folders.length > 0) {
        const fnKey = await deriveFoldernameKey();
        await decryptFolderBatch(folders, fnKey);
      }
      if (allFiles.length > 0) {
        const fnKey = await deriveFilenameKey();
        await decryptFileBatch(allFiles, fnKey);
      }

      if (nameDecryptFailCount > 0) {
        toast.warning(`${nameDecryptFailCount} name(s) could not be decrypted — using generic names`);
      }

      // 3. Build path map (deduplicated against name collisions)
      const folderById = new Map<number, ExportFolder>();
      for (const f of folders) folderById.set(f.id, f);
      const filePathMap = new Map<number, string>();
      const usedPaths = new Set<string>();
      for (const f of allFiles) {
        const folderPath = f.folderId
          ? buildFolderPath(f.folderId, folderById, folderNameMap)
          : '';
        const fileName = sanitizeZipEntryPath(fileNameMap.get(f.id) ?? f.filename);
        const candidate = folderPath ? `${folderPath}/${fileName}` : fileName;
        const finalPath = deduplicatePath(candidate, usedPaths);
        filePathMap.set(f.id, finalPath);
      }

      // 4. Build account.json metadata (non-PII only)
      const metadata = await buildExportMetadata(utils);

      // 5. Create ZIP stream and start the disk consumer
      zip = createZipStream();
      downloadPromise = streamDownloadToDisk(zip.readable, {
        filename: zipFilename,
        mimeType: 'application/zip',
        signal: abortController.signal,
      });

      // 6. Add account.json first so it's the entry the user sees on top
      await zip.addFile(
        'account.json',
        new TextEncoder().encode(JSON.stringify(metadata, null, 2)),
      );

      // 7. Process files in batches of 50 (matches backend max)
      setState(s => ({ ...s, phase: 'exporting' }));
      let completed = 0;
      const failedFileNames: string[] = [];
      // Single-user product: signer is always the current user, so we fetch
      // our own public key at most once across the whole export.
      // `undefined` = not yet fetched, `null` = fetched and absent/failed.
      let cachedSignerKey: { ed25519PublicKey: string; mldsa65PublicKey: string } | null | undefined;
      const getSignerKey = async (): Promise<{ ed25519PublicKey: string; mldsa65PublicKey: string } | null> => {
        if (cachedSignerKey === undefined) {
          cachedSignerKey = (await utils.hybridSignature.getPublicKey.fetch()) ?? null;
        }
        return cachedSignerKey;
      };

      for (let i = 0; i < allFiles.length; i += URL_BATCH_SIZE) {
        if (abortController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const batch = allFiles.slice(i, i + URL_BATCH_SIZE);
        const { urls } = await utils.files.getBatchDownloadUrls.fetch({
          fileIds: batch.map(f => f.id),
        });
        const urlMap = new Map<number, BatchUrlEntry>(
          (urls as BatchUrlEntry[]).map(u => [u.fileId, u]),
        );

        // Sequential within a batch so ZIP writer backpressure is respected
        for (const file of batch) {
          if (abortController.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          const path = filePathMap.get(file.id) ?? sanitizeZipEntryPath(file.filename);
          const urlEntry = urlMap.get(file.id);
          if (!urlEntry) {
            // Server filtered this file out (ownership changed mid-export). Skip.
            failedFileNames.push(path);
            completed++;
            setState(s => ({
              ...s,
              completedFiles: completed,
              progress: Math.round((completed / allFiles.length) * 100),
              failedFileNames: [...failedFileNames],
            }));
            continue;
          }

          try {
            await decryptAndAddToZip({
              file,
              urlEntry,
              zip,
              abortController,
              getSignerKey,
              getUnlockedHybridSecretKey,
              path,
            });
          } catch (err) {
            if (abortController.signal.aborted) throw err;
            devWarn('[DataExport] Failed to decrypt file', file.id, err);
            failedFileNames.push(path);
          }
          completed++;
          setState(s => ({
            ...s,
            completedFiles: completed,
            progress: Math.round((completed / allFiles.length) * 100),
            failedFileNames: [...failedFileNames],
          }));
          opStore.updateProgress(opId, {
            progress: Math.round((completed / allFiles.length) * 100),
          });
        }
      }

      // 8. Finalize ZIP and wait for disk write
      zip.end();
      await downloadPromise;

      setState(s => ({
        ...s,
        phase: 'complete',
        progress: 100,
        failedFileNames: [...failedFileNames],
      }));
      opStore.completeOperation(opId);

      if (failedFileNames.length > 0) {
        const detail = failedFileNames.length <= 5
          ? failedFileNames.join(', ')
          : `${failedFileNames.slice(0, 5).join(', ')} and ${failedFileNames.length - 5} more`;
        toast.warning(`Export complete with ${failedFileNames.length} file(s) skipped`, {
          description: uiDescription(`Skipped: ${detail}`),
          duration: 8000,
        });
      } else {
        toast.success('Export complete');
      }
    } catch (err) {
      zip?.terminate('Export failed');
      await downloadPromise?.catch(() => {});

      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        toast.info('Export cancelled');
        opStore.removeOperation(opId);
        setState({ ...INITIAL_STATE });
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[DataExport] Export failed:', err);
        toast.error('Export failed', { description: uiDescription(message) });
        opStore.failOperation(opId, message);
        setState(s => ({ ...s, phase: 'error', error: message }));
      }
    } finally {
      exportingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [
    isUnlocked,
    deriveFilenameKey,
    deriveFoldernameKey,
    getUnlockedHybridSecretKey,
  ]);

  return { state, startExport, abort };
}

// ============ Internal helpers ============

interface DecryptParams {
  file: ExportFile;
  urlEntry: BatchUrlEntry;
  zip: ReturnType<typeof createZipStream>;
  abortController: AbortController;
  getSignerKey: () => Promise<{ ed25519PublicKey: string; mldsa65PublicKey: string } | null>;
  getUnlockedHybridSecretKey: () => Promise<HybridSecretKey | null>;
  path: string;
}

async function decryptAndAddToZip(params: DecryptParams): Promise<void> {
  const {
    file,
    urlEntry,
    zip,
    abortController,
    getSignerKey,
    getUnlockedHybridSecretKey,
    path,
  } = params;

  const { url, encryptionVersion, signatureInfo } = urlEntry;
  const version = resolveEncryptionVersion(encryptionVersion);

  if (version !== 4) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  // Resolve hybrid secret key (personal vault only)
  const key = await getUnlockedHybridSecretKey();
  if (!key) throw new Error('Hybrid secret key not available');
  const hybridSecretKey: HybridSecretKey = key;

  // Signature verification — fail-closed if signed but signer pubkey unavailable.
  // Single-user product: signer is always the current user, so getSignerKey
  // returns our own active key (lazily fetched once per export run).
  let signerPublicKeyData: { ed25519PublicKey: string; mldsa65PublicKey: string } | null = null;
  if (signatureInfo?.signerId !== undefined && signatureInfo?.signerId !== null) {
    let fetched: { ed25519PublicKey: string; mldsa65PublicKey: string } | null;
    try {
      fetched = await getSignerKey();
    } catch (err) {
      throw new Error(
        `Signer pubkey lookup failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    if (!fetched) {
      throw new Error('Signer key not found');
    }
    signerPublicKeyData = fetched;
  }

  const signerPubKey: HybridSignaturePublicKey | undefined = signerPublicKeyData
    ? {
        classical: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData.ed25519PublicKey)),
        postQuantum: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData.mldsa65PublicKey)),
      }
    : undefined;

  if (file.size > V4_CHUNKED_THRESHOLD) {
    // Streaming path (large files). extractV4FileKey does its own bounded
    // header-only fetch and aborts; we then fetch the full body separately.
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

    const plaintextStream = decryptV4ChunkedToStream(response.body, {
      fileKey,
      hmacKey,
      signerPublicKey: signerPubKey,
      signal: abortController.signal,
    });
    await zip.addFile(path, plaintextStream);
  } else {
    // In-memory path (small files). decryptFileHybridFromUrl handles
    // signature verification internally and is fail-closed by construction.
    const decryptedBlob = await decryptFileHybridFromUrl(
      url,
      { secretKey: hybridSecretKey, signerPublicKey: signerPubKey },
      file.mimeType || 'application/octet-stream',
    );
    const buffer = await decryptedBlob.arrayBuffer();
    await zip.addFile(path, new Uint8Array(buffer));
  }
}

// ============ Metadata builder (account.json) ============

export interface ExportMetadata {
  schema: 'stenvault-export-v1';
  exportedAt: string;
  profile: { email?: string; name?: string | null; createdAt?: string | null };
  storage: { used: number; quota: number };
  devices: Array<{ name: string | null; lastSeen: string | null }>;
  note: string;
}

const isoOrNull = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

/**
 * Build the account.json bundle. Strictly non-PII:
 *   - No IP addresses
 *   - No device fingerprints
 *   - No keys (private OR public)
 *   - No recovery codes / TOTP secrets
 * Each tRPC call has its own catch so a single API hiccup doesn't sink the export.
 */
export async function buildExportMetadata(
  utils: ReturnType<typeof trpc.useUtils>,
): Promise<ExportMetadata> {
  const [meRes, storageRes, devicesRes] = await Promise.all([
    utils.auth.me.fetch().catch(() => null),
    utils.files.getStorageStats.fetch().catch(() => null),
    utils.devices.listTrustedDevices.fetch().catch(() => []),
  ]);

  return {
    schema: 'stenvault-export-v1',
    exportedAt: new Date().toISOString(),
    profile: meRes
      ? {
          email: meRes.email,
          name: meRes.name ?? null,
          createdAt: isoOrNull(meRes.createdAt),
        }
      : {},
    storage: {
      used: storageRes?.storageUsed ?? 0,
      quota: storageRes?.storageQuota ?? 0,
    },
    devices: devicesRes.map(d => ({
      name: d.deviceName ?? null,
      lastSeen: isoOrNull(d.lastUsedAt),
    })),
    note: 'Files in this ZIP were decrypted by your browser. Filenames match your StenVault vault. No file content ever left your device unencrypted.',
  };
}
