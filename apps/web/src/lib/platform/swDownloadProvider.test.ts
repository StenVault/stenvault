/**
 * swDownloadProvider — VaultError contract tests.
 *
 * Covers the two raw-Error sites migrated in this change:
 *   - SW is registered but not active → INFRA_SW_UNAVAILABLE
 *   - SW registration ACK never arrives within 1s → INFRA_TIMEOUT
 *
 * Plus drain-loop hardening (post-2026-05 fix):
 *   - drain watchdog fires when ACKs never arrive (SW idle-killed mid-stream)
 *   - abort during drain wakes the await via the signal listener
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

// ============ Drain loop hardening ============

/**
 * Stub MessagePort + MessageChannel so we can control the REGISTERED
 * handshake and selectively withhold ACKs without depending on happy-dom's
 * partial MessageChannel implementation.
 */
type FakePort = {
    onmessage: ((e: { data: unknown }) => void) | null;
    postMessage: (data: unknown, transfer?: unknown[]) => void;
    fire: (data: unknown) => void;
};

function installFakeMessageChannel(): { getLastChannel: () => { port1: FakePort; port2: FakePort } | null } {
    let lastChannel: { port1: FakePort; port2: FakePort } | null = null;

    function makePort(): FakePort {
        let handler: ((e: { data: unknown }) => void) | null = null;
        return {
            get onmessage() { return handler; },
            set onmessage(h: ((e: { data: unknown }) => void) | null) { handler = h; },
            postMessage: vi.fn(),
            fire(data: unknown) { handler?.({ data }); },
        };
    }

    class FakeMessageChannel {
        port1: FakePort;
        port2: FakePort;
        constructor() {
            this.port1 = makePort();
            this.port2 = makePort();
            lastChannel = this;
        }
    }

    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    return { getLastChannel: () => lastChannel };
}

/**
 * Stub the iframe DOM ops used by the SW provider so we don't actually
 * navigate or pollute the test document. iframe.src is a plain setter on
 * the spy; appendChild/removeChild are noops.
 */
function stubIframeDom() {
    const fakeIframe = {
        hidden: false,
        src: '',
        remove: vi.fn(),
    };
    const createSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
            if (tag === 'iframe') return fakeIframe as unknown as HTMLElement;
            return document.createElement(tag);
        });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    return { fakeIframe, createSpy };
}

/** Single-chunk stream so the read loop posts exactly one chunk and then
 *  enters the drain loop with `inflight === 1`. */
function singleChunkStream(): ReadableStream<Uint8Array> {
    let pulled = false;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (pulled) {
                controller.close();
                return;
            }
            pulled = true;
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        },
    });
}

describe('swDownloadProvider — drain loop hardening', () => {
    it('drain watchdog fires when no ACK arrives → VaultError(INFRA_TIMEOUT) op=sw_drain_ack', async () => {
        vi.useFakeTimers();
        const { getLastChannel } = installFakeMessageChannel();
        stubIframeDom();

        const activeWorker = {
            postMessage: vi.fn((msg: { type?: string }) => {
                // REGISTER_DOWNLOAD → respond REGISTERED synchronously so we
                // exit the registration await. Subsequent posts (chunks, END)
                // never get ACKed → drain loop hangs until watchdog.
                if (msg?.type === 'REGISTER_DOWNLOAD') {
                    getLastChannel()?.port1.fire({ type: 'REGISTERED' });
                }
            }),
            state: 'activated',
        };
        stubServiceWorker({
            active: activeWorker as unknown as ServiceWorker,
            installing: null,
            waiting: null,
        });
        const { mod, VaultError } = await loadModule();

        const pending = mod.streamViaServiceWorker(
            singleChunkStream(),
            { filename: 'f.bin', mimeType: 'application/octet-stream', totalSize: 4 },
        );
        const caught = pending.catch((e: unknown) => e);

        // Let the read loop pump its single chunk + enter drain.
        await vi.advanceTimersByTimeAsync(0);
        // Watchdog fires at 15s.
        await vi.advanceTimersByTimeAsync(15_001);

        const err = await caught;
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultErrorType).code).toBe('INFRA_TIMEOUT');
        expect((err as VaultErrorType).context.op).toBe('sw_drain_ack');
        expect((err as VaultErrorType).context.ms).toBe(15_000);
    });

    it('abort during drain → DOMException(AbortError) without waiting for watchdog', async () => {
        vi.useFakeTimers();
        const { getLastChannel } = installFakeMessageChannel();
        stubIframeDom();

        const activeWorker = {
            postMessage: vi.fn((msg: { type?: string }) => {
                if (msg?.type === 'REGISTER_DOWNLOAD') {
                    getLastChannel()?.port1.fire({ type: 'REGISTERED' });
                }
            }),
            state: 'activated',
        };
        stubServiceWorker({
            active: activeWorker as unknown as ServiceWorker,
            installing: null,
            waiting: null,
        });
        const { mod } = await loadModule();

        const controller = new AbortController();
        const pending = mod.streamViaServiceWorker(
            singleChunkStream(),
            {
                filename: 'f.bin',
                mimeType: 'application/octet-stream',
                totalSize: 4,
                signal: controller.signal,
            },
        );
        const caught = pending.catch((e: unknown) => e);

        // Run microtasks so the read loop posts its chunk and parks in drain.
        await vi.advanceTimersByTimeAsync(0);

        // Abort before the watchdog (15s) — listener must wake the await.
        controller.abort();
        await vi.advanceTimersByTimeAsync(0);

        const err = await caught;
        expect(err).toBeInstanceOf(DOMException);
        expect((err as DOMException).name).toBe('AbortError');
    });
});
