/**
 * File Encryptor Web Worker
 *
 * Performs AES-256-GCM (V3) and Hybrid PQC (V4) encryption off the main thread
 * to prevent UI blocking on large files.
 *
 * Security Notes:
 * - V3: CryptoKey is reconstructed from raw key bytes; bytes are zeroed after import
 * - V4: Only public keys are transferred (no secret material)
 * - Encrypted Blob is sent back via structured clone (zero-copy, no ArrayBuffer roundtrip)
 *
 * @module fileEncryptor.worker
 */

import { encryptFileWithKey } from '../fileCrypto';
import { encryptFileHybridAuto } from '../hybridFileCrypto';
import type { HybridPublicKey } from '@stenvault/shared/platform/crypto';
import type { CVEFMetadataV1_2 } from '@stenvault/shared/platform/crypto';

console.warn('[fileEncryptor.worker] Module loaded — all imports resolved');

// ============ Message Types ============

export interface EncryptV3Request {
    type: 'encrypt-v3';
    id: string;
    file: File;
    keyBytes: string; // base64 encoded raw 32-byte AES key
}

export interface EncryptV4Request {
    type: 'encrypt-v4';
    id: string;
    file: File;
    classicalPubKey: string; // base64 encoded X25519 public key
    pqPubKey: string; // base64 encoded ML-KEM-768 public key
}

export type EncryptRequest = EncryptV3Request | EncryptV4Request;

export interface EncryptProgressMessage {
    type: 'progress';
    id: string;
    percentage: number;
}

export interface EncryptV3Result {
    type: 'result';
    id: string;
    success: true;
    encryptedBlob: Blob;
    encryptedData: null;
    iv: string;
    version: 3;
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
    | EncryptV3Result
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
        if (type === 'encrypt-v3') {
            const { file, keyBytes: keyBytesBase64 } = event.data as EncryptV3Request;

            // Reconstruct CryptoKey from raw bytes
            const keyBytes = base64ToBytes(keyBytesBase64);
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                keyBytes,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );
            // Zero raw key bytes immediately after import
            keyBytes.fill(0);

            // Encrypt using existing V3 function
            const result = await encryptFileWithKey(file, cryptoKey);

            // Send Blob directly via structured clone (no ArrayBuffer roundtrip)
            (self as unknown as Worker).postMessage({
                type: 'result',
                id,
                success: true,
                encryptedBlob: result.blob,
                encryptedData: null,
                iv: result.iv,
                version: 3,
            } satisfies EncryptV3Result);
        } else if (type === 'encrypt-v4') {
            const { file, classicalPubKey, pqPubKey } = event.data as EncryptV4Request;
            console.warn('[fileEncryptor.worker] V4 encrypt request, file size:', file.size);

            // Reconstruct HybridPublicKey from base64
            const publicKey: HybridPublicKey = {
                classical: base64ToBytes(classicalPubKey),
                postQuantum: base64ToBytes(pqPubKey),
            };

            // Encrypt using existing V4 function (auto-selects streaming for >100MB)
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
