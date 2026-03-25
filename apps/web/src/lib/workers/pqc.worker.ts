/**
 * PQC Web Worker — Isolates WASM memory from the main thread
 *
 * All ML-KEM-768 and ML-DSA-65 operations run in this worker so that
 * XSS on the main thread cannot read the WASM linear memory buffer
 * (which contains PQC private keys during active operations).
 *
 * Security model:
 * - Main thread sends only public keys / ciphertexts / messages
 * - Worker returns results via postMessage (Transferable for zero-copy)
 * - @stenvault/pqc-wasm handles WASM memory cleanup via ZeroizeOnDrop
 * - Worker context is a separate JS execution environment
 *
 * @module pqc.worker
 */

import {
    generateKemKeyPair,
    encapsulate,
    decapsulate,
    generateSignatureKeyPair,
    sign,
    verify,
} from '@stenvault/pqc-wasm';

console.warn('[pqc.worker] Module loaded — @stenvault/pqc-wasm imports resolved successfully');

// ============ Message Types ============

export type PQCRequest =
    | { id: string; op: 'mlkem768-generateKeyPair' }
    | { id: string; op: 'mlkem768-encapsulate'; publicKey: Uint8Array }
    | { id: string; op: 'mlkem768-decapsulate'; ciphertext: Uint8Array; secretKey: Uint8Array }
    | { id: string; op: 'mldsa65-generateKeyPair' }
    | { id: string; op: 'mldsa65-sign'; message: Uint8Array; secretKey: Uint8Array }
    | { id: string; op: 'mldsa65-verify'; message: Uint8Array; signature: Uint8Array; publicKey: Uint8Array };

export type PQCResponse =
    | { id: string; op: string; error: string }
    | { id: string; op: 'mlkem768-generateKeyPair'; publicKey: Uint8Array; secretKey: Uint8Array }
    | { id: string; op: 'mlkem768-encapsulate'; ciphertext: Uint8Array; sharedSecret: Uint8Array }
    | { id: string; op: 'mlkem768-decapsulate'; sharedSecret: Uint8Array }
    | { id: string; op: 'mldsa65-generateKeyPair'; publicKey: Uint8Array; secretKey: Uint8Array }
    | { id: string; op: 'mldsa65-sign'; signature: Uint8Array }
    | { id: string; op: 'mldsa65-verify'; valid: boolean }
    | { type: 'ready' };

// ============ Worker Message Handler ============

self.onmessage = async (event: MessageEvent<PQCRequest>) => {
    const { id, op } = event.data;
    console.warn('[pqc.worker] Received op:', op, 'id:', id);

    try {
        switch (op) {
            // ---- ML-KEM-768 ----

            case 'mlkem768-generateKeyPair': {
                const kp = await generateKemKeyPair();
                const pub = new Uint8Array(kp.publicKey);
                const sec = new Uint8Array(kp.secretKey);
                (self as unknown as Worker).postMessage(
                    { id, op, publicKey: pub, secretKey: sec } satisfies PQCResponse,
                    { transfer: [pub.buffer, sec.buffer] }
                );
                break;
            }

            case 'mlkem768-encapsulate': {
                const { publicKey } = event.data as Extract<PQCRequest, { op: 'mlkem768-encapsulate' }>;
                const result = await encapsulate(publicKey);
                const ct = new Uint8Array(result.ciphertext);
                const ss = new Uint8Array(result.sharedSecret);
                (self as unknown as Worker).postMessage(
                    { id, op, ciphertext: ct, sharedSecret: ss } satisfies PQCResponse,
                    { transfer: [ct.buffer, ss.buffer] }
                );
                break;
            }

            case 'mlkem768-decapsulate': {
                const { ciphertext, secretKey } = event.data as Extract<PQCRequest, { op: 'mlkem768-decapsulate' }>;
                const ss = new Uint8Array(await decapsulate(ciphertext, secretKey));
                (self as unknown as Worker).postMessage(
                    { id, op, sharedSecret: ss } satisfies PQCResponse,
                    { transfer: [ss.buffer] }
                );
                break;
            }

            // ---- ML-DSA-65 ----

            case 'mldsa65-generateKeyPair': {
                const kp = await generateSignatureKeyPair();
                const pub = new Uint8Array(kp.publicKey);
                const sec = new Uint8Array(kp.secretKey);
                (self as unknown as Worker).postMessage(
                    { id, op, publicKey: pub, secretKey: sec } satisfies PQCResponse,
                    { transfer: [pub.buffer, sec.buffer] }
                );
                break;
            }

            case 'mldsa65-sign': {
                const { message, secretKey } = event.data as Extract<PQCRequest, { op: 'mldsa65-sign' }>;
                const sig = new Uint8Array(await sign(message, secretKey));
                (self as unknown as Worker).postMessage(
                    { id, op, signature: sig } satisfies PQCResponse,
                    { transfer: [sig.buffer] }
                );
                break;
            }

            case 'mldsa65-verify': {
                const { message, signature, publicKey } = event.data as Extract<PQCRequest, { op: 'mldsa65-verify' }>;
                const valid = await verify(message, signature, publicKey);
                (self as unknown as Worker).postMessage(
                    { id, op, valid } satisfies PQCResponse
                );
                break;
            }

            default:
                self.postMessage({ id, op, error: `Unknown PQC operation: ${op}` });
        }
    } catch (error) {
        self.postMessage({
            id,
            op,
            error: error instanceof Error ? error.message : 'PQC Worker operation failed',
        });
    }
};

// Signal readiness
self.postMessage({ type: 'ready' });
