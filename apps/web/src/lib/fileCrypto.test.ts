/**
 * File Crypto Tests (v3/v4 only)
 *
 * Tests for file encryption and decryption utilities.
 * Uses mocked crypto.subtle to test logic without actual WebCrypto.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock crypto.subtle.encrypt/decrypt and crypto.getRandomValues
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();
const mockGetRandomValues = vi.fn();

// Save original and install mocks
const originalCrypto = globalThis.crypto;
beforeEach(() => {
  // Reset and install fresh mocks
  vi.clearAllMocks();

  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        encrypt: mockEncrypt,
        decrypt: mockDecrypt,
      },
      getRandomValues: mockGetRandomValues.mockImplementation((arr: Uint8Array) => {
        // Fill with deterministic values for testing
        for (let i = 0; i < arr.length; i++) {
          arr[i] = (i + 1) % 256;
        }
        return arr;
      }),
    },
    writable: true,
    configurable: true,
  });
});

vi.mock('@/lib/platform', () => ({
  arrayBufferToBase64: (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
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
  CRYPTO_CONSTANTS: {
    PBKDF2_ITERATIONS: 600000,
    AES_KEY_LENGTH: 256,
    GCM_IV_LENGTH: 12,
    SALT_LENGTH: 32,
  },
}));

// Import after mocks are set up
import {
  encryptFilename,
  decryptFilename,
  CRYPTO_CONFIG,
} from './fileCrypto';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/platform';

// Mock fetch for URL decryption tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fileCrypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-install getRandomValues mock after clearAllMocks
    mockGetRandomValues.mockImplementation((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = (i + 1) % 256;
      }
      return arr;
    });
  });

  describe('arrayBufferToBase64', () => {
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

  describe('base64ToArrayBuffer', () => {
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
      const base64 = arrayBufferToBase64(original.buffer);
      const recovered = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(recovered)).toEqual(Array.from(original));
    });
  });

  describe('CRYPTO_CONFIG', () => {
    it('should have correct PBKDF2 iterations', () => {
      expect(CRYPTO_CONFIG.PBKDF2_ITERATIONS).toBe(600000);
    });

    it('should have 256-bit key length', () => {
      expect(CRYPTO_CONFIG.KEY_LENGTH).toBe(256);
    });

    it('should have 12-byte IV length', () => {
      expect(CRYPTO_CONFIG.IV_LENGTH).toBe(12);
    });

    it('should have 32-byte salt length', () => {
      expect(CRYPTO_CONFIG.SALT_LENGTH).toBe(32);
    });

    it('should have version 3 constant', () => {
      expect(CRYPTO_CONFIG.ENCRYPTION_VERSION_3).toBe(3);
    });
  });

  describe('encryptFilename', () => {
    const mockKey = { type: 'secret' } as CryptoKey;
    const mockCiphertext = new ArrayBuffer(32);

    beforeEach(() => {
      mockEncrypt.mockResolvedValue(mockCiphertext);
    });

    it('should encrypt a filename and return base64 encoded result', async () => {
      const result = await encryptFilename('test-file.pdf', mockKey);

      expect(result).toHaveProperty('encryptedFilename');
      expect(result).toHaveProperty('iv');
      expect(typeof result.encryptedFilename).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(result.encryptedFilename.length).toBeGreaterThan(0);
      expect(result.iv.length).toBeGreaterThan(0);
    });

    it('should generate random IV for each encryption', async () => {
      await encryptFilename('document.txt', mockKey);

      expect(mockGetRandomValues).toHaveBeenCalled();
      // Verify the IV was 12 bytes
      const call = mockGetRandomValues.mock.calls.find(
        (c: any[]) => c[0] instanceof Uint8Array && c[0].length === 12
      );
      expect(call).toBeTruthy();
    });

    it('should call crypto.subtle.encrypt with correct parameters', async () => {
      await encryptFilename('my-secret-file.docx', mockKey);

      expect(mockEncrypt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM' }),
        mockKey,
        expect.any(ArrayBuffer)
      );
    });

    it('should throw error for empty filename', async () => {
      await expect(encryptFilename('', mockKey)).rejects.toThrow('Filename is required');
    });

    it('should handle filenames with special characters', async () => {
      const result = await encryptFilename('relat\u00f3rio-2024 (final).pdf', mockKey);

      expect(result.encryptedFilename).toBeDefined();
      expect(result.iv).toBeDefined();
    });

    it('should handle very long filenames', async () => {
      const longFilename = 'a'.repeat(255) + '.txt';
      const result = await encryptFilename(longFilename, mockKey);

      expect(result.encryptedFilename).toBeDefined();
    });

    it('should handle Unicode filenames', async () => {
      const result = await encryptFilename('\u6587\u6863-\u03c4\u03b5\u03c3\u03c4-\ud83d\udd10.pdf', mockKey);

      expect(result.encryptedFilename).toBeDefined();
    });
  });

  describe('decryptFilename', () => {
    const mockKey = { type: 'secret' } as CryptoKey;
    const mockIvBase64 = btoa(String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));

    beforeEach(() => {
      // Mock decryptAES to return the original filename bytes
      const filenameBytes = new TextEncoder().encode('decrypted-file.pdf');
      mockDecrypt.mockResolvedValue(filenameBytes.buffer);
    });

    it('should decrypt a filename and return plain text', async () => {
      const encryptedFilename = btoa('encrypted-data');
      const result = await decryptFilename(encryptedFilename, mockKey, mockIvBase64);

      expect(typeof result).toBe('string');
      expect(result).toBe('decrypted-file.pdf');
    });

    it('should call crypto.subtle.decrypt with correct parameters', async () => {
      const encryptedFilename = btoa('encrypted-data');
      await decryptFilename(encryptedFilename, mockKey, mockIvBase64);

      expect(mockDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM' }),
        mockKey,
        expect.any(ArrayBuffer)
      );
    });

    it('should throw error for empty encrypted filename', async () => {
      await expect(decryptFilename('', mockKey, mockIvBase64)).rejects.toThrow('Encrypted filename and IV are required');
    });

    it('should throw error for empty IV', async () => {
      await expect(decryptFilename('somedata', mockKey, '')).rejects.toThrow('Encrypted filename and IV are required');
    });

    it('should throw descriptive error on decryption failure', async () => {
      mockDecrypt.mockRejectedValue(new Error('GCM auth failed'));
      const encryptedFilename = btoa('corrupted-data');

      await expect(
        decryptFilename(encryptedFilename, mockKey, mockIvBase64)
      ).rejects.toThrow('Filename decryption failed');
    });

    it('should correctly decode UTF-8 filenames after decryption', async () => {
      const originalFilename = 'documento-portugu\u00eas-\u65e5\u672c\u8a9e.pdf';
      const filenameBytes = new TextEncoder().encode(originalFilename);
      mockDecrypt.mockResolvedValue(filenameBytes.buffer);

      const encryptedFilename = btoa('encrypted-utf8');
      const result = await decryptFilename(encryptedFilename, mockKey, mockIvBase64);

      expect(result).toBe(originalFilename);
    });
  });

  describe('encryptFilename and decryptFilename roundtrip', () => {
    const mockKey = { type: 'secret' } as CryptoKey;

    it('should encrypt and decrypt filename correctly', async () => {
      const originalFilename = 'test-document.pdf';

      // Store the encrypted bytes for decryption
      let encryptedBytes: ArrayBuffer;
      mockEncrypt.mockImplementation(async (_algo: any, _key: any, data: ArrayBuffer) => {
        encryptedBytes = data;
        return data; // Return same data for simplicity
      });

      mockDecrypt.mockImplementation(async () => {
        return encryptedBytes;
      });

      // Encrypt
      const encrypted = await encryptFilename(originalFilename, mockKey);
      expect(encrypted.encryptedFilename).toBeDefined();
      expect(encrypted.iv).toBeDefined();

      // Decrypt
      const decrypted = await decryptFilename(encrypted.encryptedFilename, mockKey, encrypted.iv);
      expect(decrypted).toBe(originalFilename);
    });
  });

  describe('encryptThumbnail', () => {
    const mockKey = { type: 'secret' } as CryptoKey;
    const mockCiphertext = new ArrayBuffer(128);

    beforeEach(() => {
      mockEncrypt.mockResolvedValue(mockCiphertext);
    });

    it('should encrypt a thumbnail blob and return encrypted result', async () => {
      const { encryptThumbnail } = await import('./fileCrypto');
      const thumbnailBlob = new Blob(['fake-image-data'], { type: 'image/webp' });

      const result = await encryptThumbnail(thumbnailBlob, mockKey);

      expect(result).toHaveProperty('encryptedBlob');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('size');
      expect(result.encryptedBlob).toBeInstanceOf(Blob);
    });

    it('should generate random IV for encryption', async () => {
      const { encryptThumbnail } = await import('./fileCrypto');
      const thumbnailBlob = new Blob(['data'], { type: 'image/webp' });

      await encryptThumbnail(thumbnailBlob, mockKey);

      expect(mockGetRandomValues).toHaveBeenCalled();
    });

    it('should return base64 encoded IV', async () => {
      const { encryptThumbnail } = await import('./fileCrypto');
      const thumbnailBlob = new Blob(['data'], { type: 'image/webp' });

      const result = await encryptThumbnail(thumbnailBlob, mockKey);

      expect(typeof result.iv).toBe('string');
      // Should be valid base64
      expect(() => atob(result.iv)).not.toThrow();
    });

    it('should call crypto.subtle.encrypt with blob data', async () => {
      const { encryptThumbnail } = await import('./fileCrypto');
      const thumbnailBlob = new Blob(['test-data'], { type: 'image/webp' });

      await encryptThumbnail(thumbnailBlob, mockKey);

      expect(mockEncrypt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM' }),
        mockKey,
        expect.any(ArrayBuffer)
      );
    });

    it('should return encrypted blob as application/octet-stream', async () => {
      const { encryptThumbnail } = await import('./fileCrypto');
      const thumbnailBlob = new Blob(['data'], { type: 'image/webp' });

      const result = await encryptThumbnail(thumbnailBlob, mockKey);

      expect(result.encryptedBlob.type).toBe('application/octet-stream');
    });
  });

  describe('decryptThumbnail', () => {
    const mockKey = { type: 'secret' } as CryptoKey;
    const mockIvBase64 = btoa(String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
    const mockDecryptedData = new ArrayBuffer(128);

    beforeEach(() => {
      mockDecrypt.mockResolvedValue(mockDecryptedData);
    });

    it('should decrypt a thumbnail and return WebP blob', async () => {
      const { decryptThumbnail } = await import('./fileCrypto');
      const encryptedBlob = new Blob(['encrypted-data'], { type: 'application/octet-stream' });

      const result = await decryptThumbnail(encryptedBlob, mockKey, mockIvBase64);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/webp');
    });

    it('should call crypto.subtle.decrypt with correct parameters', async () => {
      const { decryptThumbnail } = await import('./fileCrypto');
      const encryptedBlob = new Blob(['encrypted-data'], { type: 'application/octet-stream' });

      await decryptThumbnail(encryptedBlob, mockKey, mockIvBase64);

      expect(mockDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM' }),
        mockKey,
        expect.any(ArrayBuffer)
      );
    });

    it('should throw error when IV is missing', async () => {
      const { decryptThumbnail } = await import('./fileCrypto');
      const encryptedBlob = new Blob(['data'], { type: 'application/octet-stream' });

      await expect(decryptThumbnail(encryptedBlob, mockKey, '')).rejects.toThrow('IV is required');
    });

    it('should throw descriptive error on decryption failure', async () => {
      mockDecrypt.mockRejectedValue(new Error('GCM auth failed'));
      const { decryptThumbnail } = await import('./fileCrypto');
      const encryptedBlob = new Blob(['corrupted'], { type: 'application/octet-stream' });

      await expect(
        decryptThumbnail(encryptedBlob, mockKey, mockIvBase64)
      ).rejects.toThrow('Thumbnail decryption failed');
    });
  });

  describe('decryptThumbnailFromUrl', () => {
    const mockKey = { type: 'secret' } as CryptoKey;
    const mockIvBase64 = btoa(String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
    const mockDecryptedData = new ArrayBuffer(128);

    beforeEach(() => {
      vi.clearAllMocks();
      mockDecrypt.mockResolvedValue(mockDecryptedData);
      // Re-install getRandomValues mock
      mockGetRandomValues.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = (i + 1) % 256;
        }
        return arr;
      });
    });

    it('should fetch encrypted thumbnail and decrypt it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['encrypted-data'])),
      });

      const { decryptThumbnailFromUrl } = await import('./fileCrypto');
      const result = await decryptThumbnailFromUrl(
        'https://r2.example.com/thumbnail/abc123',
        mockKey,
        mockIvBase64
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/webp');
      expect(mockFetch).toHaveBeenCalledWith('https://r2.example.com/thumbnail/abc123');
    });

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { decryptThumbnailFromUrl } = await import('./fileCrypto');

      await expect(
        decryptThumbnailFromUrl('https://example.com/notfound', mockKey, mockIvBase64)
      ).rejects.toThrow('Failed to fetch thumbnail: 404');
    });

    it('should throw error when network fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { decryptThumbnailFromUrl } = await import('./fileCrypto');

      await expect(
        decryptThumbnailFromUrl('https://example.com/file', mockKey, mockIvBase64)
      ).rejects.toThrow();
    });
  });

  describe('thumbnail encryption roundtrip', () => {
    const mockKey = { type: 'secret' } as CryptoKey;

    it('should encrypt and decrypt thumbnail correctly', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);

      // Setup mocks for roundtrip
      let encryptedBytes: ArrayBuffer;
      mockEncrypt.mockImplementation(async (_algo: any, _key: any, data: ArrayBuffer) => {
        encryptedBytes = data;
        return data; // Return same data for simplicity
      });

      mockDecrypt.mockImplementation(async () => {
        return encryptedBytes;
      });

      const { encryptThumbnail, decryptThumbnail } = await import('./fileCrypto');

      // Encrypt
      const originalBlob = new Blob([originalData], { type: 'image/webp' });
      const encrypted = await encryptThumbnail(originalBlob, mockKey);

      expect(encrypted.encryptedBlob).toBeInstanceOf(Blob);
      expect(encrypted.iv).toBeDefined();

      // Decrypt
      const decrypted = await decryptThumbnail(encrypted.encryptedBlob, mockKey, encrypted.iv);

      expect(decrypted).toBeInstanceOf(Blob);
      expect(decrypted.type).toBe('image/webp');
    });
  });
});
