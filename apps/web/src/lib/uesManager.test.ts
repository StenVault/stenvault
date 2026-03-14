/**
 * UES Manager Tests
 *
 * Tests User Entropy Seed lifecycle:
 * - Generate & store encrypted UES in localStorage
 * - Load & decrypt UES (fingerprint validation)
 * - Export/Import UES for server recovery (round-trip)
 * - Device-KEK derivation (password + UES)
 * - Fingerprint change detection
 * - Version migration detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stable mock values
const MOCK_FINGERPRINT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const MOCK_ENTROPY = new Uint8Array(32);
crypto.getRandomValues(MOCK_ENTROPY);

vi.mock('./deviceEntropy', () => ({
    collectDeviceEntropy: vi.fn(async () => ({
        entropy: MOCK_ENTROPY,
        fingerprintHash: MOCK_FINGERPRINT,
        fingerprint: {},
    })),
    getDeviceFingerprintHash: vi.fn(async () => MOCK_FINGERPRINT),
}));

vi.mock('@/lib/debugLogger', () => ({
    debugLog: vi.fn(),
    debugError: vi.fn(),
}));

import {
    hasUES,
    generateAndStoreUES,
    loadUES,
    clearUES,
    exportUESForServer,
    importUESFromServer,
    getStoredFingerprintHash,
    deriveDeviceKEK,
} from './uesManager';
import { getDeviceFingerprintHash } from './deviceEntropy';

describe('UES Manager', () => {
    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        localStorage.clear();
        vi.mocked(getDeviceFingerprintHash).mockResolvedValue(MOCK_FINGERPRINT);
    });


    describe('hasUES', () => {
        it('should return false when no UES stored', () => {
            expect(hasUES()).toBe(false);
        });

        it('should return true when UES exists in localStorage', () => {
            localStorage.setItem('cloudvault_ues_v1', '{"test": true}');
            expect(hasUES()).toBe(true);
        });

        it('should return false if localStorage throws', () => {
            const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
                throw new Error('localStorage unavailable');
            });
            expect(hasUES()).toBe(false);
            spy.mockRestore();
        });
    });


    describe('clearUES', () => {
        it('should remove UES from localStorage', () => {
            localStorage.setItem('cloudvault_ues_v1', 'data');
            clearUES();
            expect(localStorage.getItem('cloudvault_ues_v1')).toBeNull();
        });

        it('should not throw if localStorage fails', () => {
            const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
                throw new Error('fail');
            });
            expect(() => clearUES()).not.toThrow();
            spy.mockRestore();
        });
    });


    describe('getStoredFingerprintHash', () => {
        it('should return null when no UES stored', () => {
            expect(getStoredFingerprintHash()).toBeNull();
        });

        it('should return fingerprint from stored config', async () => {
            await generateAndStoreUES();
            expect(getStoredFingerprintHash()).toBe(MOCK_FINGERPRINT);
        });

        it('should return null for invalid JSON', () => {
            localStorage.setItem('cloudvault_ues_v1', 'not-json');
            expect(getStoredFingerprintHash()).toBeNull();
        });
    });


    describe('generateAndStoreUES', () => {
        it('should return UES bytes and fingerprint', async () => {
            const result = await generateAndStoreUES();

            expect(result.ues).toBeInstanceOf(Uint8Array);
            expect(result.ues.length).toBe(32); // 256-bit
            expect(result.fingerprintHash).toBe(MOCK_FINGERPRINT);
        });

        it('should store encrypted data in localStorage', async () => {
            await generateAndStoreUES();

            const stored = localStorage.getItem('cloudvault_ues_v1');
            expect(stored).not.toBeNull();

            const config = JSON.parse(stored!);
            expect(config.encryptedSeed).toBeDefined();
            expect(config.iv).toBeDefined();
            expect(config.deviceFingerprint).toBe(MOCK_FINGERPRINT);
            expect(config.version).toBe(1);
            expect(config.createdAt).toBeGreaterThan(0);
        });

        it('should store encrypted data (not plaintext UES)', async () => {
            const result = await generateAndStoreUES();

            const stored = localStorage.getItem('cloudvault_ues_v1');
            const config = JSON.parse(stored!);

            // The encrypted seed should be different from the raw UES
            // (Base64 of encrypted data won't match Base64 of raw data)
            const rawBase64 = btoa(String.fromCharCode(...result.ues));
            expect(config.encryptedSeed).not.toBe(rawBase64);
        });
    });


    describe('loadUES', () => {
        it('should return null when no UES stored', async () => {
            const result = await loadUES();
            expect(result).toBeNull();
        });

        it('should decrypt and return same UES bytes (round-trip)', async () => {
            const generated = await generateAndStoreUES();
            const loaded = await loadUES();

            expect(loaded).not.toBeNull();
            expect(loaded!.ues).toEqual(generated.ues);
            expect(loaded!.fingerprintHash).toBe(MOCK_FINGERPRINT);
        });

        it('should return null when fingerprint changes', async () => {
            await generateAndStoreUES();

            // Simulate device fingerprint change
            vi.mocked(getDeviceFingerprintHash).mockResolvedValue('different_fingerprint_hash_value_that_wont_match_stored');

            const result = await loadUES();
            expect(result).toBeNull();
        });

        it('should return null for version mismatch', async () => {
            await generateAndStoreUES();

            // Tamper with version
            const stored = JSON.parse(localStorage.getItem('cloudvault_ues_v1')!);
            stored.version = 999;
            localStorage.setItem('cloudvault_ues_v1', JSON.stringify(stored));

            const result = await loadUES();
            expect(result).toBeNull();
        });

        it('should return null for corrupted encrypted data', async () => {
            await generateAndStoreUES();

            // Corrupt the encrypted seed
            const stored = JSON.parse(localStorage.getItem('cloudvault_ues_v1')!);
            stored.encryptedSeed = btoa('corrupted-data-that-wont-decrypt');
            localStorage.setItem('cloudvault_ues_v1', JSON.stringify(stored));

            const result = await loadUES();
            expect(result).toBeNull();
        });

        it('should return null for invalid JSON in localStorage', async () => {
            localStorage.setItem('cloudvault_ues_v1', '{invalid json');
            const result = await loadUES();
            expect(result).toBeNull();
        });
    });


    describe('export/import UES round-trip', () => {
        async function createMasterKey(): Promise<CryptoKey> {
            return crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true, // Must be extractable for export
                ['encrypt', 'decrypt']
            );
        }

        it('should export UES encrypted with Master Key', async () => {
            const masterKey = await createMasterKey();
            const ues = crypto.getRandomValues(new Uint8Array(32));

            const exported = await exportUESForServer(ues, masterKey);

            expect(exported.uesEncrypted).toBeDefined();
            expect(exported.uesIv).toBeDefined();
            expect(exported.deviceFingerprint).toBe(MOCK_FINGERPRINT);
            expect(typeof exported.uesEncrypted).toBe('string');
            expect(typeof exported.uesIv).toBe('string');
        });

        it('should round-trip: export → import → same UES bytes', async () => {
            const masterKey = await createMasterKey();
            const originalUes = crypto.getRandomValues(new Uint8Array(32));

            const exported = await exportUESForServer(originalUes, masterKey);
            const imported = await importUESFromServer(
                { uesEncrypted: exported.uesEncrypted, uesIv: exported.uesIv },
                masterKey
            );

            expect(imported).toEqual(originalUes);
        });

        it('should store imported UES locally after import', async () => {
            const masterKey = await createMasterKey();
            const ues = crypto.getRandomValues(new Uint8Array(32));

            const exported = await exportUESForServer(ues, masterKey);

            // Clear local UES
            localStorage.removeItem('cloudvault_ues_v1');
            expect(hasUES()).toBe(false);

            await importUESFromServer(
                { uesEncrypted: exported.uesEncrypted, uesIv: exported.uesIv },
                masterKey
            );

            // Should now be stored locally
            expect(hasUES()).toBe(true);
        });

        it('should be loadable after import', async () => {
            const masterKey = await createMasterKey();
            const originalUes = crypto.getRandomValues(new Uint8Array(32));

            const exported = await exportUESForServer(originalUes, masterKey);
            localStorage.removeItem('cloudvault_ues_v1');

            await importUESFromServer(
                { uesEncrypted: exported.uesEncrypted, uesIv: exported.uesIv },
                masterKey
            );

            const loaded = await loadUES();
            expect(loaded).not.toBeNull();
            expect(loaded!.ues).toEqual(originalUes);
        });

        it('should throw on import with wrong Master Key', async () => {
            const masterKey1 = await createMasterKey();
            const masterKey2 = await createMasterKey();
            const ues = crypto.getRandomValues(new Uint8Array(32));

            const exported = await exportUESForServer(ues, masterKey1);

            await expect(
                importUESFromServer(
                    { uesEncrypted: exported.uesEncrypted, uesIv: exported.uesIv },
                    masterKey2 // Wrong key
                )
            ).rejects.toThrow('Failed to import UES');
        });
    });


    describe('deriveDeviceKEK', () => {
        const salt = crypto.getRandomValues(new Uint8Array(16));

        it('should return a non-extractable CryptoKey for AES-KW', async () => {
            const ues = crypto.getRandomValues(new Uint8Array(32));
            const key = await deriveDeviceKEK('password123', ues, salt);

            expect(key).toBeDefined();
            expect(key.type).toBe('secret');
            expect(key.algorithm).toMatchObject({ name: 'AES-KW', length: 256 });
            expect(key.extractable).toBe(false);
            expect(key.usages).toContain('wrapKey');
            expect(key.usages).toContain('unwrapKey');
        });

        it('should be deterministic (same inputs → same wrapped output)', async () => {
            const ues = new Uint8Array(32).fill(42);
            const fixedSalt = new Uint8Array(16).fill(7);

            const key1 = await deriveDeviceKEK('test_pass', ues, fixedSalt);
            const key2 = await deriveDeviceKEK('test_pass', ues, fixedSalt);

            // Verify determinism by wrapping the same test key with both
            const testKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
            );
            const wrapped1 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key1, 'AES-KW'));
            const wrapped2 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key2, 'AES-KW'));

            expect(wrapped1).toEqual(wrapped2);
        });

        it('should produce different keys for different passwords', async () => {
            const ues = new Uint8Array(32).fill(42);
            const fixedSalt = new Uint8Array(16).fill(7);

            const key1 = await deriveDeviceKEK('password_a', ues, fixedSalt);
            const key2 = await deriveDeviceKEK('password_b', ues, fixedSalt);

            const testKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
            );
            const wrapped1 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key1, 'AES-KW'));
            const wrapped2 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key2, 'AES-KW'));

            expect(wrapped1).not.toEqual(wrapped2);
        });

        it('should produce different keys for different UES', async () => {
            const ues1 = new Uint8Array(32).fill(1);
            const ues2 = new Uint8Array(32).fill(2);
            const fixedSalt = new Uint8Array(16).fill(7);

            const key1 = await deriveDeviceKEK('same_pass', ues1, fixedSalt);
            const key2 = await deriveDeviceKEK('same_pass', ues2, fixedSalt);

            const testKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
            );
            const wrapped1 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key1, 'AES-KW'));
            const wrapped2 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key2, 'AES-KW'));

            expect(wrapped1).not.toEqual(wrapped2);
        });

        it('should produce different keys for different salts', async () => {
            const ues = new Uint8Array(32).fill(42);
            const salt1 = new Uint8Array(16).fill(1);
            const salt2 = new Uint8Array(16).fill(2);

            const key1 = await deriveDeviceKEK('same_pass', ues, salt1);
            const key2 = await deriveDeviceKEK('same_pass', ues, salt2);

            const testKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
            );
            const wrapped1 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key1, 'AES-KW'));
            const wrapped2 = new Uint8Array(await crypto.subtle.wrapKey('raw', testKey, key2, 'AES-KW'));

            expect(wrapped1).not.toEqual(wrapped2);
        });

        it('should be usable to wrap/unwrap a key', async () => {
            const ues = crypto.getRandomValues(new Uint8Array(32));
            const kek = await deriveDeviceKEK('password', ues, salt);

            // Generate a key to wrap
            const targetKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            // Wrap
            const wrapped = await crypto.subtle.wrapKey('raw', targetKey, kek, 'AES-KW');
            expect(wrapped.byteLength).toBe(40); // 32 + 8 overhead (RFC 3394)

            // Unwrap
            const unwrapped = await crypto.subtle.unwrapKey(
                'raw',
                wrapped,
                kek,
                'AES-KW',
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            const originalRaw = new Uint8Array(await crypto.subtle.exportKey('raw', targetKey));
            const unwrappedRaw = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
            expect(unwrappedRaw).toEqual(originalRaw);
        });
    });
});
