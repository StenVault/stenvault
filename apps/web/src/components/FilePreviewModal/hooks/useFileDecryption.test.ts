/**
 * useFileDecryption — focused integration tests for the state machine wiring.
 *
 * Two scenarios: the lock→unlock race that motivated the reducer refactor,
 * and the unsupported-version failure path.
 *
 * This file runs in the Vitest `sequential` project (see vitest.config.ts)
 * — Vitest 4's new fork pool has an IPC stall bug with tests that run
 * multiple dispatches through useEffect + async side-effects, so we
 * isolate it with maxWorkers=1 + isolate=false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
    isUnlocked: false,
    getHybridSecretKey: vi.fn(),
    unlockOrgVault: vi.fn(),
    extractV4FileKey: vi.fn(),
    deriveManifestHmacKey: vi.fn(),
    decryptFileHybrid: vi.fn(),
    decryptV4ChunkedToStream: vi.fn(),
    verifySignedFile: vi.fn(),
    signerKeyQuery: { data: undefined as unknown, error: undefined as unknown },
};

vi.mock('@/hooks/useMasterKey', () => ({
    useMasterKey: () => ({
        isUnlocked: mocks.isUnlocked,
        getUnlockedHybridSecretKey: mocks.getHybridSecretKey,
    }),
}));

vi.mock('@/hooks/useOrgMasterKey', () => ({
    useOrgMasterKey: () => ({
        unlockOrgVault: mocks.unlockOrgVault,
    }),
}));

vi.mock('@/lib/trpc', () => ({
    trpc: {
        hybridSignature: {
            getPublicKeyByUserId: {
                useQuery: () => mocks.signerKeyQuery,
            },
        },
        useUtils: () => ({
            orgKeys: {
                getOrgHybridSecretKey: { fetch: vi.fn() },
            },
        }),
    },
}));

vi.mock('@/lib/hybridFile', () => ({
    extractV4FileKey: (...args: unknown[]) => mocks.extractV4FileKey(...args),
    deriveManifestHmacKey: (...args: unknown[]) => mocks.deriveManifestHmacKey(...args),
    decryptFileHybrid: (...args: unknown[]) => mocks.decryptFileHybrid(...args),
}));

vi.mock('@/lib/streamingDecrypt', () => ({
    decryptV4ChunkedToStream: (...args: unknown[]) => mocks.decryptV4ChunkedToStream(...args),
}));

vi.mock('@/lib/signedFileCrypto', () => ({
    verifySignedFile: (...args: unknown[]) => mocks.verifySignedFile(...args),
}));

vi.mock('@/lib/platform', () => ({
    base64ToArrayBuffer: () => new ArrayBuffer(8),
}));

vi.mock('@/lib/orgHybridCrypto', () => ({
    unwrapOrgHybridSecretKey: vi.fn(),
}));

vi.mock('@stenvault/shared/lib/toast', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        message: vi.fn(),
    },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileDecryption } from './useFileDecryption';
import type { PreviewableFile } from '../types';

function sampleFile(overrides: Partial<PreviewableFile> = {}): PreviewableFile {
    return {
        id: 42,
        filename: 'enc.bin',
        size: 1024,
        fileType: 'document',
        mimeType: 'application/pdf',
        encryptedFilename: null,
        filenameIv: null,
        plaintextExtension: '.pdf',
        decryptedFilename: 'test.pdf',
        folderId: null,
        organizationId: null,
        orgKeyVersion: null,
        encryptionVersion: 4,
        encryptionIv: 'iv-base64',
        encryptionSalt: null,
        createdAt: new Date('2026-04-17').toISOString(),
        ...overrides,
    } as PreviewableFile;
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    mocks.isUnlocked = false;
    mocks.signerKeyQuery = { data: undefined, error: undefined };
    vi.clearAllMocks();

    mocks.getHybridSecretKey.mockResolvedValue({
        classical: new Uint8Array(32),
        postQuantum: new Uint8Array(2400),
    });
    mocks.extractV4FileKey.mockRejectedValue(new Error('mock: extract not wired'));
});

describe('useFileDecryption — state machine wiring', () => {
    it('awaitingUnlock is exposed via state.kind, not as a string error', async () => {
        mocks.isUnlocked = false;
        const stableFile = sampleFile();

        const { result } = renderHook(() =>
            useFileDecryption({
                file: stableFile,
                isOpen: true,
                rawUrl: 'https://r2.example.com/file',
                encryptionVersion: 4,
            }),
        );

        // awaitingUnlock is a normal wait state — state.error stays null so
        // the UI can render InlineUnlockPrompt instead of the red error pane.
        await waitFor(() => {
            expect(result.current.state.kind).toBe('awaitingUnlock');
        });
        expect(result.current.state.error).toBeNull();
        expect(result.current.state.isDecrypting).toBe(false);
    });

    it('lock→unlock leaves awaitingUnlock without sticking (race-bug regression)', async () => {
        mocks.isUnlocked = false;
        // File ref is stable across renders — creating it inside the hook fn
        // would make `file` in orchestration deps churn and loop forever.
        const stableFile = sampleFile();

        const { result, rerender } = renderHook(
            ({ isUnlockedOverride }: { isUnlockedOverride: boolean }) => {
                mocks.isUnlocked = isUnlockedOverride;
                return useFileDecryption({
                    file: stableFile,
                    isOpen: true,
                    rawUrl: 'https://r2.example.com/file',
                    encryptionVersion: 4,
                });
            },
            { initialProps: { isUnlockedOverride: false } },
        );

        await waitFor(() => {
            expect(result.current.state.kind).toBe('awaitingUnlock');
        });
        expect(result.current.state.isDecrypting).toBe(false);

        await act(async () => {
            rerender({ isUnlockedOverride: true });
            await flushMicrotasks();
        });

        // Machine must leave awaitingUnlock. With the mock rejecting, it
        // lands in `failed`; the critical assertion is that the machine
        // actually transitioned, proving the hook didn't get stuck.
        await waitFor(() => {
            expect(result.current.state.kind).not.toBe('awaitingUnlock');
        });
    });

    it('unsupported encryptionVersion emits translator copy, never isDecrypting=true', async () => {
        mocks.isUnlocked = true;
        const stableFile = sampleFile();

        const { result } = renderHook(() =>
            useFileDecryption({
                file: stableFile,
                isOpen: true,
                rawUrl: 'https://r2.example.com/file',
                encryptionVersion: 3,
            }),
        );

        await waitFor(() => {
            expect(result.current.state.error).not.toBeNull();
        });
        // Translator maps UNSUPPORTED_ENCRYPTION_VERSION → "Unsupported file format"
        // title + "…cannot open." description. state.error carries the description.
        expect(result.current.state.error).toContain('cannot open');
        expect(result.current.state.isDecrypting).toBe(false);
    });
});
