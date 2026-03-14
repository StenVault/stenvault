/**
 * E2E Encryption Module for P2P Transfers
 *
 * Provides End-to-End encryption for P2P file transfers.
 * Works with "double" and "shamir" encryption methods.
 *
 * Flow (X25519 ECDH):
 * 1. Both peers have X25519 key pairs (generated during session setup)
 * 2. Sender: ECDH(senderPrivate, receiverPublic) → shared AES key
 * 3. Sender encrypts each chunk with AES-GCM (unique nonce per chunk)
 * 4. Sender includes IV in manifest
 * 5. Receiver: ECDH(receiverPrivate, senderPublic) → same shared AES key
 * 6. Receiver decrypts each chunk
 *
 * @module lib/p2p/e2eEncryption
 */

import type { EncryptionMethod } from "@/components/p2p/types";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/platform";
import { deriveSharedKey } from "@/lib/p2pCrypto";


export interface E2ESession {
    /** AES key for encrypting/decrypting file data (derived from ECDH) */
    aesKey: CryptoKey;
    /** IV for AES-GCM (unique per session) */
    iv: Uint8Array;
}

export interface E2EManifestData {
    /** Base64 encoded IV */
    iv: string;
}


const AES_ALGORITHM = {
    name: "AES-GCM",
    length: 256,
};


/**
 * Initialize E2E encryption session (sender side)
 * Derives shared AES key via ECDH and generates random IV
 */
export async function initE2ESenderSession(
    myPrivateKey: CryptoKey,
    peerPublicKeyRaw: Uint8Array
): Promise<E2ESession> {
    // Derive shared AES key via ECDH + HKDF
    const aesKey = await deriveSharedKey(myPrivateKey, peerPublicKeyRaw);

    // Generate random IV (12 bytes for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    return { aesKey, iv };
}

/**
 * Initialize E2E decryption session (receiver side)
 * Derives the same shared AES key via ECDH
 */
export async function initE2EReceiverSession(
    e2eData: E2EManifestData,
    myPrivateKey: CryptoKey,
    senderPublicKeyRaw: Uint8Array
): Promise<E2ESession> {
    // Decode IV from base64
    const iv = new Uint8Array(base64ToArrayBuffer(e2eData.iv));

    // Derive same shared AES key via ECDH + HKDF
    const aesKey = await deriveSharedKey(myPrivateKey, senderPublicKeyRaw);

    return { aesKey, iv };
}


/**
 * Encrypt a chunk of data
 * Uses AES-GCM with unique nonce per chunk (IV + chunk index)
 */
export async function encryptChunk(
    session: E2ESession,
    chunkData: ArrayBuffer,
    chunkIndex: number
): Promise<ArrayBuffer> {
    // Create unique nonce for this chunk: base IV XOR with chunk index
    const nonce = deriveChunkNonce(session.iv, chunkIndex);

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new Uint8Array(nonce) },
        session.aesKey,
        chunkData
    );

    return encrypted;
}

/**
 * Decrypt a chunk of data
 */
export async function decryptChunk(
    session: E2ESession,
    encryptedData: ArrayBuffer,
    chunkIndex: number
): Promise<ArrayBuffer> {
    // Derive same nonce used for encryption
    const nonce = deriveChunkNonce(session.iv, chunkIndex);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(nonce) },
        session.aesKey,
        encryptedData
    );

    return decrypted;
}


/**
 * Create E2E data for manifest (sender side)
 * Only contains IV — no encrypted key needed with ECDH
 */
export function createE2EManifestData(session: E2ESession): E2EManifestData {
    return {
        iv: arrayBufferToBase64(session.iv.buffer as ArrayBuffer),
    };
}

/**
 * Check if encryption method requires E2E
 */
export function requiresE2E(method: EncryptionMethod): boolean {
    return method === "double" || method === "shamir";
}


/**
 * Derive unique nonce for each chunk
 * XORs the base IV with the chunk index to ensure unique nonces
 */
function deriveChunkNonce(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
    const nonce = new Uint8Array(baseIv);

    // XOR the last 4 bytes with chunk index (big-endian)
    const indexOffset = nonce.length - 4;
    nonce[indexOffset] = (nonce[indexOffset] ?? 0) ^ ((chunkIndex >> 24) & 0xFF);
    nonce[indexOffset + 1] = (nonce[indexOffset + 1] ?? 0) ^ ((chunkIndex >> 16) & 0xFF);
    nonce[indexOffset + 2] = (nonce[indexOffset + 2] ?? 0) ^ ((chunkIndex >> 8) & 0xFF);
    nonce[indexOffset + 3] = (nonce[indexOffset + 3] ?? 0) ^ (chunkIndex & 0xFF);

    return nonce;
}
