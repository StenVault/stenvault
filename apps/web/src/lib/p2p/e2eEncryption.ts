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

// ============ Types ============

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

// ============ Constants ============

const AES_ALGORITHM = {
    name: "AES-GCM",
    length: 256,
};

// ============ Session Management ============

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

// ============ Chunk Encryption ============

/**
 * Encrypt a chunk of data.
 * Uses AES-GCM with a fresh random 12-byte IV per chunk.
 * The IV is prepended to the ciphertext so the receiver can extract it.
 */
export async function encryptChunk(
    session: E2ESession,
    chunkData: ArrayBuffer,
    _chunkIndex: number
): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        session.aesKey,
        chunkData
    );

    // Prepend IV so receiver can extract it
    const result = new Uint8Array(12 + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), 12);
    return result.buffer;
}

/**
 * Decrypt a chunk of data.
 * Expects the 12-byte IV prepended to the ciphertext.
 */
export async function decryptChunk(
    session: E2ESession,
    encryptedData: ArrayBuffer,
    _chunkIndex: number
): Promise<ArrayBuffer> {
    const data = new Uint8Array(encryptedData);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        session.aesKey,
        ciphertext
    );

    return decrypted;
}

// ============ Manifest Helpers ============

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

// ============ Utility Functions ============
