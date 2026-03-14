/**
 * Media Decryptor Web Worker
 * 
 * Performs AES-GCM decryption off the main thread to prevent UI blocking.
 * Used for large encrypted media files (video, audio, images).
 * 
 * Security Notes:
 * - CryptoKey is reconstructed in worker from raw key bytes
 * - Key bytes are cleared after import
 * - Uses Web Crypto API for hardware-accelerated decryption
 * 
 * @module mediaDecryptor.worker
 */


export interface DecryptRequest {
    type: 'decrypt';
    id: string;
    encryptedData: ArrayBuffer;
    keyBytes: string; // base64 encoded
    iv: string; // base64 encoded
    version: number; // 3 = Master Key, 4 = Hybrid PQC
}

export interface ProgressMessage {
    type: 'progress';
    id: string;
    percentage: number;
    bytesProcessed: number;
    totalBytes: number;
}

export interface ResultMessage {
    type: 'result';
    id: string;
    success: true;
    decryptedData: ArrayBuffer;
}

export interface ErrorMessage {
    type: 'error';
    id: string;
    success: false;
    error: string;
}

export type WorkerMessage = ProgressMessage | ResultMessage | ErrorMessage;


/**
 * Decode base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes as Uint8Array<ArrayBuffer>;
}

/**
 * Import raw key bytes as CryptoKey for AES-GCM
 */
async function importKey(keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM', length: 256 },
        false, // not extractable (security)
        ['decrypt']
    );
}

/**
 * Zero out ArrayBuffer for security
 */
function zeroBuffer(buffer: Uint8Array): void {
    buffer.fill(0);
}


/**
 * Decrypt encrypted data using AES-256-GCM
 */
async function decryptData(
    encryptedData: ArrayBuffer,
    keyBytes: Uint8Array<ArrayBuffer>,
    iv: Uint8Array<ArrayBuffer>,
    id: string
): Promise<ArrayBuffer> {
    // Report start
    self.postMessage({
        type: 'progress',
        id,
        percentage: 5,
        bytesProcessed: 0,
        totalBytes: encryptedData.byteLength,
    } satisfies ProgressMessage);

    // Import the key (20% progress)
    const cryptoKey = await importKey(keyBytes);

    // Zero out key bytes immediately after import
    zeroBuffer(keyBytes);

    self.postMessage({
        type: 'progress',
        id,
        percentage: 20,
        bytesProcessed: 0,
        totalBytes: encryptedData.byteLength,
    } satisfies ProgressMessage);

    // Perform decryption (this is the main operation)
    // Note: Web Crypto decrypt is atomic, no chunk-level progress available
    const decryptedData = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        cryptoKey,
        encryptedData
    );

    // Report completion
    self.postMessage({
        type: 'progress',
        id,
        percentage: 100,
        bytesProcessed: decryptedData.byteLength,
        totalBytes: encryptedData.byteLength,
    } satisfies ProgressMessage);

    return decryptedData;
}


self.onmessage = async (event: MessageEvent<DecryptRequest>) => {
    const { type, id, encryptedData, keyBytes: keyBytesBase64, iv: ivBase64, version } = event.data;

    if (type !== 'decrypt') {
        self.postMessage({
            type: 'error',
            id: id || 'unknown',
            success: false,
            error: `Unknown message type: ${type}`,
        } satisfies ErrorMessage);
        return;
    }

    try {
        // Decode base64 inputs
        const keyBytes = base64ToBytes(keyBytesBase64);
        const iv = base64ToBytes(ivBase64);

        // Validate inputs
        if (keyBytes.length !== 32) {
            throw new Error(`Invalid key length: expected 32 bytes, got ${keyBytes.length}`);
        }
        if (iv.length !== 12) {
            throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
        }

        // Perform decryption
        const decryptedData = await decryptData(encryptedData, keyBytes, iv, id);

        // Send result with Transferable for zero-copy
        (self as unknown as Worker).postMessage(
            {
                type: 'result',
                id,
                success: true,
                decryptedData,
            } satisfies ResultMessage,
            { transfer: [decryptedData] }
        );
    } catch (error) {
        const errorMessage = error instanceof Error
            ? error.message
            : 'Decryption failed. Invalid key or corrupted data.';

        self.postMessage({
            type: 'error',
            id,
            success: false,
            error: errorMessage,
        } satisfies ErrorMessage);
    }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
