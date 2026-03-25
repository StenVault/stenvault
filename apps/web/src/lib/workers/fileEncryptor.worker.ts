/**
 * File Encryptor Web Worker
 *
 * Performs Hybrid PQC (V4) encryption off the main thread
 * to prevent UI blocking on large files.
 *
 * Security Notes:
 * - Only public keys are transferred (no secret material)
 * - Encrypted Blob is sent back via structured clone (zero-copy, no ArrayBuffer roundtrip)
 *
 * @module fileEncryptor.worker
 */

import { encryptFileHybridAuto } from '../hybridFileCrypto';
import type { HybridPublicKey } from '@stenvault/shared/platform/crypto';
import type { CVEFMetadataV1_2 } from '@stenvault/shared/platform/crypto';

console.warn('[fileEncryptor.worker] Module loaded — all imports resolved');

// ============ Message Types ============

export interface EncryptV4Request {
    type: 'encrypt-v4';
    id: string;
    file: File;
    classicalPubKey: string; // base64 encoded X25519 public key
    pqPubKey: string; // base64 encoded ML-KEM-768 public key
}

export type EncryptRequest = EncryptV4Request;

export interface EncryptProgressMessage {
    type: 'progress';
    id: string;
    percentage: number;
}

export interface EncryptV4Result {
    type: 'result';
    id: string;
    success: true;
    encryptedBlob: Blob;
    encryptedData: null;
    metadata: CVEFMetadataV1_2;
    originalSize: number;
    version: 4;
}

export interface EncryptErrorMessage {
    type: 'error';
    id: string;
    success: false;
    error: string;
}

export type EncryptWorkerMessage =
    | EncryptProgressMessage
    | EncryptV4Result
    | EncryptErrorMessage;

// ============ Helper Functions ============

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes as Uint8Array<ArrayBuffer>;
}

// ============ Worker Message Handler ============

self.onmessage = async (event: MessageEvent<EncryptRequest>) => {
    const { type, id } = event.data;

    try {
        if (type === 'encrypt-v4') {
            const { file, classicalPubKey, pqPubKey } = event.data as EncryptV4Request;
            console.warn('[fileEncryptor.worker] V4 encrypt request, file size:', file.size);

            // Reconstruct HybridPublicKey from base64
            const publicKey: HybridPublicKey = {
                classical: base64ToBytes(classicalPubKey),
                postQuantum: base64ToBytes(pqPubKey),
            };

            // Encrypt using V4 function (auto-selects streaming for >100MB)
            const result = await encryptFileHybridAuto(file, {
                publicKey,
                onProgress: (p) => {
                    self.postMessage({
                        type: 'progress',
                        id,
                        percentage: p.percentage,
                    } satisfies EncryptProgressMessage);
                },
            });

            // Send Blob directly via structured clone (no ArrayBuffer roundtrip)
            (self as unknown as Worker).postMessage({
                type: 'result',
                id,
                success: true,
                encryptedBlob: result.blob,
                encryptedData: null,
                metadata: result.metadata,
                originalSize: result.originalSize,
                version: 4,
            } satisfies EncryptV4Result);
        } else {
            self.postMessage({
                type: 'error',
                id: id || 'unknown',
                success: false,
                error: `Unknown message type: ${type}`,
            } satisfies EncryptErrorMessage);
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            id,
            success: false,
            error: error instanceof Error ? error.message : 'Encryption failed',
        } satisfies EncryptErrorMessage);
    }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
