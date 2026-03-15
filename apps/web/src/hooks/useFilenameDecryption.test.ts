/**
 * useFilenameDecryption Hook Tests
 *
 * Tests for zero-knowledge filename decryption including:
 * - getDisplayName fallback chain
 * - decryptFilenames batch processing
 * - Cache lifecycle (populate, read, clear on lock)
 * - Error handling and graceful degradation
 * - No-op when master key not unlocked
 *
 * @module useFilenameDecryption.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ============ Mocks ============

const mockDeriveFilenameKey = vi.fn();
let mockIsUnlocked = true;
let mockIsConfigured = true;

vi.mock('./useMasterKey', () => ({
    useMasterKey: () => ({
        deriveFilenameKey: mockDeriveFilenameKey,
        isUnlocked: mockIsUnlocked,
        isConfigured: mockIsConfigured,
    }),
}));

vi.mock('./useOrgMasterKey', () => ({
    useOrgMasterKey: () => ({
        unlockOrgVault: vi.fn(),
        deriveOrgFilenameKey: vi.fn(),
        isOrgUnlocked: () => false,
        getOrgMasterKey: () => null,
        getOrgKeyVersion: () => null,
        deriveOrgFileKey: vi.fn(),
        deriveOrgFileKeyWithBytes: vi.fn(),
        deriveOrgThumbnailKey: vi.fn(),
        clearOrgCache: vi.fn(),
    }),
}));

const mockDecryptFilename = vi.fn();
vi.mock('@/lib/fileCrypto', () => ({
    decryptFilename: (...args: unknown[]) => mockDecryptFilename(...args),
}));

vi.mock('@/lib/debugLogger', () => ({
    debugLog: vi.fn(),
    debugWarn: vi.fn(),
}));

import { useFilenameDecryption } from './useFilenameDecryption';
import type { FileItem } from '@/components/files/types';

// ============ Test Helpers ============

function createFileItem(overrides: Partial<FileItem> = {}): FileItem {
    return {
        id: 1,
        filename: 'original.txt',
        mimeType: 'text/plain',
        size: 1024,
        fileType: 'document',
        folderId: null,
        createdAt: new Date(),
        ...overrides,
    };
}

function createEncryptedFileItem(id: number, ext?: string): FileItem {
    return createFileItem({
        id,
        filename: 'encrypted.ext',
        encryptedFilename: `encrypted-data-${id}`,
        filenameIv: `iv-${id}`,
        plaintextExtension: ext ?? '.txt',
    });
}

const MOCK_FILENAME_KEY = {} as CryptoKey;

// ============ Tests ============

describe('useFilenameDecryption', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsUnlocked = true;
        mockIsConfigured = true;
        mockDeriveFilenameKey.mockResolvedValue(MOCK_FILENAME_KEY);
        mockDecryptFilename.mockImplementation(
            async (encData: string, _key: CryptoKey, _iv: string) => {
                // Return a predictable decrypted name based on encrypted data
                return `decrypted-${encData}`;
            }
        );
    });

    describe('getDisplayName', () => {
        it('returns [Encrypted] for files missing encryption metadata', () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createFileItem({ filename: 'report.pdf' });

            expect(result.current.getDisplayName(file)).toBe('[Encrypted]');
        });

        it('returns decryptedFilename when already set on file', () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createFileItem({
                encryptedFilename: 'enc-data',
                filenameIv: 'iv',
                decryptedFilename: 'already-decrypted.pdf',
            });

            expect(result.current.getDisplayName(file)).toBe('already-decrypted.pdf');
        });

        it('returns [Encrypted] with extension when encrypted but not decrypted', () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createEncryptedFileItem(99, '.pdf');

            expect(result.current.getDisplayName(file)).toBe('[Encrypted].pdf');
        });

        it('returns [Encrypted] without extension when none available', () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createFileItem({
                id: 99,
                encryptedFilename: 'enc-data',
                filenameIv: 'iv',
                plaintextExtension: null,
            });

            expect(result.current.getDisplayName(file)).toBe('[Encrypted]');
        });

        it('returns cached name after decryption', async () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createEncryptedFileItem(10);

            await act(async () => {
                await result.current.decryptFilenames([file]);
            });

            expect(result.current.getDisplayName(file)).toBe(
                'decrypted-encrypted-data-10'
            );
        });

        it('returns [Encrypted] when no encrypted fields present', () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createFileItem({
                filename: 'plain.doc',
                encryptedFilename: null,
                filenameIv: null,
            });

            expect(result.current.getDisplayName(file)).toBe('[Encrypted]');
        });
    });

    describe('decryptFilenames', () => {
        it('decrypts multiple files in parallel', async () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const files = [
                createEncryptedFileItem(1),
                createEncryptedFileItem(2),
                createEncryptedFileItem(3),
            ];

            let returnedFiles: FileItem[] = [];
            await act(async () => {
                returnedFiles = await result.current.decryptFilenames(files);
            });

            expect(mockDeriveFilenameKey).toHaveBeenCalledTimes(1);
            expect(mockDecryptFilename).toHaveBeenCalledTimes(3);
            expect(returnedFiles[0]?.decryptedFilename).toBe('decrypted-encrypted-data-1');
            expect(returnedFiles[1]?.decryptedFilename).toBe('decrypted-encrypted-data-2');
            expect(returnedFiles[2]?.decryptedFilename).toBe('decrypted-encrypted-data-3');
        });

        it('skips files without encrypted filenames', async () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const files = [
                createFileItem({ id: 1, filename: 'plain.txt' }),
                createEncryptedFileItem(2),
            ];

            await act(async () => {
                await result.current.decryptFilenames(files);
            });

            expect(mockDecryptFilename).toHaveBeenCalledTimes(1);
        });

        it('returns original files when not configured', async () => {
            mockIsConfigured = false;
            const { result } = renderHook(() => useFilenameDecryption());
            const files = [createEncryptedFileItem(1)];

            let returnedFiles: FileItem[] = [];
            await act(async () => {
                returnedFiles = await result.current.decryptFilenames(files);
            });

            expect(mockDeriveFilenameKey).not.toHaveBeenCalled();
            expect(returnedFiles).toBe(files); // Same reference
        });

        it('returns original files when not unlocked', async () => {
            mockIsUnlocked = false;
            const { result } = renderHook(() => useFilenameDecryption());
            const files = [createEncryptedFileItem(1)];

            let returnedFiles: FileItem[] = [];
            await act(async () => {
                returnedFiles = await result.current.decryptFilenames(files);
            });

            expect(mockDeriveFilenameKey).not.toHaveBeenCalled();
            expect(returnedFiles).toBe(files);
        });

        it('uses cache and skips already decrypted files', async () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const files = [createEncryptedFileItem(1), createEncryptedFileItem(2)];

            // First call: decrypt both
            await act(async () => {
                await result.current.decryptFilenames(files);
            });

            expect(mockDecryptFilename).toHaveBeenCalledTimes(2);
            vi.clearAllMocks();
            mockDeriveFilenameKey.mockResolvedValue(MOCK_FILENAME_KEY);

            // Second call: both cached, no decryption needed
            let returnedFiles: FileItem[] = [];
            await act(async () => {
                returnedFiles = await result.current.decryptFilenames(files);
            });

            expect(mockDecryptFilename).not.toHaveBeenCalled();
            // But decryptedFilename should still be populated from cache
            expect(returnedFiles[0]?.decryptedFilename).toBe('decrypted-encrypted-data-1');
        });

        it('handles decryption failure gracefully with fallback', async () => {
            mockDecryptFilename.mockRejectedValue(new Error('Bad key'));
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createEncryptedFileItem(1, '.pdf');

            await act(async () => {
                await result.current.decryptFilenames([file]);
            });

            // Should fallback to [Encrypted].pdf in cache
            expect(result.current.getDisplayName(file)).toBe('[Encrypted].pdf');
        });

        it('handles decryption failure without extension', async () => {
            mockDecryptFilename.mockRejectedValue(new Error('Bad key'));
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createFileItem({
                id: 1,
                encryptedFilename: 'enc-data',
                filenameIv: 'iv-1',
                plaintextExtension: null,
            });

            await act(async () => {
                await result.current.decryptFilenames([file]);
            });

            expect(result.current.getDisplayName(file)).toBe('[Encrypted]');
        });

        it('sets isDecrypting during processing', async () => {
            let resolveDecrypt: (value: string) => void;
            mockDecryptFilename.mockImplementation(
                () =>
                    new Promise<string>((resolve) => {
                        resolveDecrypt = resolve;
                    })
            );

            const { result } = renderHook(() => useFilenameDecryption());

            expect(result.current.isDecrypting).toBe(false);

            let promise: Promise<FileItem[]>;
            act(() => {
                promise = result.current.decryptFilenames([createEncryptedFileItem(1)]);
            });

            // isDecrypting should be true while in progress
            await waitFor(() => {
                expect(result.current.isDecrypting).toBe(true);
            });

            // Resolve decryption
            await act(async () => {
                resolveDecrypt!('decrypted.txt');
                await promise!;
            });

            expect(result.current.isDecrypting).toBe(false);
        });

        it('returns empty decryptedFilename when no files need decryption', async () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const files = [createFileItem({ id: 1, filename: 'plain.txt' })];

            let returnedFiles: FileItem[] = [];
            await act(async () => {
                returnedFiles = await result.current.decryptFilenames(files);
            });

            // Should return files with decryptedFilename as undefined (no cache entry)
            expect(returnedFiles[0]?.decryptedFilename).toBeUndefined();
        });
    });

    describe('clearCache', () => {
        it('clears cached decrypted names', async () => {
            const { result } = renderHook(() => useFilenameDecryption());
            const file = createEncryptedFileItem(1);

            // Populate cache
            await act(async () => {
                await result.current.decryptFilenames([file]);
            });

            expect(result.current.getDisplayName(file)).toBe('decrypted-encrypted-data-1');

            // Clear cache
            act(() => {
                result.current.clearCache();
            });

            // Should fall back to [Encrypted] indicator
            expect(result.current.getDisplayName(file)).toBe('[Encrypted].txt');
        });
    });

    describe('auto-clear on lock', () => {
        it('clears cache when vault is locked (isUnlocked becomes false)', async () => {
            const { result, rerender } = renderHook(() => useFilenameDecryption());
            const file = createEncryptedFileItem(1);

            // Populate cache while unlocked
            await act(async () => {
                await result.current.decryptFilenames([file]);
            });

            expect(result.current.getDisplayName(file)).toBe('decrypted-encrypted-data-1');

            // Simulate vault lock
            mockIsUnlocked = false;
            rerender();

            await waitFor(() => {
                expect(result.current.getDisplayName(file)).toBe('[Encrypted].txt');
            });
        });
    });
});
