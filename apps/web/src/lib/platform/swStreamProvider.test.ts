/**
 * swStreamProvider — VaultError contract tests.
 *
 * Covers the three raw-Error sites migrated in this change:
 *   - SW registered but not active → INFRA_SW_UNAVAILABLE
 *   - metadata.chunked absent → MISSING_METADATA(not_chunked)
 *   - SW port1 responds with { ok: false, error } → INFRA_WORKER_FAILED(sw_response)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VaultError as VaultErrorType } from '@stenvault/shared/errors';
import type { CVEFMetadata } from '@stenvault/shared/platform/crypto';

// Happy-dom's MessagePort doesn't reliably deliver messages across a
// MessageChannel in tests, so we replace it with a minimal pair that
// routes postMessage → counterpart.onmessage synchronously.
class FakePort {
    public otherEnd: FakePort | null = null;
    public onmessage: ((e: MessageEvent) => void) | null = null;
    postMessage(data: unknown): void {
        if (!this.otherEnd) return;
        const ev = { data } as unknown as MessageEvent;
        this.otherEnd.onmessage?.(ev);
    }
    start(): void {
        /* noop */
    }
    close(): void {
        /* noop */
    }
    addEventListener(type: string, cb: (e: MessageEvent) => void): void {
        if (type === 'message') this.onmessage = cb;
    }
    removeEventListener(): void {
        /* noop */
    }
}

class FakeMessageChannel {
    public readonly port1 = new FakePort();
    public readonly port2 = new FakePort();
    constructor() {
        this.port1.otherEnd = this.port2;
        this.port2.otherEnd = this.port1;
    }
}

function stubServiceWorker(
    registration: Partial<ServiceWorkerRegistration>,
    controllerPresent = false,
): void {
    const fakeContainer = {
        register: vi.fn().mockResolvedValue(registration),
        controller: controllerPresent ? ({} as ServiceWorker) : null,
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
    const mod = await import('./swStreamProvider');
    const errors = await import('@stenvault/shared/errors');
    return { mod, VaultError: errors.VaultError };
}

function chunkedMetadata(): CVEFMetadata {
    return {
        version: '1.4',
        iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
        pqcParams: {
            classicalPublicKey: '',
            classicalCiphertext: '',
            pqPublicKey: '',
            pqCiphertext: '',
            wrappedFileKey: '',
        },
        chunked: { count: 2, chunkSize: 65536 },
        signature: null,
    } as unknown as CVEFMetadata;
}

function nonChunkedMetadata(): CVEFMetadata {
    return {
        version: '1.4',
        iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
        pqcParams: {
            classicalPublicKey: '',
            classicalCiphertext: '',
            pqPublicKey: '',
            pqCiphertext: '',
            wrappedFileKey: '',
        },
        signature: null,
    } as unknown as CVEFMetadata;
}

function sampleOptions(metadata: CVEFMetadata) {
    return {
        fileKeyBytes: new Uint8Array(32),
        metadata,
        headerBytes: new Uint8Array(16),
        r2Url: 'https://example.com/encrypted.bin',
        plaintextSize: 1024,
        mimeType: 'video/mp4',
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('swStreamProvider — VaultError contract', () => {
    it('active SW is null → VaultError(INFRA_SW_UNAVAILABLE)', async () => {
        stubServiceWorker({ active: null, installing: null, waiting: null }, true);
        const { mod, VaultError } = await loadModule();

        const err = await mod
            .registerStream(sampleOptions(chunkedMetadata()))
            .catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultErrorType).code).toBe('INFRA_SW_UNAVAILABLE');
        expect((err as VaultErrorType).context.op).toBe('register_stream');
    });

    it('non-chunked metadata → VaultError(MISSING_METADATA, not_chunked)', async () => {
        const activeWorker = { postMessage: vi.fn(), state: 'activated' };
        stubServiceWorker(
            {
                active: activeWorker as unknown as ServiceWorker,
                installing: null,
                waiting: null,
            },
            true,
        );
        const { mod, VaultError } = await loadModule();

        const err = await mod
            .registerStream(sampleOptions(nonChunkedMetadata()))
            .catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultErrorType).code).toBe('MISSING_METADATA');
        expect((err as VaultErrorType).context.op).toBe('register_stream');
        expect((err as VaultErrorType).context.reason).toBe('not_chunked');
    });

    it('SW port1 returns { ok: false, error } → VaultError(INFRA_WORKER_FAILED, sw_response)', async () => {
        vi.stubGlobal('MessageChannel', FakeMessageChannel);

        const activeWorker = {
            postMessage: vi.fn((_msg: unknown, transferables?: Transferable[]) => {
                const port = transferables?.find(
                    (t): t is FakePort => t instanceof FakePort,
                );
                if (port) {
                    queueMicrotask(() => {
                        port.postMessage({ ok: false, error: 'bad-key' });
                    });
                }
            }),
            state: 'activated',
        };
        stubServiceWorker(
            {
                active: activeWorker as unknown as ServiceWorker,
                installing: null,
                waiting: null,
            },
            true,
        );
        const { mod, VaultError } = await loadModule();

        const err = await mod
            .registerStream(sampleOptions(chunkedMetadata()))
            .catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultErrorType).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultErrorType).context.op).toBe('register_stream');
        expect((err as VaultErrorType).context.source).toBe('sw_response');
        expect((err as VaultErrorType).context.swMessage).toBe('bad-key');
    });
});
