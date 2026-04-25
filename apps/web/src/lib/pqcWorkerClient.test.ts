/**
 * pqcWorkerClient — error contract tests.
 *
 * Goal: prove that every worker-layer failure surfaces as a `VaultError`
 * with the expected `code`. The singleton constructs a real `Worker` in
 * its constructor, so we stub `globalThis.Worker` with a `MockWorker`
 * that captures the `onmessage` / `onerror` handlers assigned by
 * `PQCWorkerClient` and exposes test-only helpers.
 *
 * `terminate()` resets the singleton (`instance = null`), which lets us
 * create a fresh client between tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import { PQCWorkerClient } from './pqcWorkerClient';

class MockWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    public onerror: ((e: ErrorEvent) => void) | null = null;
    public readonly posted: Array<Record<string, unknown>> = [];

    postMessage(msg: Record<string, unknown>, _opts?: { transfer?: Transferable[] }): void {
        this.posted.push(msg);
    }

    terminate(): void {
        // no-op for tests
    }

    // --- test helpers ---

    fireReady(): void {
        this.onmessage?.(new MessageEvent('message', { data: { type: 'ready' } }));
    }

    respond(payload: object): void {
        this.onmessage?.(new MessageEvent('message', { data: payload }));
    }

    fireError(message = 'boom'): void {
        this.onerror?.(new ErrorEvent('error', { message }));
    }

    lastPostedId(): string {
        const last = this.posted[this.posted.length - 1];
        if (!last) throw new Error('no message posted');
        return last.id as string;
    }
}

// Shared handle so `beforeEach` can both set up the stub and expose the
// most recently-constructed mock to test bodies.
let lastWorker: MockWorker;

beforeEach(() => {
    vi.stubGlobal('Worker', class {
        constructor() {
            lastWorker = new MockWorker();
            return lastWorker as unknown as Worker;
        }
    });
});

afterEach(() => {
    // Drain pending rejections so Vitest doesn't flag unhandled promises.
    try {
        PQCWorkerClient.getInstance().terminate();
    } catch {
        // singleton may already be torn down by the test
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('pqcWorkerClient — error contract', () => {
    it('worker-reported error rejects with VaultError(INFRA_WORKER_FAILED)', async () => {
        const client = PQCWorkerClient.getInstance();
        lastWorker.fireReady();

        const pending = client.mlkem768GenerateKeyPair();
        // Allow the request to be posted after the ready signal flushes the queue.
        await Promise.resolve();
        const id = lastWorker.lastPostedId();
        lastWorker.respond({ id, op: 'mlkem768-generateKeyPair', error: 'wasm init failed' });

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultError).context.source).toBe('worker_response');
        expect((err as VaultError).context.workerMessage).toBe('wasm init failed');
    });

    it('worker.onerror rejects pending with VaultError(INFRA_WORKER_FAILED) and preserves cause', async () => {
        const client = PQCWorkerClient.getInstance();
        lastWorker.fireReady();

        const pending = client.mlkem768GenerateKeyPair();
        await Promise.resolve();
        lastWorker.fireError('boom');

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultError).context.source).toBe('onerror');
        expect((err as VaultError).context.workerMessage).toBe('boom');
        expect((err as VaultError).cause).toBeInstanceOf(ErrorEvent);
    });

    it('operation timeout rejects with VaultError(INFRA_TIMEOUT) carrying op + ms', async () => {
        vi.useFakeTimers();
        const client = PQCWorkerClient.getInstance();
        lastWorker.fireReady();

        const pending = client.mlkem768GenerateKeyPair();
        // Do NOT respond; advance past the 30s timeout window.
        vi.advanceTimersByTime(30_001);

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_TIMEOUT');
        expect((err as VaultError).context.op).toBe('mlkem768-generateKeyPair');
        expect((err as VaultError).context.ms).toBe(30_000);
    });

    it('terminate() with a pending request rejects with VaultError(INFRA_WORKER_FAILED)', async () => {
        const client = PQCWorkerClient.getInstance();
        lastWorker.fireReady();

        const pending = client.mlkem768GenerateKeyPair();
        await Promise.resolve();
        client.terminate();

        const err = await pending.catch((e: unknown) => e);
        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_WORKER_FAILED');
        expect((err as VaultError).context.reason).toBe('terminated');
    });
});
