/**
 * useFolderDownload Tests
 *
 * Part 1: Unit tests for pure utility functions (deduplicatePath, resolveEncryptionVersion)
 * Part 2: Integration tests for the download pipeline (duplicate names, V4 decrypt)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deduplicatePath, resolveEncryptionVersion } from './useFolderDownload';

// ============================================================
// Part 1: Unit Tests — Pure Functions
// ============================================================

describe('resolveEncryptionVersion', () => {
  it('returns explicit version when provided', () => {
    expect(resolveEncryptionVersion(4)).toBe(4);
  });

  it('returns V4 when version is null', () => {
    expect(resolveEncryptionVersion(null)).toBe(4);
  });

  it('returns explicit version 0 if provided (edge)', () => {
    // 0 is falsy but ?? only catches null/undefined
    expect(resolveEncryptionVersion(0)).toBe(0);
  });
});

describe('deduplicatePath', () => {
  let usedPaths: Set<string>;

  beforeEach(() => {
    usedPaths = new Set<string>();
  });

  it('returns original path when no conflict', () => {
    const result = deduplicatePath('folder/document.pdf', usedPaths);
    expect(result).toBe('folder/document.pdf');
  });

  it('adds path to usedPaths set', () => {
    deduplicatePath('folder/file.txt', usedPaths);
    expect(usedPaths.has('folder/file.txt')).toBe(true);
  });

  it('appends (1) on first duplicate', () => {
    deduplicatePath('folder/photo.jpg', usedPaths);
    const result = deduplicatePath('folder/photo.jpg', usedPaths);
    expect(result).toBe('folder/photo (1).jpg');
  });

  it('increments counter for multiple duplicates', () => {
    deduplicatePath('docs/report.pdf', usedPaths);
    const second = deduplicatePath('docs/report.pdf', usedPaths);
    const third = deduplicatePath('docs/report.pdf', usedPaths);
    expect(second).toBe('docs/report (1).pdf');
    expect(third).toBe('docs/report (2).pdf');
  });

  it('handles files without extension', () => {
    deduplicatePath('folder/Makefile', usedPaths);
    const result = deduplicatePath('folder/Makefile', usedPaths);
    expect(result).toBe('folder/Makefile (1)');
  });

  it('handles dotfiles (extension only)', () => {
    deduplicatePath('folder/.env', usedPaths);
    const result = deduplicatePath('folder/.env', usedPaths);
    // lastIndexOf('.') = 7 which is > 0, so base = "folder/", ext = ".env"
    expect(result).toBe('folder/ (1).env');
  });

  it('handles files with multiple dots', () => {
    deduplicatePath('folder/archive.tar.gz', usedPaths);
    const result = deduplicatePath('folder/archive.tar.gz', usedPaths);
    // lastIndexOf('.') finds the last dot → base = "folder/archive.tar", ext = ".gz"
    expect(result).toBe('folder/archive.tar (1).gz');
  });

  it('handles deeply nested paths', () => {
    deduplicatePath('a/b/c/d/file.txt', usedPaths);
    const result = deduplicatePath('a/b/c/d/file.txt', usedPaths);
    expect(result).toBe('a/b/c/d/file (1).txt');
  });

  it('does not conflict across different folders', () => {
    const r1 = deduplicatePath('folder1/file.txt', usedPaths);
    const r2 = deduplicatePath('folder2/file.txt', usedPaths);
    expect(r1).toBe('folder1/file.txt');
    expect(r2).toBe('folder2/file.txt');
  });

  it('handles many duplicates correctly', () => {
    for (let i = 0; i < 100; i++) {
      deduplicatePath('f/x.txt', usedPaths);
    }
    expect(usedPaths.has('f/x.txt')).toBe(true);
    expect(usedPaths.has('f/x (1).txt')).toBe(true);
    expect(usedPaths.has('f/x (99).txt')).toBe(true);
    expect(usedPaths.size).toBe(100);
  });

  it('adds deduplicated path to usedPaths (not just original)', () => {
    deduplicatePath('f/a.txt', usedPaths);
    deduplicatePath('f/a.txt', usedPaths); // → f/a (1).txt
    expect(usedPaths.has('f/a (1).txt')).toBe(true);

    // Now manually add "f/a (1).txt" shouldn't happen, but if someone adds f/a.txt again
    const result = deduplicatePath('f/a.txt', usedPaths);
    expect(result).toBe('f/a (2).txt');
  });
});

// ============================================================
// Part 2: Integration Tests — Download Pipeline
// ============================================================

// Mock all heavy dependencies at module level
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockAddFile = vi.fn().mockResolvedValue(undefined);
const mockEnd = vi.fn();
const mockTerminate = vi.fn();
vi.mock('@/lib/zipStream', () => ({
  createZipStream: vi.fn(() => ({
    readable: new ReadableStream(),
    addFile: mockAddFile,
    end: mockEnd,
    terminate: mockTerminate,
  })),
}));

vi.mock('@/lib/platform', () => ({
  streamDownloadToDisk: vi.fn().mockResolvedValue({ bytesWritten: 0 }),
}));

vi.mock('@/stores/operationStore', () => ({
  useOperationStore: {
    getState: vi.fn(() => ({
      addOperation: vi.fn(() => 'op-1'),
      updateProgress: vi.fn(),
      completeOperation: vi.fn(),
      failOperation: vi.fn(),
      removeOperation: vi.fn(),
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/fileCrypto', () => ({
  decryptFilename: vi.fn().mockResolvedValue('decrypted-name.txt'),
}));

vi.mock('@/lib/hybridFileCrypto', () => ({
  decryptFileHybridFromUrl: vi.fn().mockResolvedValue(new Blob(['v4 content'])),
  extractV4FileKey: vi.fn().mockResolvedValue({
    fileKeyBytes: new Uint8Array(32),
    zeroBytes: vi.fn(),
  }),
  deriveManifestHmacKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock('@/lib/streamingDecrypt', () => ({
  decryptV4ChunkedToStream: vi.fn(() => new ReadableStream()),
}));

const mockDeriveFileKey = vi.fn().mockResolvedValue({} as CryptoKey);
const mockDeriveFilenameKey = vi.fn().mockResolvedValue({} as CryptoKey);
const mockDeriveFoldernameKey = vi.fn().mockResolvedValue({} as CryptoKey);
const mockGetHybridSecretKey = vi.fn().mockResolvedValue({
  classical: new Uint8Array(32),
  postQuantum: new Uint8Array(2400),
});

vi.mock('@/hooks/useMasterKey', () => ({
  useMasterKey: vi.fn(() => ({
    isUnlocked: true,
    deriveFileKey: mockDeriveFileKey,
    deriveFilenameKey: mockDeriveFilenameKey,
    deriveFoldernameKey: mockDeriveFoldernameKey,
    getUnlockedHybridSecretKey: mockGetHybridSecretKey,
  })),
}));

vi.mock('@/hooks/useOrgMasterKey', () => ({
  useOrgMasterKey: vi.fn(() => ({
    unlockOrgVault: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveOrgFileKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveOrgFilenameKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveOrgFoldernameKey: vi.fn().mockResolvedValue({} as CryptoKey),
  })),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: vi.fn(() => mockTrpcUtils),
  },
}));

const mockGetDownloadUrl = vi.fn();
const mockListFolderTree = vi.fn();

const mockTrpcUtils = {
  folders: {
    listFolderTree: { fetch: mockListFolderTree },
  },
  files: {
    getDownloadUrl: { fetch: mockGetDownloadUrl },
  },
  orgKeys: {
    getOrgHybridSecretKey: { fetch: vi.fn().mockResolvedValue({}) },
  },
};

// Must import AFTER mocks are set up
import { renderHook, act } from '@testing-library/react';
import { useFolderDownload } from './useFolderDownload';

describe('useFolderDownload — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });
  });

  describe('duplicate filename handling', () => {
    it('deduplicates files with same name in same folder', async () => {
      mockListFolderTree.mockResolvedValue({
        folders: [{ id: 10, name: 'Photos', encryptedName: null, nameIv: null, parentId: null, organizationId: null }],
        files: [
          {
            id: 1, filename: 'photo.jpg', size: 100, folderId: 10,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.jpg',
            encryptionVersion: null, encryptionIv: null,
            orgKeyVersion: null, mimeType: 'image/jpeg', createdAt: new Date(), organizationId: null,
          },
          {
            id: 2, filename: 'photo.jpg', size: 200, folderId: 10,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.jpg',
            encryptionVersion: null, encryptionIv: null,
            orgKeyVersion: null, mimeType: 'image/jpeg', createdAt: new Date(), organizationId: null,
          },
          {
            id: 3, filename: 'photo.jpg', size: 300, folderId: 10,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.jpg',
            encryptionVersion: null, encryptionIv: null,
            orgKeyVersion: null, mimeType: 'image/jpeg', createdAt: new Date(), organizationId: null,
          },
        ],
        totalSize: 600,
        totalFiles: 3,
      });

      mockGetDownloadUrl.mockResolvedValue({
        url: 'https://r2.example.com/any',
        encryptionIv: null,
        encryptionVersion: null,
        organizationId: null,
        orgKeyVersion: null,
      });

      const { result } = renderHook(() => useFolderDownload());
      await act(async () => {
        await result.current.downloadFolder(10, 'Root');
      });

      expect(mockAddFile).toHaveBeenCalledTimes(3);
      const paths = mockAddFile.mock.calls.map((c: unknown[]) => c[0]);
      expect(paths).toContain('Photos/photo.jpg');
      expect(paths).toContain('Photos/photo (1).jpg');
      expect(paths).toContain('Photos/photo (2).jpg');
    });

    it('does not rename files with same name in different folders', async () => {
      mockListFolderTree.mockResolvedValue({
        folders: [
          { id: 10, name: 'FolderA', encryptedName: null, nameIv: null, parentId: null, organizationId: null },
          { id: 11, name: 'FolderB', encryptedName: null, nameIv: null, parentId: null, organizationId: null },
        ],
        files: [
          {
            id: 1, filename: 'readme.md', size: 50, folderId: 10,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.md',
            encryptionVersion: null, encryptionIv: null,
            orgKeyVersion: null, mimeType: 'text/markdown', createdAt: new Date(), organizationId: null,
          },
          {
            id: 2, filename: 'readme.md', size: 80, folderId: 11,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.md',
            encryptionVersion: null, encryptionIv: null,
            orgKeyVersion: null, mimeType: 'text/markdown', createdAt: new Date(), organizationId: null,
          },
        ],
        totalSize: 130,
        totalFiles: 2,
      });

      mockGetDownloadUrl.mockResolvedValue({
        url: 'https://r2.example.com/any',
        encryptionIv: null,
        encryptionVersion: null,
        organizationId: null,
        orgKeyVersion: null,
      });

      const { result } = renderHook(() => useFolderDownload());
      await act(async () => {
        await result.current.downloadFolder(10, 'Root');
      });

      expect(mockAddFile).toHaveBeenCalledTimes(2);
      const paths = mockAddFile.mock.calls.map((c: unknown[]) => c[0]);
      expect(paths).toContain('FolderA/readme.md');
      expect(paths).toContain('FolderB/readme.md');
    });
  });

  describe('multiple V4 files', () => {
    it('handles multiple V4 files in same folder', async () => {
      mockListFolderTree.mockResolvedValue({
        folders: [],
        files: [
          {
            id: 1, filename: 'encrypted.ext', size: 100, folderId: null,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.pdf',
            encryptionVersion: 4, encryptionIv: 'base64iv==',
            orgKeyVersion: null, mimeType: 'application/pdf', createdAt: new Date(), organizationId: null,
          },
          {
            id: 2, filename: 'encrypted2.ext', size: 50, folderId: null,
            encryptedFilename: null, filenameIv: null, plaintextExtension: '.txt',
            encryptionVersion: 4, encryptionIv: 'base64iv2==',
            orgKeyVersion: null, mimeType: 'text/plain', createdAt: new Date(), organizationId: null,
          },
        ],
        totalSize: 150,
        totalFiles: 2,
      });

      mockGetDownloadUrl
        .mockResolvedValueOnce({
          url: 'https://r2.example.com/f1',
          encryptionIv: 'base64iv==',
          encryptionVersion: 4,
          organizationId: null,
          orgKeyVersion: null,
        })
        .mockResolvedValueOnce({
          url: 'https://r2.example.com/f2',
          encryptionIv: 'base64iv2==',
          encryptionVersion: 4,
          organizationId: null,
          orgKeyVersion: null,
        });

      const { result } = renderHook(() => useFolderDownload());
      await act(async () => {
        await result.current.downloadFolder(1, 'Mixed');
      });

      // Both files should be in ZIP
      expect(mockAddFile).toHaveBeenCalledTimes(2);

      // Both should have called hybrid decrypt
      const { decryptFileHybridFromUrl } = await import('@/lib/hybridFileCrypto');
      expect(decryptFileHybridFromUrl).toHaveBeenCalledTimes(2);
    });
  });
});
