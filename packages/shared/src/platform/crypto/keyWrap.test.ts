/**
 * Key Wrap (RFC 3394) Utility Tests
 *
 * Tests the platform-agnostic key wrap utilities:
 * - Constants (overhead, sizes, default IV)
 * - getWrappedKeySize calculation
 * - validateKeyWrapSizes (master key + KEK)
 * - validateWrappedKeySize
 * - MasterKeyMetadata creation, serialization, deserialization
 * - Base64 ↔ Uint8Array round-trip
 */

import { describe, it, expect } from 'vitest';
import {
    KEY_WRAP_CONSTANTS,
    getWrappedKeySize,
    validateKeyWrapSizes,
    validateWrappedKeySize,
    createMasterKeyMetadata,
    serializeMasterKeyMetadata,
    deserializeMasterKeyMetadata,
    uint8ArrayToBase64,
} from './keyWrap';
import { base64ToUint8Array } from './utils';

// ============ Constants ============

describe('KEY_WRAP_CONSTANTS', () => {
    it('should have 8-byte wrap overhead', () => {
        expect(KEY_WRAP_CONSTANTS.WRAP_OVERHEAD).toBe(8);
    });

    it('should have 32-byte master key size', () => {
        expect(KEY_WRAP_CONSTANTS.MASTER_KEY_SIZE).toBe(32);
    });

    it('should have 16-byte minimum key size', () => {
        expect(KEY_WRAP_CONSTANTS.MIN_KEY_SIZE).toBe(16);
    });

    it('should have correct RFC 3394 default IV', () => {
        expect(KEY_WRAP_CONSTANTS.DEFAULT_IV).toEqual(
            new Uint8Array([0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6, 0xa6])
        );
        expect(KEY_WRAP_CONSTANTS.DEFAULT_IV.length).toBe(8);
    });

    it('should have version 1 as current', () => {
        expect(KEY_WRAP_CONSTANTS.CURRENT_VERSION).toBe(1);
    });
});

// ============ getWrappedKeySize ============

describe('getWrappedKeySize', () => {
    it('should add 8 bytes overhead for 32-byte key', () => {
        expect(getWrappedKeySize(32)).toBe(40);
    });

    it('should add 8 bytes overhead for 16-byte key', () => {
        expect(getWrappedKeySize(16)).toBe(24);
    });

    it('should add 8 bytes overhead for 0 bytes', () => {
        expect(getWrappedKeySize(0)).toBe(8);
    });

    it('should handle arbitrary sizes', () => {
        expect(getWrappedKeySize(64)).toBe(72);
        expect(getWrappedKeySize(128)).toBe(136);
    });
});

// ============ validateKeyWrapSizes ============

describe('validateKeyWrapSizes', () => {
    it('should accept valid 32-byte master key and KEK', () => {
        const mk = new Uint8Array(32);
        const kek = new Uint8Array(32);
        expect(() => validateKeyWrapSizes(mk, kek)).not.toThrow();
    });

    it('should reject wrong master key size', () => {
        const mk = new Uint8Array(16); // too short
        const kek = new Uint8Array(32);
        expect(() => validateKeyWrapSizes(mk, kek)).toThrow(
            'Master key must be 32 bytes, got 16'
        );
    });

    it('should reject wrong KEK size', () => {
        const mk = new Uint8Array(32);
        const kek = new Uint8Array(16); // too short
        expect(() => validateKeyWrapSizes(mk, kek)).toThrow(
            'KEK must be 32 bytes, got 16'
        );
    });

    it('should reject oversized master key', () => {
        const mk = new Uint8Array(64);
        const kek = new Uint8Array(32);
        expect(() => validateKeyWrapSizes(mk, kek)).toThrow(
            'Master key must be 32 bytes, got 64'
        );
    });

    it('should reject empty arrays', () => {
        expect(() => validateKeyWrapSizes(new Uint8Array(0), new Uint8Array(32)))
            .toThrow('Master key must be 32 bytes, got 0');
    });

    it('should reject ML-KEM-768 secret key size (2400 bytes)', () => {
        const mk = new Uint8Array(2400);
        const kek = new Uint8Array(32);
        expect(() => validateKeyWrapSizes(mk, kek)).toThrow(
            'Master key must be 32 bytes, got 2400'
        );
    });
});

// ============ validateWrappedKeySize ============

describe('validateWrappedKeySize', () => {
    it('should accept valid 40-byte wrapped key', () => {
        const wrapped = new Uint8Array(40); // 32 + 8
        expect(() => validateWrappedKeySize(wrapped)).not.toThrow();
    });

    it('should reject wrong size', () => {
        expect(() => validateWrappedKeySize(new Uint8Array(32))).toThrow(
            'Wrapped key must be 40 bytes, got 32'
        );
    });

    it('should reject oversized wrapped key', () => {
        expect(() => validateWrappedKeySize(new Uint8Array(48))).toThrow(
            'Wrapped key must be 40 bytes, got 48'
        );
    });

    it('should reject empty', () => {
        expect(() => validateWrappedKeySize(new Uint8Array(0))).toThrow(
            'Wrapped key must be 40 bytes, got 0'
        );
    });
});

// ============ createMasterKeyMetadata ============

describe('createMasterKeyMetadata', () => {
    it('should create metadata with correct fields', () => {
        const wrappedKey = new Uint8Array(40).fill(0xAB);
        const salt = new Uint8Array(16).fill(0xCD);

        const metadata = createMasterKeyMetadata(wrappedKey, salt, 'argon2id', {
            memoryCost: 47104,
            timeCost: 1,
            parallelism: 1,
        });

        expect(metadata.algorithm).toBe('aes-kw');
        expect(metadata.version).toBe(1);
        expect(metadata.kdfAlgorithm).toBe('argon2id');
        expect(metadata.kdfParams.memoryCost).toBe(47104);
        expect(metadata.kdfParams.timeCost).toBe(1);
        expect(metadata.kdfParams.parallelism).toBe(1);
        expect(typeof metadata.createdAt).toBe('string');
        expect(typeof metadata.wrappedKey).toBe('string');
        expect(typeof metadata.salt).toBe('string');
    });

    it('should base64 encode wrappedKey and salt', () => {
        const wrappedKey = new Uint8Array([1, 2, 3, 4, 5]);
        const salt = new Uint8Array([10, 20, 30]);

        const metadata = createMasterKeyMetadata(wrappedKey, salt, 'pbkdf2', {
            iterations: 600000,
        });

        // Verify round-trip
        expect(base64ToUint8Array(metadata.wrappedKey)).toEqual(wrappedKey);
        expect(base64ToUint8Array(metadata.salt)).toEqual(salt);
    });

    it('should set createdAt to an ISO date string', () => {
        const metadata = createMasterKeyMetadata(
            new Uint8Array(40),
            new Uint8Array(16),
            'argon2id',
            {}
        );

        const parsed = new Date(metadata.createdAt);
        expect(parsed.getTime()).not.toBeNaN();
    });
});

// ============ serialize / deserialize ============

describe('serializeMasterKeyMetadata / deserializeMasterKeyMetadata', () => {
    it('should round-trip', () => {
        const metadata = createMasterKeyMetadata(
            new Uint8Array(40).fill(0x42),
            new Uint8Array(16).fill(0x99),
            'argon2id',
            { memoryCost: 47104, timeCost: 1, parallelism: 1 }
        );

        const json = serializeMasterKeyMetadata(metadata);
        expect(typeof json).toBe('string');

        const restored = deserializeMasterKeyMetadata(json);
        expect(restored.algorithm).toBe(metadata.algorithm);
        expect(restored.version).toBe(metadata.version);
        expect(restored.kdfAlgorithm).toBe(metadata.kdfAlgorithm);
        expect(restored.kdfParams).toEqual(metadata.kdfParams);
        expect(restored.wrappedKey).toBe(metadata.wrappedKey);
        expect(restored.salt).toBe(metadata.salt);
    });

    it('should produce valid JSON', () => {
        const metadata = createMasterKeyMetadata(
            new Uint8Array(40),
            new Uint8Array(16),
            'pbkdf2',
            { iterations: 600000 }
        );

        const json = serializeMasterKeyMetadata(metadata);
        expect(() => JSON.parse(json)).not.toThrow();
    });
});

// ============ Base64 Utilities ============

describe('uint8ArrayToBase64 / base64ToUint8Array', () => {
    it('should round-trip simple data', () => {
        const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const b64 = uint8ArrayToBase64(data);
        const restored = base64ToUint8Array(b64);
        expect(restored).toEqual(data);
    });

    it('should handle empty array', () => {
        const b64 = uint8ArrayToBase64(new Uint8Array(0));
        const restored = base64ToUint8Array(b64);
        expect(restored.length).toBe(0);
    });

    it('should handle all byte values (0-255)', () => {
        const allBytes = new Uint8Array(256);
        for (let i = 0; i < 256; i++) allBytes[i] = i;

        const b64 = uint8ArrayToBase64(allBytes);
        const restored = base64ToUint8Array(b64);
        expect(restored).toEqual(allBytes);
    });

    it('should produce standard base64 (btoa compatible)', () => {
        const data = new Uint8Array([0, 128, 255]);
        const b64 = uint8ArrayToBase64(data);
        expect(b64).toBe(btoa(String.fromCharCode(0, 128, 255)));
    });

    it('should handle 32-byte key (common case)', () => {
        const key = crypto.getRandomValues(new Uint8Array(32));
        const b64 = uint8ArrayToBase64(key);
        const restored = base64ToUint8Array(b64);
        expect(restored).toEqual(key);
    });

    it('should handle 40-byte wrapped key (common case)', () => {
        const wrapped = crypto.getRandomValues(new Uint8Array(40));
        const b64 = uint8ArrayToBase64(wrapped);
        const restored = base64ToUint8Array(b64);
        expect(restored).toEqual(wrapped);
    });
});
