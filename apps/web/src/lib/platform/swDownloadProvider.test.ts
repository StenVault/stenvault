/**
 * swDownloadProvider — VaultError contract tests.
 *
 * Covers the two raw-Error sites migrated in this change:
 *   - SW is registered but not active → INFRA_SW_UNAVAILABLE
 *   - SW registration ACK never arrives within 1s → INFRA_TIMEOUT
 *
 * The AbortError DOMException path at the while-loop abort check is
 * exercised end-to-end by streamingDownload.test.ts (which asserts
 * toThrow('Download aborted')). We don't duplicate that here because
 * reaching the abort check requires happy-dom MessageChannel semantics
 * that aren't relevant to the error-contract surface.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VaultError as VaultErrorType } from '@stenvault/shared/errors';

function stubServiceWorker(registration: Partial<ServiceWorkerRegistration>): void {
    const fakeContainer = {
        register: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
        value: fakeContainer,
        configurable: true,
        writable: true,
    });
}

// vi.resetModules() creates a fresh module graph, so VaultError must be
// re-imported from the same graph — otherwise `instanceof` fails against
// the top-level import.
async function loadModule() {
    vi.resetModules();
    const mod = await import('./swDownloadProvider');
    const errors = await import('@stenvault/shared/errors');
    return { mod, VaultError: errors.VaultError };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('swDownloadProvider — VaultError contract', () => {
    it('active SW is null → VaultError(INFRA_SW_UNAVAILABLE)', async () => {
        stubServiceWorker({ active: null, installing: null, waiting: null });
        const { mod, VaultError } = await loadModule();

        const err = await mod.streamViaServiceWorker(
            new ReadableStream(),
            { filename: 'f.bin', mimeType: 'application/octet-stream', totalSize: 0 },
        ).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultErrorType).code).toBe('INFRA_SW_UNAVAILABLE');
        expect((err as VaultErrorType).context.op).toBe('download_stream');
    });

    it('ACK never arrives within 1s → VaultError(INFRA_TIMEOUT)', async () => {
        vi.useFakeTimers();

        const activeWorker = {
            postMessage: vi.fn(),
            state: 'activated',
        };
        stubServiceWorker({
            active: activeWorker as unknown as ServiceWorker,
            installing: null,
            waiting: null,
        });
        const { mod, VaultError } = await loadModule();

        const pending = mod.streamViaServiceWorker(
            new ReadableStream(),
            { filename: 'f.bin', mimeType: 'application/octet-stream', totalSize: 0 },
        );

        const caught = pending.catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(1001);
        const err = await caught;

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultErrorType).code).toBe('INFRA_TIMEOUT');
        expect((err as VaultErrorType).context.op).toBe('sw_register_download');
        expect((err as VaultErrorType).context.ms).toBe(1000);
    });
});
