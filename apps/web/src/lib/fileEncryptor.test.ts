/**
 * fileEncryptor — worker error contract tests.
 *
 * Drives every worker-layer failure path through `encryptV4InWorker`
 * using a `MockWorker` stub and asserts the resulting `VaultError`
 * carries the expected `code` and `context`. Real encryption is
 * covered by the hybridFile suites and the end-to-end upload tests;
 * this file is scoped to the main-thread wrapper's error contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import { encryptV4InWorker, terminateEncryptWorker } from './fileEncryptor';
import type { HybridPublicKey } from '@stenvault/shared/platform/crypto';

class MockWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    public onerror: ((e: ErrorEvent) => void) | null = null;
    public readonly posted: Array<Record<string, unknown>> = [];
    public listeners: {
        message: Array<(e: MessageEvent) => void>;
        error: Array<(e: ErrorEvent) => void>;
    } = { message: [], error: [] };

    postMessage(msg: Record<string, unknown>, _transfer?: unknown): void {
        this.posted.push(msg);
    }

    addEventListener(type: 'message' | 'error', handler: (e: Event) => void): void {
        if (type === 'message') this.listeners.message.push(handler as (e: MessageEvent) => void);
        if (type === 'error') this.listeners.error.push(handler as (e: ErrorEvent) => void);
    }

    removeEventListener(type: 'message' | 'error', handler: (e: Event) => void): void {
        if (type === 'message') this.listeners.message = this.listeners.message.filter(h => h !== handler);
        if (type === 'error') this.listeners.error = this.listeners.error.filter(h => h !== handler);
    }

    terminate(): void {
        // no-op
    }

    respond(payload: object): void {
        const ev = new MessageEvent('message', { data: payload });
        for (const h of this.listeners.message) h(ev);
    }

    fireReady(): void {
        this.respond({ type: 'ready' });
    }

    fireError(message = 'boom'): void {
        const ev = new ErrorEvent('error', { message });
        for (const h of this.listeners.error) h(ev);
    }

    lastPostedId(): string {
        const last = this.posted[this.posted.length - 1];
        if (!last) throw new Error('no message posted');
        return last.id as string;
    }
}

let lastWorker: MockWorker;

// Flush enough microtasks to let an async function cross two awaits
// (`await waitForWorkerReady()` inside `encryptV4InWorker`, then the
// Promise executor). Empirically two ticks is sufficient.
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function testFile(): File {
    return new File([new Uint8Array(16)], 'f.bin');
}

function testPublicKey(): HybridPublicKey {
    return {
        classical: new Uint8Array(32),
        postQuantum: new Uint8Array(1184),
    };
}

beforeEach(() => {
    terminateEncryptWorker();
    vi.stubGlobal('Worker', class {
        constructor() {
            lastWorker = new MockWorker();
            return lastWorker as unknown as Worker;
        }
    });
});

afterEach(() => {
    terminateEncryptWorker();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('fileEncryptor — worker error contract', () => {
    it('throws VaultError(INFRA_WORKER_FAILED) when the Worker constructor throws', async () => {
        vi.stubGlobal('Worker', class {
            constructor() {
                throw new Error('CSP blocked Worker construction');
            }
        });

        const err = await encryptV4InWorker(testFile(), testPublicKey()).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultError).context.op).toBe('file_encrypt');
        expect((err as VaultError).context.reason).toBe('unavailable');
    });

    it('rejects VaultError(INFRA_WORKER_FAILED) on worker-reported error', async () => {
        const pending = encryptV4InWorker(testFile(), testPublicKey());
        await Promise.resolve();
        lastWorker.fireReady();
        await flushMicrotasks();

        const id = lastWorker.lastPostedId();
        lastWorker.respond({ type: 'error', id, error: 'ml-kem encaps failed' });

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultError).context.op).toBe('file_encrypt');
        expect((err as VaultError).context.source).toBe('worker_response');
        expect((err as VaultError).context.workerMessage).toBe('ml-kem encaps failed');
    });

    it('rejects VaultError(INFRA_WORKER_FAILED) with cause on worker.onerror crash', async () => {
        const pending = encryptV4InWorker(testFile(), testPublicKey());
        await Promise.resolve();
        lastWorker.fireReady();
        await flushMicrotasks();

        lastWorker.fireError('oom');

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultError).context.op).toBe('file_encrypt');
        expect((err as VaultError).context.source).toBe('onerror');
        expect((err as VaultError).context.workerMessage).toBe('oom');
        expect((err as VaultError).cause).toBeInstanceOf(ErrorEvent);
    });

    it('rejects VaultError(INFRA_TIMEOUT) when the 5-minute timeout elapses', async () => {
        vi.useFakeTimers();

        const pending = encryptV4InWorker(testFile(), testPublicKey());
        await Promise.resolve();
        lastWorker.fireReady();
        await vi.advanceTimersByTimeAsync(0);

        vi.advanceTimersByTime(5 * 60 * 1000 + 1);

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_TIMEOUT');
        expect((err as VaultError).context.op).toBe('file_encrypt');
        expect((err as VaultError).context.ms).toBe(5 * 60 * 1000);
    });
});
