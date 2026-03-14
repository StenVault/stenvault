/**
 * Public Send Crypto - Unit Tests
 * Tests AES-256-GCM encryption/decryption for anonymous file sharing.
 */
import { describe, it, expect } from "vitest";
import {
  generateSendKey,
  keyToFragment,
  fragmentToKey,
  encryptMetadata,
  decryptMetadata,
  encryptChunk,
  decryptChunk,
  getEncryptedChunkSize,
  SEND_CHUNK_SIZE,
  SEND_ENCRYPTION_OVERHEAD,
} from "../publicSendCrypto";

describe("publicSendCrypto", () => {
  describe("generateSendKey", () => {
    it("generates a 256-bit AES-GCM key", async () => {
      const key = await generateSendKey();
      expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain("encrypt");
      expect(key.usages).toContain("decrypt");
    });

    it("generates unique keys", async () => {
      const key1 = await generateSendKey();
      const key2 = await generateSendKey();
      const raw1 = await crypto.subtle.exportKey("raw", key1);
      const raw2 = await crypto.subtle.exportKey("raw", key2);
      expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2));
    });
  });

  describe("keyToFragment / fragmentToKey", () => {
    it("roundtrips a key through base64url fragment", async () => {
      const original = await generateSendKey();
      const fragment = await keyToFragment(original);

      // Fragment should be base64url (no +, /, or =)
      expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes → 43 base64url chars (no padding)
      expect(fragment.length).toBe(43);

      // Verify key can decrypt data encrypted with original
      const restored = await fragmentToKey(fragment);
      const testData = new Uint8Array([1, 2, 3, 4]);
      const encrypted = await encryptChunk(testData, original);
      const decrypted = await decryptChunk(encrypted, restored);
      expect(decrypted).toEqual(testData);
    });

    it("rejects invalid key length", async () => {
      const shortFragment = btoa("short").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      await expect(fragmentToKey(shortFragment)).rejects.toThrow("Invalid key length");
    });
  });

  describe("encryptMetadata / decryptMetadata", () => {
    it("roundtrips file metadata", async () => {
      const key = await generateSendKey();
      const meta = { name: "report.pdf", type: "application/pdf" };

      const { ciphertext, iv } = await encryptMetadata(meta, key);
      expect(ciphertext).toBeTruthy();
      expect(iv).toBeTruthy();

      const decrypted = await decryptMetadata(ciphertext, iv, key);
      expect(decrypted).toEqual(meta);
    });

    it("handles unicode filenames", async () => {
      const key = await generateSendKey();
      const meta = { name: "relatório_2026.pdf", type: "application/pdf" };

      const { ciphertext, iv } = await encryptMetadata(meta, key);
      const decrypted = await decryptMetadata(ciphertext, iv, key);
      expect(decrypted).toEqual(meta);
    });

    it("fails with wrong key", async () => {
      const key1 = await generateSendKey();
      const key2 = await generateSendKey();
      const meta = { name: "test.txt", type: "text/plain" };

      const { ciphertext, iv } = await encryptMetadata(meta, key1);
      await expect(decryptMetadata(ciphertext, iv, key2)).rejects.toThrow();
    });
  });

  describe("encryptChunk / decryptChunk", () => {
    it("roundtrips a chunk", async () => {
      const key = await generateSendKey();
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const encrypted = await encryptChunk(original, key);
      const decrypted = await decryptChunk(encrypted, key);

      expect(decrypted).toEqual(original);
    });

    it("produces correct encrypted size", async () => {
      const key = await generateSendKey();
      const original = new Uint8Array(1024); // 1KB
      crypto.getRandomValues(original);

      const encrypted = await encryptChunk(original, key);
      expect(encrypted.byteLength).toBe(1024 + SEND_ENCRYPTION_OVERHEAD);
    });

    it("handles full-size chunk (5MB)", async () => {
      const key = await generateSendKey();
      const original = new Uint8Array(SEND_CHUNK_SIZE);
      // Fill first and last bytes for verification
      original[0] = 0xAB;
      original[SEND_CHUNK_SIZE - 1] = 0xCD;

      const encrypted = await encryptChunk(original, key);
      expect(encrypted.byteLength).toBe(SEND_CHUNK_SIZE + SEND_ENCRYPTION_OVERHEAD);

      const decrypted = await decryptChunk(encrypted, key);
      expect(decrypted[0]).toBe(0xAB);
      expect(decrypted[SEND_CHUNK_SIZE - 1]).toBe(0xCD);
      expect(decrypted.byteLength).toBe(SEND_CHUNK_SIZE);
    });

    it("fails with wrong key", async () => {
      const key1 = await generateSendKey();
      const key2 = await generateSendKey();
      const original = new Uint8Array([1, 2, 3, 4]);

      const encrypted = await encryptChunk(original, key1);
      await expect(decryptChunk(encrypted, key2)).rejects.toThrow();
    });

    it("each chunk has unique IV", async () => {
      const key = await generateSendKey();
      const data = new Uint8Array([1, 2, 3]);

      const enc1 = await encryptChunk(data, key);
      const enc2 = await encryptChunk(data, key);

      // IVs (first 12 bytes) should differ
      const iv1 = enc1.slice(0, 12);
      const iv2 = enc2.slice(0, 12);
      expect(iv1).not.toEqual(iv2);
    });
  });

  describe("getEncryptedChunkSize", () => {
    it("adds encryption overhead", () => {
      expect(getEncryptedChunkSize(1024)).toBe(1024 + 28);
      expect(getEncryptedChunkSize(SEND_CHUNK_SIZE)).toBe(SEND_CHUNK_SIZE + 28);
      expect(getEncryptedChunkSize(0)).toBe(28);
    });
  });

  describe("multi-chunk file roundtrip", () => {
    it("encrypts and decrypts multi-chunk data", async () => {
      const key = await generateSendKey();
      // Use smaller chunks for test (getRandomValues has 64KB limit)
      const testChunkSize = 10000; // 10KB
      const fileSize = testChunkSize * 2 + 100;
      const file = new Uint8Array(fileSize);
      // Fill in segments to avoid getRandomValues 64KB limit
      for (let i = 0; i < fileSize; i += 65536) {
        const end = Math.min(i + 65536, fileSize);
        crypto.getRandomValues(file.subarray(i, end));
      }

      // Encrypt chunks
      const encryptedChunks: Uint8Array[] = [];
      const totalChunks = Math.ceil(fileSize / testChunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * testChunkSize;
        const end = Math.min(start + testChunkSize, fileSize);
        const chunk = file.slice(start, end);
        const encrypted = await encryptChunk(chunk, key);
        encryptedChunks.push(encrypted);
      }

      expect(encryptedChunks).toHaveLength(3);

      // Decrypt chunks
      const decryptedChunks: Uint8Array[] = [];
      for (const ec of encryptedChunks) {
        const decrypted = await decryptChunk(ec, key);
        decryptedChunks.push(decrypted);
      }

      // Reassemble
      const totalDecrypted = decryptedChunks.reduce((sum, c) => sum + c.byteLength, 0);
      const result = new Uint8Array(totalDecrypted);
      let offset = 0;
      for (const chunk of decryptedChunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }

      expect(result).toEqual(file);
    });
  });
});
