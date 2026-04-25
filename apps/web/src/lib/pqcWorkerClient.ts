import { devWarn } from '@/lib/debugLogger';
import { VaultError } from '@stenvault/shared/errors';
/**
 * PQC Worker Client — Promise-based API for the PQC Web Worker
 *
 * Singleton client that communicates with pqc.worker.ts to isolate
 * all PQC WASM operations from the main thread.
 *
 * IMPORTANT: The worker uses vite-plugin-top-level-await which wraps
 * its code in (async () => { ... })(). This means the worker's
 * self.onmessage is set AFTER an async WASM load. Messages sent
 * before the worker signals 'ready' will be silently dropped.
 * We therefore queue all requests until the ready signal arrives.
 *
 * Usage:
 *   const client = PQCWorkerClient.getInstance();
 *   const { publicKey, secretKey } = await client.mlkem768GenerateKeyPair();
 *
 * @module pqcWorkerClient
 */

// Response types matching pqc.worker.ts — inlined to avoid importing worker module on main thread
interface PQCResponseBase {
    id: string;
    op: string;
}

interface PQCReadyMessage {
    type: 'ready';
}

type PQCWorkerMessage = PQCResponseBase | PQCReadyMessage;

// Timeout for PQC operations (ML-DSA-65 keygen is the slowest ~500ms)
const PQC_OPERATION_TIMEOUT_MS = 30_000;

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

/** Queued message waiting for worker ready signal */
interface QueuedMessage {
    message: Record<string, unknown>;
    transfer?: Transferable[];
}

export class PQCWorkerClient {
    private worker: Worker;
    private pending = new Map<string, PendingRequest>();
    private static instance: PQCWorkerClient | null = null;
    private ready = false;
    private readyPromise: Promise<void>;
    private messageQueue: QueuedMessage[] = [];

    private constructor() {
        devWarn('[PQCWorkerClient] Creating PQC Worker...');
        this.worker = new Worker(
            new URL('./workers/pqc.worker.ts', import.meta.url),
            { type: 'module' }
        );

        // Promise that resolves when worker sends the 'ready' signal
        this.readyPromise = new Promise<void>((resolveReady) => {
            this.worker.onmessage = (event: MessageEvent<PQCWorkerMessage>) => {
                const data = event.data;

                // Handle ready signal — flush queued messages
                if ('type' in data && (data as PQCReadyMessage).type === 'ready') {
                    devWarn('[PQCWorkerClient] Worker ready — flushing', this.messageQueue.length, 'queued messages');
                    this.ready = true;
                    resolveReady();

                    // Flush queued messages now that worker's onmessage is set
                    for (const queued of this.messageQueue) {
                        if (queued.transfer && queued.transfer.length > 0) {
                            this.worker.postMessage(queued.message, { transfer: queued.transfer });
                        } else {
                            this.worker.postMessage(queued.message);
                        }
                    }
                    this.messageQueue = [];
                    return;
                }

                const { id } = data as PQCResponseBase;
                const pending = this.pending.get(id);
                if (!pending) return;

                this.pending.delete(id);
                clearTimeout(pending.timeoutId);

                if ('error' in data && typeof (data as Record<string, unknown>).error === 'string') {
                    const workerMessage = (data as Record<string, unknown>).error as string;
                    pending.reject(new VaultError('INFRA_WORKER_FAILED', {
                        source: 'worker_response',
                        workerMessage,
                    }));
                } else {
                    pending.resolve(data);
                }
            };
        });

        this.worker.onerror = (event) => {
            // Reject all pending requests on worker crash
            devWarn('[PQCWorkerClient] Worker error event:', event.message);
            const error = new VaultError('INFRA_WORKER_FAILED', {
                source: 'onerror',
                workerMessage: event.message,
            }, { cause: event });
            for (const [id, pending] of this.pending) {
                clearTimeout(pending.timeoutId);
                pending.reject(error);
                this.pending.delete(id);
            }
        };
    }

    static getInstance(): PQCWorkerClient {
        if (!PQCWorkerClient.instance) {
            PQCWorkerClient.instance = new PQCWorkerClient();
        }
        return PQCWorkerClient.instance;
    }

    /**
     * Terminate the worker and clear singleton. Used for cleanup/testing.
     */
    terminate(): void {
        this.worker.terminate();
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timeoutId);
            pending.reject(new VaultError('INFRA_WORKER_FAILED', { reason: 'terminated' }));
        }
        this.pending.clear();
        PQCWorkerClient.instance = null;
    }

    // ============ Internal ============

    private sendRequest<T>(message: Record<string, unknown>, transfer?: Transferable[]): Promise<T> {
        const id = crypto.randomUUID();
        const messageWithId = { ...message, id };

        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pending.delete(id);
                devWarn(`[PQCWorkerClient] TIMEOUT after ${PQC_OPERATION_TIMEOUT_MS}ms for op: ${message.op}`);
                reject(new VaultError('INFRA_TIMEOUT', {
                    op: message.op,
                    ms: PQC_OPERATION_TIMEOUT_MS,
                }));
            }, PQC_OPERATION_TIMEOUT_MS);

            this.pending.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeoutId,
            });

            // If worker isn't ready yet, queue the message instead of posting directly
            if (!this.ready) {
                this.messageQueue.push({ message: messageWithId, transfer });
            } else if (transfer && transfer.length > 0) {
                this.worker.postMessage(messageWithId, { transfer });
            } else {
                this.worker.postMessage(messageWithId);
            }
        });
    }

    // ============ ML-KEM-768 ============

    async mlkem768GenerateKeyPair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
        const result = await this.sendRequest<{
            publicKey: Uint8Array;
            secretKey: Uint8Array;
        }>({ op: 'mlkem768-generateKeyPair' });
        return { publicKey: result.publicKey, secretKey: result.secretKey };
    }

    async mlkem768Encapsulate(
        publicKey: Uint8Array
    ): Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }> {
        // Copy before transfer so caller's reference stays valid
        const pubCopy = new Uint8Array(publicKey);
        const result = await this.sendRequest<{
            ciphertext: Uint8Array;
            sharedSecret: Uint8Array;
        }>({ op: 'mlkem768-encapsulate', publicKey: pubCopy }, [pubCopy.buffer]);
        return { ciphertext: result.ciphertext, sharedSecret: result.sharedSecret };
    }

    async mlkem768Decapsulate(
        ciphertext: Uint8Array,
        secretKey: Uint8Array
    ): Promise<Uint8Array> {
        // Copy before transfer
        const ctCopy = new Uint8Array(ciphertext);
        const skCopy = new Uint8Array(secretKey);
        const result = await this.sendRequest<{
            sharedSecret: Uint8Array;
        }>({ op: 'mlkem768-decapsulate', ciphertext: ctCopy, secretKey: skCopy }, [ctCopy.buffer, skCopy.buffer]);
        return result.sharedSecret;
    }

    // ============ ML-DSA-65 ============

    async mldsa65GenerateKeyPair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
        const result = await this.sendRequest<{
            publicKey: Uint8Array;
            secretKey: Uint8Array;
        }>({ op: 'mldsa65-generateKeyPair' });
        return { publicKey: result.publicKey, secretKey: result.secretKey };
    }

    async mldsa65Sign(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
        const msgCopy = new Uint8Array(message);
        const skCopy = new Uint8Array(secretKey);
        const result = await this.sendRequest<{
            signature: Uint8Array;
        }>({ op: 'mldsa65-sign', message: msgCopy, secretKey: skCopy }, [msgCopy.buffer, skCopy.buffer]);
        return result.signature;
    }

    async mldsa65Verify(
        message: Uint8Array,
        signature: Uint8Array,
        publicKey: Uint8Array
    ): Promise<boolean> {
        const msgCopy = new Uint8Array(message);
        const sigCopy = new Uint8Array(signature);
        const pubCopy = new Uint8Array(publicKey);
        const result = await this.sendRequest<{
            valid: boolean;
        }>({ op: 'mldsa65-verify', message: msgCopy, signature: sigCopy, publicKey: pubCopy }, [msgCopy.buffer, sigCopy.buffer, pubCopy.buffer]);
        return result.valid;
    }
}
