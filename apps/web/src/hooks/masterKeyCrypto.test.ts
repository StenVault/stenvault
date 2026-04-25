/**
 * Master Key Crypto Tests
 *
 * Tests all pure crypto exports from masterKeyCrypto.ts using real WebCrypto APIs.
 * Argon2 provider is mocked since hash-wasm requires WASM initialization.
 *
 * Tests:
 * - encryptLargeSecretKey / decryptLargeSecretKey roundtrip
 * - deriveArgon2Key
 * - unwrapMasterKey
 * - deriveFileKeyFromMaster
 * - deriveFilenameKeyFromMaster
 * - deriveFingerprintKeyFromMaster
 * - deriveThumbnailKeyFromMaster
 *
 * @module masterKeyCrypto.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============ Mocks ============

const mockDeriveKey = vi.fn();

// Argon2 mock is legitimate — avoids 47MiB WASM memory cost per derivation in tests.
// All other crypto (AES-GCM, HKDF, AES-KW) uses REAL WebCrypto.
vi.mock('@/lib/platform/webArgon2Provider', () => ({
    getArgon2Provider: () => ({
        deriveKey: (...args: unknown[]) => mockDeriveKey(...args),
    }),
}));

// No platform mock — uses real base64ToArrayBuffer/toArrayBuffer from @/lib/platform

// Import AFTER mocks
import {
    encryptLargeSecretKey,
    decryptLargeSecretKey,
    deriveArgon2Key,
    unwrapMasterKey,
    createMasterKeyBundle,
    wrapSecretWithMK,
    unwrapSecretWithMK,
    deriveFileKeyFromMaster,
    deriveFilenameKeyFromMaster,
    deriveFoldernameKeyFromMaster,
    deriveFingerprintKeyFromMaster,
    deriveThumbnailKeyFromMaster,
    generateRecoveryWraps,
    generateRecoveryWrapsFromKey,
    unwrapMKFromRecoveryWrap,
} from './masterKeyCrypto';

// ============ Helpers ============

async function generateMasterKeyBytes(length = 32): Promise<Uint8Array> {
    return crypto.getRandomValues(new Uint8Array(length));
}

async function generateAesGcmKey(extractable = true): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        extractable,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

async function generateAesKwKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-KW', length: 256 },
        true,
        ['wrapKey', 'unwrapKey']
    );
}

/** Generate an HKDF key from random bytes (for derive* function tests) */
async function generateHkdfKey(): Promise<CryptoKey> {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    return crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey', 'deriveBits']);
}

async function exportKeyRaw(key: CryptoKey): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

// Compare two CryptoKeys by raw bytes (only for extractable keys)
async function keysEqual(a: CryptoKey, b: CryptoKey): Promise<boolean> {
    const aBytes = await exportKeyRaw(a);
    const bBytes = await exportKeyRaw(b);
    if (aBytes.length !== bBytes.length) return false;
    return aBytes.every((byte, i) => byte === bBytes[i]);
}

// Get fingerprint for non-extractable key by encrypting known data
const TEST_DATA = new TextEncoder().encode('masterKeyCrypto test vector');
const FIXED_IV = new Uint8Array(12);

async function keyFingerprint(key: CryptoKey): Promise<string> {
    // For HMAC keys, sign instead of encrypt
    if (key.algorithm.name === 'HMAC') {
        const sig = await crypto.subtle.sign('HMAC', key, TEST_DATA);
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: FIXED_IV },
        key,
        TEST_DATA
    );
    return Array.from(new Uint8Array(ct)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ Tests ============

describe('masterKeyCrypto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==================== encryptLargeSecretKey / decryptLargeSecretKey ====================

    describe('encryptLargeSecretKey / decryptLargeSecretKey', () => {
        it('should roundtrip a 32-byte key', async () => {
            const masterKey = await generateMasterKeyBytes(32);
            const secretKey = crypto.getRandomValues(new Uint8Array(32));

            const encrypted = await encryptLargeSecretKey(secretKey, masterKey);
            const decrypted = await decryptLargeSecretKey(encrypted, masterKey);

            expect(decrypted).toEqual(secretKey);
        });

        it('should roundtrip a 2400-byte key (ML-KEM-768 secret key size)', async () => {
            const masterKey = await generateMasterKeyBytes(32);
            const secretKey = crypto.getRandomValues(new Uint8Array(2400));

            const encrypted = await encryptLargeSecretKey(secretKey, masterKey);
            const decrypted = await decryptLargeSecretKey(encrypted, masterKey);

            expect(decrypted.length).toBe(2400);
            expect(decrypted).toEqual(secretKey);
        });

        it('should produce output in format [12B IV][ciphertext + 16B tag]', async () => {
            const masterKey = await generateMasterKeyBytes(32);
            const secretKey = crypto.getRandomValues(new Uint8Array(64));

            const encrypted = await encryptLargeSecretKey(secretKey, masterKey);

            // IV (12) + ciphertext (64) + GCM tag (16) = 92
            expect(encrypted.length).toBe(12 + 64 + 16);
            // First 12 bytes are the IV
            const iv = encrypted.slice(0, 12);
            expect(iv.length).toBe(12);
        });

        it('should fail to decrypt with wrong master key', async () => {
            const masterKey1 = await generateMasterKeyBytes(32);
            const masterKey2 = await generateMasterKeyBytes(32);
            const secretKey = crypto.getRandomValues(new Uint8Array(32));

            const encrypted = await encryptLargeSecretKey(secretKey, masterKey1);

            await expect(decryptLargeSecretKey(encrypted, masterKey2)).rejects.toThrow();
        });

        it('should produce different ciphertext for same plaintext (random IV)', async () => {
            const masterKey = await generateMasterKeyBytes(32);
            const secretKey = crypto.getRandomValues(new Uint8Array(32));

            const enc1 = await encryptLargeSecretKey(secretKey, masterKey);
            const enc2 = await encryptLargeSecretKey(secretKey, masterKey);

            // IVs should differ (random)
            const iv1 = enc1.slice(0, 12);
            const iv2 = enc2.slice(0, 12);
            expect(iv1).not.toEqual(iv2);
        });

        it('should handle empty data (0-byte key)', async () => {
            const masterKey = await generateMasterKeyBytes(32);
            const secretKey = new Uint8Array(0);

            const encrypted = await encryptLargeSecretKey(secretKey, masterKey);
            // IV (12) + empty ciphertext (0) + tag (16) = 28
            expect(encrypted.length).toBe(28);

            const decrypted = await decryptLargeSecretKey(encrypted, masterKey);
            expect(decrypted.length).toBe(0);
        });
    });

    // ==================== deriveArgon2Key ====================

    describe('deriveArgon2Key', () => {
        it('should return AES-KW CryptoKey from Argon2 output', async () => {
            const fakeKek = crypto.getRandomValues(new Uint8Array(32));
            mockDeriveKey.mockResolvedValueOnce({ key: fakeKek });

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const params = { type: 'argon2id' as const, memoryCost: 47104, timeCost: 1, parallelism: 1, hashLength: 32 };

            const key = await deriveArgon2Key('test-password', salt, params);

            expect(key).toBeDefined();
            expect(key.algorithm.name).toBe('AES-KW');
            expect(key.usages).toContain('wrapKey');
            expect(key.usages).toContain('unwrapKey');
        });

        it('should pass password and params to Argon2 provider', async () => {
            const fakeKek = crypto.getRandomValues(new Uint8Array(32));
            mockDeriveKey.mockResolvedValueOnce({ key: fakeKek });

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const params = { type: 'argon2id' as const, memoryCost: 47104, timeCost: 1, parallelism: 1, hashLength: 32 };

            await deriveArgon2Key('my-password', salt, params);

            expect(mockDeriveKey).toHaveBeenCalledWith('my-password', salt, params);
        });

        it('should produce non-extractable key (XSS cannot exportKey)', async () => {
            const fakeKek = crypto.getRandomValues(new Uint8Array(32));
            mockDeriveKey.mockResolvedValueOnce({ key: fakeKek });

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const params = { type: 'argon2id' as const, memoryCost: 47104, timeCost: 1, parallelism: 1, hashLength: 32 };

            const key = await deriveArgon2Key('password', salt, params);

            expect(key.extractable).toBe(false);
        });
    });

    // ==================== unwrapMasterKey ====================

    describe('unwrapMasterKey', () => {
        it('should unwrap and return a MasterKeyBundle with 3 non-extractable keys', async () => {
            const kek = await generateAesKwKey();
            const masterKey = await generateAesGcmKey(true);

            // Wrap the master key
            const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek, 'AES-KW');
            const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrapped)));

            // Unwrap it
            const result = await unwrapMasterKey(wrappedB64, kek);

            expect(result.bundle).toBeDefined();
            expect(result.bundle.hkdf.algorithm.name).toBe('HKDF');
            expect(result.bundle.aesGcm.algorithm.name).toBe('AES-GCM');
            expect(result.bundle.aesKw.algorithm.name).toBe('AES-KW');
            // All keys should be non-extractable
            expect(result.bundle.hkdf.extractable).toBe(false);
            expect(result.bundle.aesGcm.extractable).toBe(false);
            expect(result.bundle.aesKw.extractable).toBe(false);
            // No device wrap requested
            expect(result.deviceWrapped).toBeUndefined();
        });

        it('should return deviceWrapped when deviceKek is provided', async () => {
            const kek = await generateAesKwKey();
            const deviceKek = await generateAesKwKey();
            const masterKey = await generateAesGcmKey(true);

            const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek, 'AES-KW');
            const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrapped)));

            const result = await unwrapMasterKey(wrappedB64, kek, deviceKek);

            expect(result.bundle).toBeDefined();
            expect(result.deviceWrapped).toBeDefined();
            expect(result.deviceWrapped!.byteLength).toBe(40); // AES-KW adds 8 bytes
        });

        it('should fail with wrong KEK', async () => {
            const kek1 = await generateAesKwKey();
            const kek2 = await generateAesKwKey();
            const masterKey = await generateAesGcmKey(true);

            const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek1, 'AES-KW');
            const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrapped)));

            await expect(unwrapMasterKey(wrappedB64, kek2)).rejects.toThrow();
        });
    });

    // ==================== createMasterKeyBundle ====================

    describe('createMasterKeyBundle', () => {
        it('should create 3 non-extractable CryptoKeys from raw bytes', async () => {
            const rawBytes = crypto.getRandomValues(new Uint8Array(32));
            const bundle = await createMasterKeyBundle(rawBytes);

            expect(bundle.hkdf.algorithm.name).toBe('HKDF');
            expect(bundle.aesGcm.algorithm.name).toBe('AES-GCM');
            expect(bundle.aesKw.algorithm.name).toBe('AES-KW');
            expect(bundle.hkdf.extractable).toBe(false);
            expect(bundle.aesGcm.extractable).toBe(false);
            expect(bundle.aesKw.extractable).toBe(false);
        });

        it('should zero the input bytes after import', async () => {
            const rawBytes = crypto.getRandomValues(new Uint8Array(32));
            await createMasterKeyBundle(rawBytes);

            expect(rawBytes.every(b => b === 0)).toBe(true);
        });
    });

    // ==================== wrapSecretWithMK / unwrapSecretWithMK ====================

    describe('wrapSecretWithMK / unwrapSecretWithMK', () => {
        it('should roundtrip a 32-byte secret', async () => {
            const rawBytes = crypto.getRandomValues(new Uint8Array(32));
            const rawCopy = new Uint8Array(rawBytes);
            const bundle = await createMasterKeyBundle(rawBytes);

            const secret = crypto.getRandomValues(new Uint8Array(32));
            const wrapped = await wrapSecretWithMK(secret, bundle.aesKw);
            expect(wrapped.length).toBe(40); // AES-KW adds 8 bytes

            const unwrapped = await unwrapSecretWithMK(wrapped, bundle.aesKw);
            expect(unwrapped).toEqual(secret);
        });
    });

    // ==================== deriveFileKeyFromMaster ====================

    describe('deriveFileKeyFromMaster', () => {
        it('should derive deterministic key (same input -> same key)', async () => {
            const masterKey = await generateHkdfKey();
            const fileId = 'file-123';
            const timestamp = 1700000000;

            const key1 = await deriveFileKeyFromMaster(masterKey, fileId, timestamp);
            const key2 = await deriveFileKeyFromMaster(masterKey, fileId, timestamp);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).toBe(fp2);
        });

        it('should derive different key for different fileId', async () => {
            const masterKey = await generateHkdfKey();
            const timestamp = 1700000000;

            const key1 = await deriveFileKeyFromMaster(masterKey, 'file-1', timestamp);
            const key2 = await deriveFileKeyFromMaster(masterKey, 'file-2', timestamp);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should derive different key for different timestamp', async () => {
            const masterKey = await generateHkdfKey();
            const fileId = 'file-123';

            const key1 = await deriveFileKeyFromMaster(masterKey, fileId, 1700000000);
            const key2 = await deriveFileKeyFromMaster(masterKey, fileId, 1700000001);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should derive different key for different master key', async () => {
            const masterKey1 = await generateHkdfKey();
            const masterKey2 = await generateHkdfKey();
            const fileId = 'file-123';
            const timestamp = 1700000000;

            const key1 = await deriveFileKeyFromMaster(masterKey1, fileId, timestamp);
            const key2 = await deriveFileKeyFromMaster(masterKey2, fileId, timestamp);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should return AES-GCM key with encrypt/decrypt usages', async () => {
            const masterKey = await generateHkdfKey();

            const key = await deriveFileKeyFromMaster(masterKey, 'file-1', 1700000000);

            expect(key.algorithm.name).toBe('AES-GCM');
            expect(key.usages).toContain('encrypt');
            expect(key.usages).toContain('decrypt');
            expect(key.extractable).toBe(false);
        });
    });

    // ==================== deriveFilenameKeyFromMaster ====================

    describe('deriveFilenameKeyFromMaster', () => {
        it('should return AES-GCM key', async () => {
            const masterKey = await generateHkdfKey();

            const key = await deriveFilenameKeyFromMaster(masterKey);

            expect(key.algorithm.name).toBe('AES-GCM');
            expect(key.usages).toContain('encrypt');
            expect(key.usages).toContain('decrypt');
        });

        it('should derive deterministic key (same master key -> same filename key)', async () => {
            const masterKey = await generateHkdfKey();

            const key1 = await deriveFilenameKeyFromMaster(masterKey);
            const key2 = await deriveFilenameKeyFromMaster(masterKey);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).toBe(fp2);
        });

        it('should derive different key for different master key', async () => {
            const masterKey1 = await generateHkdfKey();
            const masterKey2 = await generateHkdfKey();

            const key1 = await deriveFilenameKeyFromMaster(masterKey1);
            const key2 = await deriveFilenameKeyFromMaster(masterKey2);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should be non-extractable', async () => {
            const masterKey = await generateHkdfKey();
            const key = await deriveFilenameKeyFromMaster(masterKey);
            expect(key.extractable).toBe(false);
        });
    });

    // ==================== deriveFoldernameKeyFromMaster ====================

    describe('deriveFoldernameKeyFromMaster', () => {
        it('should return AES-GCM key', async () => {
            const masterKey = await generateHkdfKey();

            const key = await deriveFoldernameKeyFromMaster(masterKey);

            expect(key.algorithm.name).toBe('AES-GCM');
            expect(key.usages).toContain('encrypt');
            expect(key.usages).toContain('decrypt');
        });

        it('should derive deterministic key (same master key -> same foldername key)', async () => {
            const masterKey = await generateHkdfKey();

            const key1 = await deriveFoldernameKeyFromMaster(masterKey);
            const key2 = await deriveFoldernameKeyFromMaster(masterKey);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).toBe(fp2);
        });

        it('should derive different key for different master key', async () => {
            const masterKey1 = await generateHkdfKey();
            const masterKey2 = await generateHkdfKey();

            const key1 = await deriveFoldernameKeyFromMaster(masterKey1);
            const key2 = await deriveFoldernameKeyFromMaster(masterKey2);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should be non-extractable', async () => {
            const masterKey = await generateHkdfKey();
            const key = await deriveFoldernameKeyFromMaster(masterKey);
            expect(key.extractable).toBe(false);
        });

        it('should derive different key than filename key (different HKDF salt/info)', async () => {
            const masterKey = await generateHkdfKey();

            const foldernameKey = await deriveFoldernameKeyFromMaster(masterKey);
            const filenameKey = await deriveFilenameKeyFromMaster(masterKey);

            const fp1 = await keyFingerprint(foldernameKey);
            const fp2 = await keyFingerprint(filenameKey);
            expect(fp1).not.toBe(fp2);
        });
    });

    // ==================== deriveFingerprintKeyFromMaster ====================

    describe('deriveFingerprintKeyFromMaster', () => {
        it('should return HMAC key', async () => {
            const masterKey = await generateHkdfKey();

            const key = await deriveFingerprintKeyFromMaster(masterKey);

            expect(key.algorithm.name).toBe('HMAC');
            expect(key.usages).toContain('sign');
        });

        it('should derive deterministic key', async () => {
            const masterKey = await generateHkdfKey();

            const key1 = await deriveFingerprintKeyFromMaster(masterKey);
            const key2 = await deriveFingerprintKeyFromMaster(masterKey);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).toBe(fp2);
        });

        it('should derive different key for different master key', async () => {
            const masterKey1 = await generateHkdfKey();
            const masterKey2 = await generateHkdfKey();

            const key1 = await deriveFingerprintKeyFromMaster(masterKey1);
            const key2 = await deriveFingerprintKeyFromMaster(masterKey2);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should be non-extractable', async () => {
            const masterKey = await generateHkdfKey();
            const key = await deriveFingerprintKeyFromMaster(masterKey);
            expect(key.extractable).toBe(false);
        });
    });

    // ==================== deriveThumbnailKeyFromMaster ====================

    describe('deriveThumbnailKeyFromMaster', () => {
        it('should return AES-GCM key', async () => {
            const masterKey = await generateHkdfKey();

            const key = await deriveThumbnailKeyFromMaster(masterKey, 'file-1');

            expect(key.algorithm.name).toBe('AES-GCM');
            expect(key.usages).toContain('encrypt');
            expect(key.usages).toContain('decrypt');
        });

        it('should be file-specific (different fileId -> different key)', async () => {
            const masterKey = await generateHkdfKey();

            const key1 = await deriveThumbnailKeyFromMaster(masterKey, 'file-1');
            const key2 = await deriveThumbnailKeyFromMaster(masterKey, 'file-2');

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should derive deterministic key (same inputs -> same key)', async () => {
            const masterKey = await generateHkdfKey();
            const fileId = 'file-42';

            const key1 = await deriveThumbnailKeyFromMaster(masterKey, fileId);
            const key2 = await deriveThumbnailKeyFromMaster(masterKey, fileId);

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).toBe(fp2);
        });

        it('should derive different key for different master key', async () => {
            const masterKey1 = await generateHkdfKey();
            const masterKey2 = await generateHkdfKey();

            const key1 = await deriveThumbnailKeyFromMaster(masterKey1, 'file-1');
            const key2 = await deriveThumbnailKeyFromMaster(masterKey2, 'file-1');

            const fp1 = await keyFingerprint(key1);
            const fp2 = await keyFingerprint(key2);
            expect(fp1).not.toBe(fp2);
        });

        it('should be non-extractable', async () => {
            const masterKey = await generateHkdfKey();
            const key = await deriveThumbnailKeyFromMaster(masterKey, 'file-1');
            expect(key.extractable).toBe(false);
        });
    });

    // ============================================================================
    // Recovery Code Dual-Wrap — Real WebCrypto Round-Trip
    // ============================================================================
    //
    // These tests exercise the end-to-end path that resetWithRecoveryCode relies
    // on: wrap the MK bytes with a per-code Argon2id-derived KEK, then unwrap
    // them again and confirm the bytes match. Uses real AES-KW (RFC 3394) — the
    // Argon2 mock below is deterministic per (password, salt), giving us a
    // reproducible KEK without paying WASM's 47 MiB cost ten times per test.
    //
    // This is the contract the `resetWithRecoveryCode` bug fix depends on: a
    // correctly-wrapped MK can be recovered by the holder of the code, and
    // cannot be recovered by anyone else.

    describe('recovery code dual-wrap (real WebCrypto)', () => {
        /**
         * Deterministic Argon2 stand-in for tests: SHA-256(password || salt) → 32 bytes.
         * The `testOnly_` prefix makes accidental production imports grep-obvious.
         * Real Argon2id is too expensive (47 MiB × 10 wraps) for a unit-test budget,
         * and what we want to prove here is the wrap/unwrap plumbing, not Argon2's KDF.
         */
        async function testOnly_fakeArgon2(password: string, salt: Uint8Array): Promise<Uint8Array> {
            const enc = new TextEncoder();
            const combined = new Uint8Array(enc.encode(password).length + salt.length);
            combined.set(enc.encode(password), 0);
            combined.set(salt, enc.encode(password).length);
            const digest = await crypto.subtle.digest('SHA-256', combined);
            return new Uint8Array(digest);
        }

        const ARGON2_PARAMS = {
            type: 'argon2id' as const,
            memoryCost: 47104,
            timeCost: 1,
            parallelism: 1,
            hashLength: 32,
        };

        beforeEach(() => {
            mockDeriveKey.mockImplementation(async (password: string, salt: Uint8Array) => ({
                key: await testOnly_fakeArgon2(password, salt),
            }));
        });

        it('round-trip: any of 10 codes recovers the exact original MK bytes', async () => {
            const originalMk = crypto.getRandomValues(new Uint8Array(32));
            const codes = Array.from({ length: 10 }, (_, i) =>
                `CODE${i.toString().padStart(8, '0')}`
            );

            const wraps = await generateRecoveryWraps(
                new Uint8Array(originalMk),
                codes,
                ARGON2_PARAMS
            );

            expect(wraps).toHaveLength(10);

            for (let i = 0; i < 10; i++) {
                const recovered = await unwrapMKFromRecoveryWrap(wraps[i]!, codes[i]!);
                expect(recovered).toEqual(originalMk);
            }
        });

        it('each wrap has a unique salt and unique wrappedMK ciphertext', async () => {
            const mk = crypto.getRandomValues(new Uint8Array(32));
            const codes = Array.from({ length: 10 }, (_, i) => `DUPECODE${i.toString().padStart(4, '0')}`);

            const wraps = await generateRecoveryWraps(mk, codes, ARGON2_PARAMS);

            const salts = new Set(wraps.map((w) => w.salt));
            const ciphertexts = new Set(wraps.map((w) => w.wrappedMK));
            expect(salts.size).toBe(10);
            expect(ciphertexts.size).toBe(10);
        });

        it('codeIndex aligns with input position 0..9', async () => {
            const mk = crypto.getRandomValues(new Uint8Array(32));
            const codes = Array.from({ length: 10 }, (_, i) => `IDX${i.toString().padStart(9, '0')}`);

            const wraps = await generateRecoveryWraps(mk, codes, ARGON2_PARAMS);

            for (let i = 0; i < 10; i++) {
                expect(wraps[i]!.codeIndex).toBe(i);
            }
        });

        it('rejects unwrap with wrong code (AES-KW integrity check fails)', async () => {
            const mk = crypto.getRandomValues(new Uint8Array(32));
            const codes = ['CORRECTCODE0', 'CORRECTCODE1'];
            const wraps = await generateRecoveryWraps(mk, codes, ARGON2_PARAMS);

            // Try to unwrap wrap[0] with code[1] — different KEK, should fail.
            await expect(
                unwrapMKFromRecoveryWrap(wraps[0]!, codes[1]!)
            ).rejects.toThrow();
        });

        it('rejects unwrap if salt is tampered', async () => {
            const mk = crypto.getRandomValues(new Uint8Array(32));
            const [code] = ['TAMPERCODE01'];
            const [original] = await generateRecoveryWraps(mk, [code!], ARGON2_PARAMS);

            // Flip a bit in the salt — derivation gives a different KEK → unwrap fails.
            const tampered = {
                ...original!,
                salt: 'A'.repeat(44),
            };
            await expect(unwrapMKFromRecoveryWrap(tampered, code!)).rejects.toThrow();
        });

        it('rejects unwrap if wrappedMK is tampered', async () => {
            const mk = crypto.getRandomValues(new Uint8Array(32));
            const [code] = ['TAMPERCODE02'];
            const [original] = await generateRecoveryWraps(mk, [code!], ARGON2_PARAMS);

            // Flip a bit in the wrapped ciphertext — AES-KW integrity check fails.
            const tampered = {
                ...original!,
                wrappedMK: 'Z'.repeat(original!.wrappedMK.length),
            };
            await expect(unwrapMKFromRecoveryWrap(tampered, code!)).rejects.toThrow();
        });

        it('recovered MK can decrypt data encrypted by original MK (functional equivalence)', async () => {
            const originalMk = crypto.getRandomValues(new Uint8Array(32));
            const codes = ['FUNCCODE0001'];
            const wraps = await generateRecoveryWraps(originalMk, codes, ARGON2_PARAMS);

            // Encrypt a payload with the ORIGINAL MK.
            const originalKey = await crypto.subtle.importKey(
                'raw',
                originalMk,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );
            const plaintext = new TextEncoder().encode('your files survived the reset');
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                originalKey,
                plaintext
            );

            // Recover MK via the recovery code. Copy into a fresh ArrayBuffer-backed
            // view so TS accepts it as BufferSource (WebCrypto DOM lib rejects
            // Uint8Array<ArrayBufferLike> which may alias SharedArrayBuffer).
            const recoveredMk = new Uint8Array(await unwrapMKFromRecoveryWrap(wraps[0]!, codes[0]!));

            // The recovered MK must decrypt the original ciphertext.
            const recoveredKey = await crypto.subtle.importKey(
                'raw',
                recoveredMk,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                recoveredKey,
                ciphertext
            );
            expect(new TextDecoder().decode(decrypted)).toBe('your files survived the reset');
        });

        it('independence: changing one code does not affect other wraps', async () => {
            const mk = crypto.getRandomValues(new Uint8Array(32));
            const codes = ['INDEPCODE001', 'INDEPCODE002', 'INDEPCODE003'];
            const wraps = await generateRecoveryWraps(mk, codes, ARGON2_PARAMS);

            // Using code[0] on wrap[0] works; using code[0] on wrap[1] fails; etc.
            await expect(unwrapMKFromRecoveryWrap(wraps[0]!, codes[0]!)).resolves.toEqual(mk);
            await expect(unwrapMKFromRecoveryWrap(wraps[1]!, codes[0]!)).rejects.toThrow();
            await expect(unwrapMKFromRecoveryWrap(wraps[1]!, codes[1]!)).resolves.toEqual(mk);
            await expect(unwrapMKFromRecoveryWrap(wraps[2]!, codes[1]!)).rejects.toThrow();
        });

        it('property: round-trip holds for 25 random (MK, codes) pairs', async () => {
            const randomCode = () => {
                const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let out = '';
                for (let i = 0; i < 12; i++) {
                    const idx = crypto.getRandomValues(new Uint8Array(1))[0]! % alphabet.length;
                    out += alphabet[idx];
                }
                return out;
            };

            for (let run = 0; run < 25; run++) {
                const mk = crypto.getRandomValues(new Uint8Array(32));
                const codes = Array.from({ length: 10 }, randomCode);
                const wraps = await generateRecoveryWraps(mk, codes, ARGON2_PARAMS);

                const pick = crypto.getRandomValues(new Uint8Array(1))[0]! % 10;
                const recovered = await unwrapMKFromRecoveryWrap(wraps[pick]!, codes[pick]!);
                expect(recovered).toEqual(mk);
            }
        });

        it('generateRecoveryWrapsFromKey produces wraps that unwrap to the same MK', async () => {
            // The reset/Shamir flows call this variant directly so the caller can import
            // the MK once and feed the same CryptoKey into both the password re-wrap and
            // the recovery wraps. Verify it's a drop-in equivalent for the raw-bytes form.
            const originalMk = crypto.getRandomValues(new Uint8Array(32));
            const codes = Array.from({ length: 10 }, (_, i) => `FROMKEYCODE${i}`);

            const mkKey = await crypto.subtle.importKey(
                'raw',
                originalMk,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            const wraps = await generateRecoveryWrapsFromKey(mkKey, codes, ARGON2_PARAMS);

            expect(wraps).toHaveLength(10);
            for (let i = 0; i < 10; i++) {
                const recovered = await unwrapMKFromRecoveryWrap(wraps[i]!, codes[i]!);
                expect(recovered).toEqual(originalMk);
            }
        });
    });
});
