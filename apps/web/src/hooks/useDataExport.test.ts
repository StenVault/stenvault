/**
 * useDataExport Tests
 *
 * Part 1: Unit tests for pure helpers (buildFolderPath, buildExportMetadata).
 * Part 2: Integration tests for the full export pipeline (pagination, batching,
 *         org boundaries, fail-closed signatures, abort).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildFolderPath,
  type ExportFolder,
} from './useDataExport';

// ============================================================
// Part 1: Unit Tests — buildFolderPath
// ============================================================

describe('buildFolderPath', () => {
  it('builds a single-segment path for a root folder', () => {
    const folderById = new Map<number, ExportFolder>([
      [10, { id: 10, name: 'Photos', encryptedName: null, nameIv: null, parentId: null, organizationId: null }],
    ]);
    const folderNameMap = new Map<number, string>([[10, 'Photos']]);
    expect(buildFolderPath(10, folderById, folderNameMap)).toBe('Photos');
  });

  it('builds a nested path joined with /', () => {
    const folderById = new Map<number, ExportFolder>([
      [10, { id: 10, name: 'Root', encryptedName: null, nameIv: null, parentId: null, organizationId: null }],
      [11, { id: 11, name: 'Sub', encryptedName: null, nameIv: null, parentId: 10, organizationId: null }],
      [12, { id: 12, name: 'Leaf', encryptedName: null, nameIv: null, parentId: 11, organizationId: null }],
    ]);
    const folderNameMap = new Map<number, string>([
      [10, 'Root'],
      [11, 'Sub'],
      [12, 'Leaf'],
    ]);
    expect(buildFolderPath(12, folderById, folderNameMap)).toBe('Root/Sub/Leaf');
  });

  it('falls back to folder_<id> when name is missing from the map', () => {
    const folderById = new Map<number, ExportFolder>([
      [10, { id: 10, name: 'Top', encryptedName: null, nameIv: null, parentId: null, organizationId: null }],
      [11, { id: 11, name: 'Mid', encryptedName: null, nameIv: null, parentId: 10, organizationId: null }],
    ]);
    const folderNameMap = new Map<number, string>([[10, 'Top']]);
    // 11 missing — uses folder_11
    expect(buildFolderPath(11, folderById, folderNameMap)).toBe('Top/folder_11');
  });

  it('stops climbing when parent is outside the enumerated tree', () => {
    // 99 has parent 88 which is NOT in folderById — we treat 99 as the root we have
    const folderById = new Map<number, ExportFolder>([
      [99, { id: 99, name: 'Visible', encryptedName: null, nameIv: null, parentId: 88, organizationId: null }],
    ]);
    const folderNameMap = new Map<number, string>([[99, 'Visible']]);
    expect(buildFolderPath(99, folderById, folderNameMap)).toBe('Visible');
  });

  it('caps depth at 50 to defend against cycles', () => {
    // Build a chain of 60 folders — leaf path should still resolve without hanging
    const folderById = new Map<number, ExportFolder>();
    const folderNameMap = new Map<number, string>();
    for (let i = 1; i <= 60; i++) {
      folderById.set(i, {
        id: i,
        name: `f${i}`,
        encryptedName: null,
        nameIv: null,
        parentId: i === 1 ? null : i - 1,
        organizationId: null,
      });
      folderNameMap.set(i, `f${i}`);
    }
    const path = buildFolderPath(60, folderById, folderNameMap);
    // Depth cap = 50, so we get 50 segments ending at the leaf
    expect(path.split('/').length).toBe(50);
    expect(path.endsWith('/f60')).toBe(true);
  });

  it('sanitizes path-traversal segments inside decrypted names', () => {
    const folderById = new Map<number, ExportFolder>([
      [1, { id: 1, name: '../escape', encryptedName: null, nameIv: null, parentId: null, organizationId: null }],
    ]);
    const folderNameMap = new Map<number, string>([[1, '../escape']]);
    // sanitizeZipEntryPath strips '..' and '.', leaving 'escape'
    expect(buildFolderPath(1, folderById, folderNameMap)).toBe('escape');
  });
});

// ============================================================
// Part 2: Integration Tests — Export Pipeline
// ============================================================
//
// vi.mock factories are hoisted ABOVE all top-level statements at runtime.
// Anything captured by closure inside a factory must come from vi.hoisted()
// so it exists at the time the factory runs.

const h = vi.hoisted(() => {
  return {
    fetch: vi.fn(),
    addFile: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    terminate: vi.fn(),
    streamDownloadToDisk: vi.fn().mockResolvedValue({ bytesWritten: 0 }),
    addOperation: vi.fn(() => 'op-1'),
    updateProgress: vi.fn(),
    completeOperation: vi.fn(),
    failOperation: vi.fn(),
    removeOperation: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastWarning: vi.fn(),
    toastInfo: vi.fn(),
    decryptFilename: vi.fn().mockResolvedValue('decrypted-name.bin'),
    decryptFileHybridFromUrl: vi.fn().mockResolvedValue(new Blob(['plaintext'])),
    extractV4FileKey: vi.fn().mockResolvedValue({
      fileKeyBytes: new Uint8Array(32),
      zeroBytes: vi.fn(),
    }),
    deriveManifestHmacKey: vi.fn().mockResolvedValue({} as CryptoKey),
    decryptV4ChunkedToStream: vi.fn(() => new ReadableStream()),
    unlockOrgVault: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveOrgFilenameKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveOrgFoldernameKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveOrgFileKey: vi.fn().mockResolvedValue({} as CryptoKey),
    getHybridSecretKey: vi.fn().mockResolvedValue({
      classical: new Uint8Array(32),
      postQuantum: new Uint8Array(2400),
    }),
    deriveFileKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveFilenameKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveFoldernameKey: vi.fn().mockResolvedValue({} as CryptoKey),
    isUnlocked: { value: true },
    unwrapOrgHybridSecretKey: vi.fn().mockResolvedValue({
      classical: new Uint8Array(32),
      postQuantum: new Uint8Array(2400),
    }),
    listForExport: vi.fn(),
    getBatchDownloadUrls: vi.fn(),
    getSignerKey: vi.fn(),
    authMe: vi.fn().mockResolvedValue({
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date('2026-01-01').toISOString(),
    }),
    getStorageStats: vi.fn().mockResolvedValue({ storageUsed: 1024, storageQuota: 10240 }),
    listDevices: vi.fn().mockResolvedValue([]),
    listOrgs: vi.fn().mockResolvedValue([]),
    getOrgHybridSecretKey: vi.fn().mockResolvedValue({}),
  };
});

vi.stubGlobal('fetch', h.fetch);

vi.mock('@/lib/zipStream', () => ({
  createZipStream: vi.fn(() => ({
    readable: new ReadableStream(),
    addFile: h.addFile,
    end: h.end,
    terminate: h.terminate,
  })),
}));

vi.mock('@/lib/platform', () => ({
  streamDownloadToDisk: h.streamDownloadToDisk,
}));

vi.mock('@/stores/operationStore', () => ({
  useOperationStore: {
    getState: vi.fn(() => ({
      addOperation: h.addOperation,
      updateProgress: h.updateProgress,
      completeOperation: h.completeOperation,
      failOperation: h.failOperation,
      removeOperation: h.removeOperation,
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: h.toastSuccess,
    error: h.toastError,
    warning: h.toastWarning,
    info: h.toastInfo,
  },
}));

vi.mock('@/lib/fileCrypto', () => ({
  decryptFilename: h.decryptFilename,
}));

vi.mock('@/lib/hybridFile', () => ({
  decryptFileHybridFromUrl: h.decryptFileHybridFromUrl,
  extractV4FileKey: h.extractV4FileKey,
  deriveManifestHmacKey: h.deriveManifestHmacKey,
}));

vi.mock('@/lib/streamingDecrypt', () => ({
  decryptV4ChunkedToStream: h.decryptV4ChunkedToStream,
}));

vi.mock('@/hooks/useOrgMasterKey', () => ({
  useOrgMasterKey: vi.fn(() => ({
    unlockOrgVault: h.unlockOrgVault,
    deriveOrgFileKey: h.deriveOrgFileKey,
    deriveOrgFilenameKey: h.deriveOrgFilenameKey,
    deriveOrgFoldernameKey: h.deriveOrgFoldernameKey,
  })),
}));

vi.mock('@/hooks/useMasterKey', () => ({
  useMasterKey: () => ({
    isUnlocked: h.isUnlocked.value,
    deriveFileKey: h.deriveFileKey,
    deriveFilenameKey: h.deriveFilenameKey,
    deriveFoldernameKey: h.deriveFoldernameKey,
    getUnlockedHybridSecretKey: h.getHybridSecretKey,
  }),
}));

vi.mock('@/lib/orgHybridCrypto', () => ({
  unwrapOrgHybridSecretKey: h.unwrapOrgHybridSecretKey,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: vi.fn(() => ({
      files: {
        listForExport: { fetch: h.listForExport },
        getBatchDownloadUrls: { fetch: h.getBatchDownloadUrls },
        getStorageStats: { fetch: h.getStorageStats },
      },
      orgKeys: {
        getOrgHybridSecretKey: { fetch: h.getOrgHybridSecretKey },
      },
      hybridSignature: {
        getPublicKeyByUserId: { fetch: h.getSignerKey },
      },
      auth: {
        me: { fetch: h.authMe },
      },
      devices: {
        listTrustedDevices: { fetch: h.listDevices },
      },
      organizations: {
        list: { fetch: h.listOrgs },
      },
    })),
  },
}));

// Imports must come AFTER mocks
import { renderHook, act } from '@testing-library/react';
import { useDataExport, buildExportMetadata } from './useDataExport';
import type { trpc as trpcType } from '@/lib/trpc';

// Helper factories ----------------------------------------------------------

function makeFile(overrides: Partial<{
  id: number;
  filename: string;
  size: number;
  folderId: number | null;
  organizationId: number | null;
  mimeType: string | null;
  encryptedFilename: string | null;
  filenameIv: string | null;
  plaintextExtension: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    filename: overrides.filename ?? 'encrypted.ext',
    encryptedFilename: overrides.encryptedFilename ?? null,
    filenameIv: overrides.filenameIv ?? null,
    plaintextExtension: overrides.plaintextExtension ?? '.bin',
    size: overrides.size ?? 1024,
    mimeType: overrides.mimeType ?? 'application/octet-stream',
    folderId: overrides.folderId ?? null,
    organizationId: overrides.organizationId ?? null,
    orgKeyVersion: null,
    encryptionVersion: 4,
    encryptionIv: 'iv-base64',
    encryptionSalt: null,
    createdAt: new Date('2026-04-01').toISOString(),
  };
}

function makeBatchUrl(file: ReturnType<typeof makeFile>, overrides: Partial<{
  signatureInfo: {
    signerId: number;
    signerFingerprint: string | null;
    signerKeyVersion: number;
    signedAt: string;
    signingContext: 'FILE' | 'TIMESTAMP' | 'SHARE';
  } | null;
}> = {}) {
  return {
    fileId: file.id,
    url: `https://r2.example.com/${file.id}`,
    expiresIn: 3600,
    encryptionIv: file.encryptionIv,
    encryptionSalt: file.encryptionSalt,
    encryptionVersion: file.encryptionVersion,
    organizationId: file.organizationId,
    orgKeyVersion: file.orgKeyVersion,
    signatureInfo: overrides.signatureInfo ?? null,
  };
}

function setSinglePage(files: ReturnType<typeof makeFile>[], folders: ExportFolder[] = []) {
  h.listForExport.mockResolvedValueOnce({
    files,
    folders,
    nextCursor: null,
    totalFiles: files.length,
    totalSize: String(files.reduce((s, f) => s + f.size, 0)),
  });
}

// Tests ---------------------------------------------------------------------

describe('useDataExport — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isUnlocked.value = true;
    h.fetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });
    h.decryptFileHybridFromUrl.mockResolvedValue(new Blob(['plaintext']));
    h.addOperation.mockReturnValue('op-1');
  });

  it('exports 5 personal files in a single page', async () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      makeFile({ id: i + 1, filename: `file-${i + 1}.bin`, size: 100 + i }),
    );
    setSinglePage(files);
    h.getBatchDownloadUrls.mockImplementationOnce(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(files.find(x => x.id === id)!)),
    }));

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    expect(h.getBatchDownloadUrls).toHaveBeenCalledTimes(1);
    expect(h.addFile).toHaveBeenCalledTimes(6); // account.json + 5 files
    const paths = h.addFile.mock.calls.map((c: unknown[]) => c[0]);
    expect(paths[0]).toBe('account.json');
    expect(paths).toContain('file-1.bin');
    expect(paths).toContain('file-5.bin');
    expect(h.end).toHaveBeenCalled();
    expect(h.completeOperation).toHaveBeenCalledWith('op-1');
    expect(h.toastSuccess).toHaveBeenCalledWith('Export complete');
  });

  it('paginates through multiple listForExport pages', async () => {
    const page1Files = Array.from({ length: 200 }, (_, i) =>
      makeFile({ id: i + 1, filename: `f${i + 1}.bin` }),
    );
    const page2Files = Array.from({ length: 50 }, (_, i) =>
      makeFile({ id: 201 + i, filename: `f${201 + i}.bin` }),
    );
    h.listForExport
      .mockResolvedValueOnce({
        files: page1Files,
        folders: [],
        nextCursor: 200,
        totalFiles: 250,
        totalSize: '256000',
      })
      .mockResolvedValueOnce({
        files: page2Files,
        folders: [],
        nextCursor: null,
        totalFiles: 0,
        totalSize: '0',
      });
    h.getBatchDownloadUrls.mockImplementation(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(makeFile({ id }))),
    }));

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    expect(h.listForExport).toHaveBeenCalledTimes(2);
    expect(h.getBatchDownloadUrls).toHaveBeenCalledTimes(5); // 250 / 50
    expect(h.addFile).toHaveBeenCalledTimes(251); // 250 + account.json
  });

  it('splits 60 files into two getBatchDownloadUrls calls of 50 + 10', async () => {
    const files = Array.from({ length: 60 }, (_, i) => makeFile({ id: i + 1 }));
    setSinglePage(files);
    h.getBatchDownloadUrls.mockImplementation(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(makeFile({ id }))),
    }));

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    expect(h.getBatchDownloadUrls).toHaveBeenCalledTimes(2);
    const firstCallSize = (h.getBatchDownloadUrls.mock.calls[0]![0] as { fileIds: number[] }).fileIds.length;
    const secondCallSize = (h.getBatchDownloadUrls.mock.calls[1]![0] as { fileIds: number[] }).fileIds.length;
    expect(firstCallSize).toBe(50);
    expect(secondCallSize).toBe(10);
  });

  it('unlocks each org vault when files come from multiple orgs', async () => {
    const files = [
      makeFile({ id: 1, organizationId: 100 }),
      makeFile({ id: 2, organizationId: 100 }),
      makeFile({ id: 3, organizationId: 200 }),
    ];
    setSinglePage(files);
    h.getBatchDownloadUrls.mockImplementation(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(files.find(x => x.id === id)!)),
    }));

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    const orgIdsUnlocked = h.unlockOrgVault.mock.calls.map(c => c[0]);
    expect(orgIdsUnlocked).toContain(100);
    expect(orgIdsUnlocked).toContain(200);
  });

  it('deduplicates files with the same name in the same folder', async () => {
    const folder: ExportFolder = {
      id: 10,
      name: 'Photos',
      encryptedName: null,
      nameIv: null,
      parentId: null,
      organizationId: null,
    };
    const files = [
      makeFile({ id: 1, filename: 'photo.jpg', folderId: 10 }),
      makeFile({ id: 2, filename: 'photo.jpg', folderId: 10 }),
    ];
    setSinglePage(files, [folder]);
    h.getBatchDownloadUrls.mockImplementation(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(files.find(x => x.id === id)!)),
    }));

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    const paths = h.addFile.mock.calls.map((c: unknown[]) => c[0]);
    expect(paths).toContain('Photos/photo.jpg');
    expect(paths).toContain('Photos/photo (1).jpg');
  });

  it('continues after a per-file decrypt failure and reports the skipped file', async () => {
    const files = [
      makeFile({ id: 1, filename: 'good.bin' }),
      makeFile({ id: 2, filename: 'bad.bin' }),
      makeFile({ id: 3, filename: 'good2.bin' }),
    ];
    setSinglePage(files);
    h.getBatchDownloadUrls.mockImplementation(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(files.find(x => x.id === id)!)),
    }));
    h.decryptFileHybridFromUrl
      .mockResolvedValueOnce(new Blob(['ok-1']))
      .mockRejectedValueOnce(new Error('decrypt failed'))
      .mockResolvedValueOnce(new Blob(['ok-3']));

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    const paths = h.addFile.mock.calls.map((c: unknown[]) => c[0]);
    expect(paths).toContain('account.json');
    expect(paths).toContain('good.bin');
    expect(paths).toContain('good2.bin');
    expect(paths).not.toContain('bad.bin');
    expect(h.toastWarning).toHaveBeenCalled();
  });

  it('fail-closed: signed file with missing signer pubkey is skipped, not decrypted', async () => {
    const file = makeFile({ id: 1, filename: 'signed.bin' });
    setSinglePage([file]);
    h.getBatchDownloadUrls.mockResolvedValueOnce({
      urls: [makeBatchUrl(file, {
        signatureInfo: {
          signerId: 999,
          signerFingerprint: null,
          signerKeyVersion: 1,
          signedAt: new Date().toISOString(),
          signingContext: 'FILE',
        },
      })],
    });
    h.getSignerKey.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    expect(h.decryptFileHybridFromUrl).not.toHaveBeenCalled();
    expect(h.extractV4FileKey).not.toHaveBeenCalled();
    const paths = h.addFile.mock.calls.map((c: unknown[]) => c[0]);
    expect(paths).not.toContain('signed.bin');
    expect(h.toastWarning).toHaveBeenCalled();
  });

  it('does nothing and toasts an error when the vault is locked', async () => {
    h.isUnlocked.value = false;

    const { result } = renderHook(() => useDataExport());
    await act(async () => { await result.current.startExport(); });

    expect(h.toastError).toHaveBeenCalledWith('Please unlock your vault first');
    expect(h.listForExport).not.toHaveBeenCalled();
    expect(h.addOperation).not.toHaveBeenCalled();
  });

  it('aborts mid-batch and removes the operation from the store', async () => {
    const files = Array.from({ length: 3 }, (_, i) => makeFile({ id: i + 1 }));
    setSinglePage(files);
    h.getBatchDownloadUrls.mockImplementation(async ({ fileIds }: { fileIds: number[] }) => ({
      urls: fileIds.map(id => makeBatchUrl(files.find(x => x.id === id)!)),
    }));
    let callCount = 0;
    let hookRef: ReturnType<typeof useDataExport> | null = null;
    h.decryptFileHybridFromUrl.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) hookRef?.abort();
      return new Blob(['x']);
    });

    const { result } = renderHook(() => useDataExport());
    hookRef = result.current;
    await act(async () => { await result.current.startExport(); });

    expect(h.toastInfo).toHaveBeenCalledWith('Export cancelled');
    expect(h.removeOperation).toHaveBeenCalledWith('op-1');
    expect(h.terminate).toHaveBeenCalled();
  });
});

// ============================================================
// Part 3: Metadata builder — non-PII shape audit
// ============================================================

describe('buildExportMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.authMe.mockResolvedValue({
      email: 'me@example.com',
      name: 'Me',
      createdAt: new Date('2026-01-01').toISOString(),
    });
    h.getStorageStats.mockResolvedValue({ storageUsed: 100, storageQuota: 1000 });
    h.listDevices.mockResolvedValue([
      { deviceName: 'Laptop', lastUsedAt: new Date('2026-04-15').toISOString() },
    ]);
    h.listOrgs.mockResolvedValue([{ id: 1, name: 'Acme', role: 'admin' }]);
  });

  function makeUtilsMock() {
    return {
      auth: { me: { fetch: h.authMe } },
      files: { getStorageStats: { fetch: h.getStorageStats } },
      devices: { listTrustedDevices: { fetch: h.listDevices } },
      organizations: { list: { fetch: h.listOrgs } },
    } as unknown as ReturnType<typeof trpcType.useUtils>;
  }

  it('produces the expected schema and never leaks PII', async () => {
    const meta = await buildExportMetadata(makeUtilsMock());

    expect(meta.schema).toBe('stenvault-export-v1');
    expect(typeof meta.exportedAt).toBe('string');
    expect(meta.profile).toEqual({
      email: 'me@example.com',
      name: 'Me',
      createdAt: new Date('2026-01-01').toISOString(),
    });
    expect(meta.storage).toEqual({ used: 100, quota: 1000 });
    expect(meta.devices).toEqual([{ name: 'Laptop', lastSeen: new Date('2026-04-15').toISOString() }]);
    expect(meta.organizations).toEqual([{ id: 1, name: 'Acme', role: 'admin' }]);

    const json = JSON.stringify(meta);
    expect(json).not.toMatch(/ipAddress|fingerprint|recoveryCode|mfaSecret|opaqueRecord|securityStamp|privateKey/i);
  });

  it('falls back gracefully when an upstream call rejects', async () => {
    h.authMe.mockRejectedValueOnce(new Error('boom'));
    h.listDevices.mockRejectedValueOnce(new Error('boom'));
    h.listOrgs.mockRejectedValueOnce(new Error('boom'));

    const meta = await buildExportMetadata(makeUtilsMock());
    expect(meta.profile).toEqual({});
    expect(meta.devices).toEqual([]);
    expect(meta.organizations).toEqual([]);
    expect(meta.storage).toEqual({ used: 100, quota: 1000 });
  });
});
