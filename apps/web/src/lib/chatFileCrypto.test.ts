/**
 * Chat File Crypto Tests — Hybrid PQC
 *
 * Unit tests for E2E re-encryption of file keys in chat.
 * Tests hybrid KEM encapsulation/decapsulation + HKDF + AES-GCM.
 *
 * Note: Hybrid KEM provider is mocked since ML-KEM-768 requires WASM.
 * Integration tests with real crypto are in cryptoRoundtrip.test.ts.
 *
 * @module lib/chatFileCrypto.test
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the platform module with controlled hybrid KEM behavior
const mockEncapsulate = vi.fn();
const mockDecapsulate = vi.fn();

vi.mock("@/lib/platform", () => {
    // Helper functions
    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
        return btoa(binary);
    };

    const base64ToArrayBuffer = (base64: string) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    };

    const arrayBufferToHex = (buffer: ArrayBuffer) => {
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    return {
        arrayBufferToBase64,
        base64ToArrayBuffer,
        arrayBufferToHex,
        formatFingerprint: (hex: string) => hex.slice(0, 32).replace(/(.{4})/g, '$1:').slice(0, -1),
        getHybridKemProvider: () => ({
            encapsulate: mockEncapsulate,
            decapsulate: mockDecapsulate,
        }),
        serializeHybridCiphertext: (ct: any) => ({
            classical: 'mock-classical-b64',
            postQuantum: 'mock-pq-b64',
        }),
        deserializeHybridCiphertext: (s: any) => ({
            classical: new Uint8Array(32),
            postQuantum: new Uint8Array(1088),
        }),
    };
});

import {
    reEncryptFileKeyForPeer,
    decryptFileKeyFromPeer,
    importFileKey,
    exportFileKey,
    generateKeyFingerprint,
} from "./chatFileCrypto";

// Shared secret that both encapsulate and decapsulate return
const mockSharedSecret = crypto.getRandomValues(new Uint8Array(32));

const mockHybridPublicKey = {
    classical: new Uint8Array(32),
    postQuantum: new Uint8Array(1184),
};

const mockHybridSecretKey = {
    classical: new Uint8Array(32),
    postQuantum: new Uint8Array(2400),
};

describe("chatFileCrypto (Hybrid PQC)", () => {
    let testFileKey: ArrayBuffer;

    beforeEach(() => {
        vi.clearAllMocks();

        // Generate a random 32-byte file key
        testFileKey = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;

        // Mock encapsulate returns a consistent shared secret
        mockEncapsulate.mockResolvedValue({
            ciphertext: {
                classical: new Uint8Array(32),
                postQuantum: new Uint8Array(1088),
            },
            sharedSecret: mockSharedSecret,
        });

        // Mock decapsulate returns the same shared secret
        mockDecapsulate.mockResolvedValue(mockSharedSecret);
    });

    describe("reEncryptFileKeyForPeer", () => {
        it("should encrypt file key and return all required fields", async () => {
            const result = await reEncryptFileKeyForPeer(testFileKey, mockHybridPublicKey);

            expect(result).toHaveProperty("encryptedFileKey");
            expect(result).toHaveProperty("iv");
            expect(result).toHaveProperty("salt");
            expect(result).toHaveProperty("kemCiphertext");

            // All fields should be non-empty strings
            expect(result.encryptedFileKey.length).toBeGreaterThan(0);
            expect(result.iv.length).toBeGreaterThan(0);
            expect(result.salt.length).toBeGreaterThan(0);
            expect(result.kemCiphertext.length).toBeGreaterThan(0);

            // kemCiphertext should be valid JSON
            expect(() => JSON.parse(result.kemCiphertext)).not.toThrow();
        });

        it("should call encapsulate with recipient public key", async () => {
            await reEncryptFileKeyForPeer(testFileKey, mockHybridPublicKey);

            expect(mockEncapsulate).toHaveBeenCalledOnce();
            expect(mockEncapsulate).toHaveBeenCalledWith(mockHybridPublicKey);
        });

        it("should produce different output each time (random IV/salt)", async () => {
            const result1 = await reEncryptFileKeyForPeer(testFileKey, mockHybridPublicKey);
            const result2 = await reEncryptFileKeyForPeer(testFileKey, mockHybridPublicKey);

            // IV and salt should differ
            expect(result1.iv).not.toBe(result2.iv);
            expect(result1.salt).not.toBe(result2.salt);
        });
    });

    describe("round-trip: encrypt then decrypt", () => {
        it("should recover original file key", async () => {
            // Encrypt
            const encrypted = await reEncryptFileKeyForPeer(testFileKey, mockHybridPublicKey);

            // Decrypt
            const decrypted = await decryptFileKeyFromPeer({
                encryptedFileKey: encrypted.encryptedFileKey,
                iv: encrypted.iv,
                salt: encrypted.salt,
                kemCiphertext: encrypted.kemCiphertext,
                myHybridSecretKey: mockHybridSecretKey,
            });

            // Compare
            const originalBytes = new Uint8Array(testFileKey);
            const decryptedBytes = new Uint8Array(decrypted);
            expect(decryptedBytes).toEqual(originalBytes);
        });
    });

    describe("decryptFileKeyFromPeer — validation", () => {
        it("should reject empty encryptedFileKey", async () => {
            await expect(decryptFileKeyFromPeer({
                encryptedFileKey: "",
                iv: "test",
                salt: "test",
                kemCiphertext: "{}",
                myHybridSecretKey: mockHybridSecretKey,
            })).rejects.toThrow(/cannot be empty/);
        });

        it("should reject empty IV", async () => {
            await expect(decryptFileKeyFromPeer({
                encryptedFileKey: "test",
                iv: "",
                salt: "test",
                kemCiphertext: "{}",
                myHybridSecretKey: mockHybridSecretKey,
            })).rejects.toThrow(/cannot be empty/);
        });

        it("should reject empty salt", async () => {
            await expect(decryptFileKeyFromPeer({
                encryptedFileKey: "test",
                iv: "test",
                salt: "",
                kemCiphertext: "{}",
                myHybridSecretKey: mockHybridSecretKey,
            })).rejects.toThrow(/cannot be empty/);
        });

        it("should reject empty kemCiphertext", async () => {
            await expect(decryptFileKeyFromPeer({
                encryptedFileKey: "test",
                iv: "test",
                salt: "test",
                kemCiphertext: "",
                myHybridSecretKey: mockHybridSecretKey,
            })).rejects.toThrow(/cannot be empty/);
        });
    });

    describe("importFileKey", () => {
        it("should import raw key bytes as CryptoKey", async () => {
            const rawKey = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
            const cryptoKey = await importFileKey(rawKey);

            expect(cryptoKey).toBeDefined();
            expect(cryptoKey.type).toBe("secret");
            expect(cryptoKey.algorithm).toMatchObject({ name: "AES-GCM" });
            expect(cryptoKey.extractable).toBe(false);
        });
    });

    describe("exportFileKey", () => {
        it("should export CryptoKey to raw bytes", async () => {
            // Create an extractable key for testing
            const key = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );

            const exported = await exportFileKey(key);
            expect(exported.byteLength).toBe(32);
        });
    });

    describe("generateKeyFingerprint", () => {
        it("should produce a hex fingerprint", async () => {
            const fingerprint = await generateKeyFingerprint("x25519-pub-b64", "mlkem768-pub-b64");

            expect(fingerprint).toBeDefined();
            expect(fingerprint.length).toBeGreaterThan(0);
            // Should contain hex characters and colons
            expect(fingerprint).toMatch(/^[0-9a-f:]+$/);
        });

        it("should produce different fingerprints for different keys", async () => {
            const fp1 = await generateKeyFingerprint("key-a", "key-b");
            const fp2 = await generateKeyFingerprint("key-c", "key-d");

            expect(fp1).not.toBe(fp2);
        });
    });
});
