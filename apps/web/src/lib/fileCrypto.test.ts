/**
 * File Crypto Tests
 *
 * Tests for filename/thumbnail encryption and decryption utilities.
 * Uses REAL WebCrypto (Node 20 native) — no mocked crypto.subtle.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import {
  encryptFilename,
  decryptFilename,
  encryptThumbnail,
  decryptThumbnail,
  decryptThumbnailFromUrl,
  CRYPTO_CONFIG,
} from './fileCrypto';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@stenvault/shared/platform/crypto';

// Only mock fetch (legitimate — network boundary)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============ Real AES-GCM Key Helper ============

async function generateTestKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function generateWrongKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

describe('fileCrypto', () => {
  let testKey: CryptoKey;

  beforeAll(async () => {
    testKey = await generateTestKey();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('arrayBufferToBase64 (shared utility)', () => {
    it('should convert ArrayBuffer to base64', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"
      const result = arrayBufferToBase64(buffer);
      expect(result).toBe('SGVsbG8=');
    });

    it('should handle empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      const result = arrayBufferToBase64(buffer);
      expect(result).toBe('');
    });
  });

  describe('base64ToArrayBuffer (shared utility)', () => {
    it('should convert base64 to ArrayBuffer', () => {
      const base64 = 'SGVsbG8='; // "Hello"
      const result = base64ToArrayBuffer(base64);
      const bytes = new Uint8Array(result);
      expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
    });

    it('should handle empty string', () => {
      const result = base64ToArrayBuffer('');
      expect(result.byteLength).toBe(0);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve data through base64 round-trip', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const base64 = arrayBufferToBase64(original.buffer as ArrayBuffer);
      const recovered = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(recovered)).toEqual(Array.from(original));
    });
  });

  describe('CRYPTO_CONFIG', () => {
    it('should have 12-byte IV length', () => {
      expect(CRYPTO_CONFIG.IV_LENGTH).toBe(12);
    });
  });

  // ========== Filename Encryption ==========
  describe('encryptFilename', () => {
    it('should encrypt a filename and return base64 encoded result', async () => {
      const result = await encryptFilename('test-file.pdf', testKey);

      expect(result).toHaveProperty('encryptedFilename');
      expect(result).toHaveProperty('iv');
      expect(typeof result.encryptedFilename).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(result.encryptedFilename.length).toBeGreaterThan(0);
      expect(result.iv.length).toBeGreaterThan(0);
    });

    it('should generate different IV for each encryption', async () => {
      const result1 = await encryptFilename('document.txt', testKey);
      const result2 = await encryptFilename('document.txt', testKey);

      // Same plaintext, same key, but different IVs → different ciphertext
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encryptedFilename).not.toBe(result2.encryptedFilename);
    });

    it('should produce 12-byte IV encoded as base64', async () => {
      const result = await encryptFilename('test.txt', testKey);
      const ivBytes = new Uint8Array(base64ToArrayBuffer(result.iv));
      expect(ivBytes.length).toBe(12);
    });

    it('should throw error for empty filename', async () => {
      await expect(encryptFilename('', testKey)).rejects.toThrow('Filename is required');
    });

    it('should handle filenames with special characters', async () => {
      const result = await encryptFilename('relatório-2024 (final).pdf', testKey);

      expect(result.encryptedFilename).toBeDefined();
      expect(result.iv).toBeDefined();
    });

    it('should handle very long filenames', async () => {
      const longFilename = 'a'.repeat(255) + '.txt';
      const result = await encryptFilename(longFilename, testKey);

      expect(result.encryptedFilename).toBeDefined();
    });

    it('should handle Unicode filenames', async () => {
      const result = await encryptFilename('文档-τεστ-🔐.pdf', testKey);

      expect(result.encryptedFilename).toBeDefined();
    });
  });

  describe('decryptFilename', () => {
    it('should decrypt a filename and return plain text', async () => {
      const original = 'decrypted-file.pdf';
      const encrypted = await encryptFilename(original, testKey);

      const result = await decryptFilename(encrypted.encryptedFilename, testKey, encrypted.iv);

      expect(result).toBe(original);
    });

    it('should throw error for empty encrypted filename', async () => {
      const mockIv = arrayBufferToBase64(new Uint8Array(12).buffer as ArrayBuffer);
      await expect(decryptFilename('', testKey, mockIv)).rejects.toThrow('Encrypted filename and IV are required');
    });

    it('should throw error for empty IV', async () => {
      await expect(decryptFilename('somedata', testKey, '')).rejects.toThrow('Encrypted filename and IV are required');
    });

    it('should throw descriptive error on decryption failure (wrong key)', async () => {
      const encrypted = await encryptFilename('secret.txt', testKey);
      const wrongKey = await generateWrongKey();

      await expect(
        decryptFilename(encrypted.encryptedFilename, wrongKey, encrypted.iv)
      ).rejects.toThrow('Filename decryption failed');
    });

    it('should throw descriptive error on tampered ciphertext', async () => {
      const encrypted = await encryptFilename('secret.txt', testKey);

      // Tamper with ciphertext
      const raw = new Uint8Array(base64ToArrayBuffer(encrypted.encryptedFilename));
      raw[0] = raw[0]! ^ 0xFF;
      const tampered = arrayBufferToBase64(raw.buffer as ArrayBuffer);

      await expect(
        decryptFilename(tampered, testKey, encrypted.iv)
      ).rejects.toThrow('Filename decryption failed');
    });

    it('should correctly decode UTF-8 filenames after decryption', async () => {
      const originalFilename = 'documento-português-日本語.pdf';
      const encrypted = await encryptFilename(originalFilename, testKey);

      const result = await decryptFilename(encrypted.encryptedFilename, testKey, encrypted.iv);

      expect(result).toBe(originalFilename);
    });
  });

  describe('encryptFilename and decryptFilename roundtrip', () => {
    it('should encrypt and decrypt filename correctly', async () => {
      const originalFilename = 'test-document.pdf';

      const encrypted = await encryptFilename(originalFilename, testKey);
      expect(encrypted.encryptedFilename).toBeDefined();
      expect(encrypted.iv).toBeDefined();

      const decrypted = await decryptFilename(encrypted.encryptedFilename, testKey, encrypted.iv);
      expect(decrypted).toBe(originalFilename);
    });

    it('should roundtrip filenames with emoji and mixed scripts', async () => {
      const filenames = [
        'relatório-2024.pdf',
        '日本語テスト.doc',
        '🔐encrypted🔑file.txt',
        'файл документа.xlsx',
        'αρχείο.csv',
      ];

      for (const filename of filenames) {
        const encrypted = await encryptFilename(filename, testKey);
        const decrypted = await decryptFilename(encrypted.encryptedFilename, testKey, encrypted.iv);
        expect(decrypted).toBe(filename);
      }
    });
  });

  // ========== Thumbnail Encryption ==========
  describe('encryptThumbnail', () => {
    it('should encrypt a thumbnail blob and return encrypted result', async () => {
      const thumbnailBlob = new Blob(['fake-image-data'], { type: 'image/webp' });

      const result = await encryptThumbnail(thumbnailBlob, testKey);

      expect(result).toHaveProperty('encryptedBlob');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('size');
      expect(result.encryptedBlob).toBeInstanceOf(Blob);
    });

    it('should generate unique IV for each encryption', async () => {
      const blob = new Blob(['data'], { type: 'image/webp' });

      const result1 = await encryptThumbnail(blob, testKey);
      const result2 = await encryptThumbnail(blob, testKey);

      expect(result1.iv).not.toBe(result2.iv);
    });

    it('should return base64 encoded IV (12 bytes)', async () => {
      const blob = new Blob(['data'], { type: 'image/webp' });

      const result = await encryptThumbnail(blob, testKey);

      expect(typeof result.iv).toBe('string');
      expect(() => atob(result.iv)).not.toThrow();
      const ivBytes = new Uint8Array(base64ToArrayBuffer(result.iv));
      expect(ivBytes.length).toBe(12);
    });

    it('should return encrypted blob as application/octet-stream', async () => {
      const blob = new Blob(['data'], { type: 'image/webp' });

      const result = await encryptThumbnail(blob, testKey);

      expect(result.encryptedBlob.type).toBe('application/octet-stream');
    });

    it('should produce ciphertext larger than plaintext (GCM auth tag)', async () => {
      const data = new Uint8Array(100);
      crypto.getRandomValues(data);
      const blob = new Blob([data], { type: 'image/webp' });

      const result = await encryptThumbnail(blob, testKey);

      // AES-GCM adds 16-byte auth tag
      expect(result.size).toBe(100 + 16);
    });
  });

  describe('decryptThumbnail', () => {
    it('should decrypt a thumbnail and return WebP blob', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);
      const blob = new Blob([originalData], { type: 'image/webp' });

      const encrypted = await encryptThumbnail(blob, testKey);
      const result = await decryptThumbnail(encrypted.encryptedBlob, testKey, encrypted.iv);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/webp');

      // Verify content matches
      const decryptedBytes = new Uint8Array(await result.arrayBuffer());
      expect(Array.from(decryptedBytes)).toEqual(Array.from(originalData));
    });

    it('should throw error when IV is missing', async () => {
      const blob = new Blob(['data'], { type: 'application/octet-stream' });

      await expect(decryptThumbnail(blob, testKey, '')).rejects.toThrow('IV is required');
    });

    it('should throw descriptive error on decryption failure (wrong key)', async () => {
      const blob = new Blob(['data'], { type: 'image/webp' });
      const encrypted = await encryptThumbnail(blob, testKey);
      const wrongKey = await generateWrongKey();

      await expect(
        decryptThumbnail(encrypted.encryptedBlob, wrongKey, encrypted.iv)
      ).rejects.toThrow('Thumbnail decryption failed');
    });

    it('should throw descriptive error on tampered data', async () => {
      const blob = new Blob([new Uint8Array(50)], { type: 'image/webp' });
      const encrypted = await encryptThumbnail(blob, testKey);

      // Tamper with encrypted data
      const raw = new Uint8Array(await encrypted.encryptedBlob.arrayBuffer());
      raw[0] = raw[0]! ^ 0xFF;
      const tamperedBlob = new Blob([raw], { type: 'application/octet-stream' });

      await expect(
        decryptThumbnail(tamperedBlob, testKey, encrypted.iv)
      ).rejects.toThrow('Thumbnail decryption failed');
    });
  });

  describe('decryptThumbnailFromUrl', () => {
    it('should fetch encrypted thumbnail and decrypt it', async () => {
      const originalData = new Uint8Array([10, 20, 30, 40, 50]);
      const blob = new Blob([originalData], { type: 'image/webp' });
      const encrypted = await encryptThumbnail(blob, testKey);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(encrypted.encryptedBlob),
      });

      const result = await decryptThumbnailFromUrl(
        'https://r2.example.com/thumbnail/abc123',
        testKey,
        encrypted.iv
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/webp');
      expect(mockFetch).toHaveBeenCalledWith('https://r2.example.com/thumbnail/abc123');

      // Verify content roundtrip
      const decryptedBytes = new Uint8Array(await result.arrayBuffer());
      expect(Array.from(decryptedBytes)).toEqual(Array.from(originalData));
    });

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const mockIv = arrayBufferToBase64(new Uint8Array(12).buffer as ArrayBuffer);
      await expect(
        decryptThumbnailFromUrl('https://example.com/notfound', testKey, mockIv)
      ).rejects.toThrow('Failed to fetch thumbnail: 404');
    });

    it('should throw error when network fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const mockIv = arrayBufferToBase64(new Uint8Array(12).buffer as ArrayBuffer);
      await expect(
        decryptThumbnailFromUrl('https://example.com/file', testKey, mockIv)
      ).rejects.toThrow();
    });
  });

  describe('thumbnail encryption roundtrip', () => {
    it('should encrypt and decrypt thumbnail correctly', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);
      const originalBlob = new Blob([originalData], { type: 'image/webp' });

      const encrypted = await encryptThumbnail(originalBlob, testKey);

      expect(encrypted.encryptedBlob).toBeInstanceOf(Blob);
      expect(encrypted.iv).toBeDefined();

      const decrypted = await decryptThumbnail(encrypted.encryptedBlob, testKey, encrypted.iv);

      expect(decrypted).toBeInstanceOf(Blob);
      expect(decrypted.type).toBe('image/webp');

      const decryptedBytes = new Uint8Array(await decrypted.arrayBuffer());
      expect(Array.from(decryptedBytes)).toEqual(Array.from(originalData));
    });

    it('should roundtrip large thumbnail (100KB)', async () => {
      const data = new Uint8Array(100 * 1024);
      for (let i = 0; i < data.length; i += 65536) {
        crypto.getRandomValues(data.subarray(i, Math.min(i + 65536, data.length)));
      }
      const blob = new Blob([data], { type: 'image/webp' });

      const encrypted = await encryptThumbnail(blob, testKey);
      const decrypted = await decryptThumbnail(encrypted.encryptedBlob, testKey, encrypted.iv);

      const decryptedBytes = new Uint8Array(await decrypted.arrayBuffer());
      expect(decryptedBytes).toEqual(data);
    });
  });
});
