/**
 * P2P E2E Encryption Tests
 *
 * Tests end-to-end encryption for P2P file transfers:
 * - Sender session initialization (X25519 ECDH → AES key derivation)
 * - Receiver session initialization (X25519 ECDH → same AES key)
 * - Chunk encrypt/decrypt round-trip (AES-GCM)
 * - Chunk nonce uniqueness (XOR-based derivation)
 * - Manifest data serialization (base64 encoding)
 * - requiresE2E helper
 * - Wrong key rejection
 */

import { describe, it, expect, vi } from 'vitest';
import {
    initE2ESenderSession,
    initE2EReceiverSession,
    encryptChunk,
    decryptChunk,
    createE2EManifestData,
    requiresE2E,
    type E2ESession,
} from './e2eEncryption';

// Mock platform utilities
vi.mock('@/lib/platform', () => ({
    arrayBufferToHex: (buffer: ArrayBuffer) => {
        return Array.from(new Uint8Array(buffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    },
    formatFingerprint: (hex: string) => {
        const chars = hex.slice(0, 32).toUpperCase();
        const groups: string[] = [];
        for (let i = 0; i < chars.length; i += 4) {
            groups.push(chars.slice(i, i + 4));
        }
        return groups.join('-');
    },
    arrayBufferToBase64: (buffer: ArrayBuffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
        return btoa(binary);
    },
    base64ToArrayBuffer: (base64: string) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },
}));

// ============ X25519 Key Pair Helper ============

async function generateX25519KeyPair(): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    publicKeyRaw: Uint8Array;
}> {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'X25519' },
        true, // extractable for raw export
        ['deriveBits']
    ) as CryptoKeyPair;

    const publicKeyRaw = new Uint8Array(
        await crypto.subtle.exportKey('raw', keyPair.publicKey)
    );

    // Re-import private as non-extractable
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const privateKey = await crypto.subtle.importKey(
        'jwk',
        privateJwk,
        { name: 'X25519' },
        false,
        ['deriveBits']
    );

    return { publicKey: keyPair.publicKey, privateKey, publicKeyRaw };
}

describe('P2P E2E Encryption (X25519 ECDH)', () => {

    // ============ initE2ESenderSession ============

    describe('initE2ESenderSession', () => {
        it('should generate AES key and IV via ECDH', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const session = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );

            expect(session.aesKey).toBeDefined();
            expect(session.aesKey.type).toBe('secret');
            expect(session.iv).toBeInstanceOf(Uint8Array);
            expect(session.iv.length).toBe(12); // AES-GCM standard
        });

        it('should produce a non-extractable AES-256-GCM key', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const session = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );

            expect(session.aesKey.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
            expect(session.aesKey.extractable).toBe(false);
        });

        it('should produce unique IVs', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const s1 = await initE2ESenderSession(sender.privateKey, receiver.publicKeyRaw);
            const s2 = await initE2ESenderSession(sender.privateKey, receiver.publicKeyRaw);

            expect(s1.iv).not.toEqual(s2.iv);
        });

        it('should not include encryptedKey (ECDH has no key transport)', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const session = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );

            expect(session).not.toHaveProperty('encryptedKey');
        });
    });

    // ============ initE2EReceiverSession (round-trip) ============

    describe('initE2EReceiverSession', () => {
        it('should derive same AES key via ECDH and produce usable session', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const senderSession = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );
            const manifestData = createE2EManifestData(senderSession);

            const receiverSession = await initE2EReceiverSession(
                manifestData,
                receiver.privateKey,
                sender.publicKeyRaw
            );

            expect(receiverSession.aesKey).toBeDefined();
            expect(receiverSession.aesKey.type).toBe('secret');
            expect(receiverSession.iv).toBeInstanceOf(Uint8Array);
            expect(receiverSession.iv.length).toBe(12);
        });

        it('should fail with wrong private key (different shared secret)', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();
            const imposter = await generateX25519KeyPair();

            const senderSession = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );
            const manifestData = createE2EManifestData(senderSession);

            // Imposter derives different AES key — decryption will fail in chunk tests
            const imposterSession = await initE2EReceiverSession(
                manifestData,
                imposter.privateKey,
                sender.publicKeyRaw
            );

            // The session initializes (ECDH doesn't fail), but encryption will fail
            // Encrypt with sender session, try decrypt with imposter session
            const plaintext = new TextEncoder().encode('secret data');
            const encrypted = await encryptChunk(senderSession, plaintext.buffer as ArrayBuffer, 0);

            await expect(
                decryptChunk(imposterSession, encrypted, 0)
            ).rejects.toThrow();
        });
    });

    // ============ encryptChunk / decryptChunk ============

    describe('chunk encrypt/decrypt', () => {
        async function createSessionPair(): Promise<{ sender: E2ESession; receiver: E2ESession }> {
            const senderKP = await generateX25519KeyPair();
            const receiverKP = await generateX25519KeyPair();

            const sender = await initE2ESenderSession(
                senderKP.privateKey,
                receiverKP.publicKeyRaw
            );
            const manifest = createE2EManifestData(sender);
            const receiver = await initE2EReceiverSession(
                manifest,
                receiverKP.privateKey,
                senderKP.publicKeyRaw
            );
            return { sender, receiver };
        }

        it('should round-trip: encrypt → decrypt returns original data', async () => {
            const { sender, receiver } = await createSessionPair();
            const plaintext = new TextEncoder().encode('Hello, P2P world!');

            const encrypted = await encryptChunk(sender, plaintext.buffer as ArrayBuffer, 0);
            const decrypted = await decryptChunk(receiver, encrypted, 0);

            expect(new Uint8Array(decrypted)).toEqual(plaintext);
        });

        it('should encrypt multiple chunks with unique nonces', async () => {
            const { sender, receiver } = await createSessionPair();

            const chunks = ['chunk_0', 'chunk_1', 'chunk_2'].map(
                s => new TextEncoder().encode(s).buffer as ArrayBuffer
            );

            const encrypted = await Promise.all(
                chunks.map((c, i) => encryptChunk(sender, c, i))
            );

            // Each encrypted chunk should be different
            const enc0 = new Uint8Array(encrypted[0]!);
            const enc1 = new Uint8Array(encrypted[1]!);
            const enc2 = new Uint8Array(encrypted[2]!);
            expect(enc0).not.toEqual(enc1);
            expect(enc1).not.toEqual(enc2);

            // Decrypt each
            for (let i = 0; i < chunks.length; i++) {
                const decrypted = await decryptChunk(receiver, encrypted[i]!, i);
                const original = new Uint8Array(chunks[i]!);
                expect(new Uint8Array(decrypted)).toEqual(original);
            }
        });

        it('should fail when decrypting with wrong chunk index', async () => {
            const { sender, receiver } = await createSessionPair();
            const plaintext = new TextEncoder().encode('secret data');

            const encrypted = await encryptChunk(sender, plaintext.buffer as ArrayBuffer, 0);

            // Decrypt with wrong index → different nonce → AES-GCM auth tag mismatch
            await expect(
                decryptChunk(receiver, encrypted, 1)
            ).rejects.toThrow();
        });

        it('should handle empty chunk', async () => {
            const { sender, receiver } = await createSessionPair();
            const empty = new ArrayBuffer(0);

            const encrypted = await encryptChunk(sender, empty, 0);
            // AES-GCM adds 16-byte auth tag even for empty plaintext
            expect(encrypted.byteLength).toBe(16);

            const decrypted = await decryptChunk(receiver, encrypted, 0);
            expect(decrypted.byteLength).toBe(0);
        });

        it('should handle large chunk (1MB)', async () => {
            const { sender, receiver } = await createSessionPair();
            // jsdom limits getRandomValues to 65536 bytes, so fill in chunks
            const largeData = new Uint8Array(1024 * 1024);
            for (let i = 0; i < largeData.length; i += 65536) {
                crypto.getRandomValues(largeData.subarray(i, i + 65536));
            }

            const encrypted = await encryptChunk(sender, largeData.buffer as ArrayBuffer, 0);
            const decrypted = await decryptChunk(receiver, encrypted, 0);

            expect(new Uint8Array(decrypted)).toEqual(largeData);
        });

        it('should fail when ciphertext is tampered', async () => {
            const { sender, receiver } = await createSessionPair();
            const plaintext = new TextEncoder().encode('do not tamper');

            const encrypted = await encryptChunk(sender, plaintext.buffer as ArrayBuffer, 0);

            // Flip a byte in the ciphertext
            const tampered = new Uint8Array(encrypted!);
            tampered[0] = tampered[0]! ^ 0xFF;

            await expect(
                decryptChunk(receiver, tampered.buffer as ArrayBuffer, 0)
            ).rejects.toThrow();
        });
    });

    // ============ createE2EManifestData ============

    describe('createE2EManifestData', () => {
        it('should return base64 encoded iv (no encryptedKey with ECDH)', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const session = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );
            const manifest = createE2EManifestData(session);

            expect(typeof manifest.iv).toBe('string');
            expect(() => atob(manifest.iv)).not.toThrow();
            // No encryptedKey field in ECDH mode
            expect(manifest).not.toHaveProperty('encryptedKey');
        });

        it('should encode IV as 12 bytes (16 chars base64)', async () => {
            const sender = await generateX25519KeyPair();
            const receiver = await generateX25519KeyPair();

            const session = await initE2ESenderSession(
                sender.privateKey,
                receiver.publicKeyRaw
            );
            const manifest = createE2EManifestData(session);

            const ivBytes = atob(manifest.iv);
            expect(ivBytes.length).toBe(12);
        });
    });

    // ============ requiresE2E ============

    describe('requiresE2E', () => {
        it('should return true for "double"', () => {
            expect(requiresE2E('double')).toBe(true);
        });

        it('should return true for "shamir"', () => {
            expect(requiresE2E('shamir')).toBe(true);
        });

        it('should return false for "webrtc"', () => {
            expect(requiresE2E('webrtc')).toBe(false);
        });
    });

    // ============ Full integration round-trip ============

    describe('full integration', () => {
        it('should complete sender → manifest → receiver → decrypt flow', async () => {
            const senderKP = await generateX25519KeyPair();
            const receiverKP = await generateX25519KeyPair();

            // 1. Sender creates session via ECDH
            const senderSession = await initE2ESenderSession(
                senderKP.privateKey,
                receiverKP.publicKeyRaw
            );

            // 2. Sender creates manifest data (would be sent via signaling)
            const manifestData = createE2EManifestData(senderSession);

            // 3. Sender encrypts file chunks
            const fileContent = 'The quick brown fox jumps over the lazy dog';
            const chunkSize = 10;
            const fullData = new TextEncoder().encode(fileContent);
            const numChunks = Math.ceil(fullData.length / chunkSize);

            const encryptedChunks: ArrayBuffer[] = [];
            for (let i = 0; i < numChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fullData.length);
                const chunk = fullData.slice(start, end).buffer as ArrayBuffer;
                encryptedChunks.push(await encryptChunk(senderSession, chunk, i));
            }

            // 4. Receiver initializes session from manifest via ECDH
            const receiverSession = await initE2EReceiverSession(
                manifestData,
                receiverKP.privateKey,
                senderKP.publicKeyRaw
            );

            // 5. Receiver decrypts all chunks
            const decryptedParts: Uint8Array[] = [];
            for (let i = 0; i < encryptedChunks.length; i++) {
                const decrypted = await decryptChunk(receiverSession, encryptedChunks[i]!, i);
                decryptedParts.push(new Uint8Array(decrypted));
            }

            // 6. Reassemble and verify
            const totalLength = decryptedParts.reduce((sum, p) => sum + p.length, 0);
            const reassembled = new Uint8Array(totalLength);
            let offset = 0;
            for (const part of decryptedParts) {
                reassembled.set(part, offset);
                offset += part.length;
            }

            const result = new TextDecoder().decode(reassembled);
            expect(result).toBe(fileContent);
        });
    });
});
