/**
 * Public Send Crypto - Unit Tests
 * Tests AES-256-GCM encryption/decryption for anonymous file sharing.
 *
 * V2 format: derived IV from baseIv + chunkIndex (anti-reordering by construction)
 * V1 (legacy): random IV prepended to each chunk
 */
import { describe, it, expect } from "vitest";
import {
  generateSendKey,
  generateBaseIv,
  keyToFragment,
  fragmentToKey,
  encryptMetadata,
  decryptMetadata,
  encryptChunk,
  decryptChunk,
  getEncryptedChunkSize,
  SEND_PART_SIZE,
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

  describe("generateBaseIv", () => {
    it("generates a 12-byte IV", () => {
      const iv = generateBaseIv();
      expect(iv.byteLength).toBe(12);
    });

    it("generates unique IVs", () => {
      const iv1 = generateBaseIv();
      const iv2 = generateBaseIv();
      expect(iv1).not.toEqual(iv2);
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
      const baseIv = generateBaseIv();
      const testData = new Uint8Array([1, 2, 3, 4]);
      const encrypted = await encryptChunk(testData, original, baseIv, 0);
      const decrypted = await decryptChunk(encrypted, restored, baseIv, 0);
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

  describe("encryptChunk / decryptChunk (V2: derived IV)", () => {
    it("roundtrips a chunk", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const encrypted = await encryptChunk(original, key, baseIv, 0);
      const decrypted = await decryptChunk(encrypted, key, baseIv, 0);

      expect(decrypted).toEqual(original);
    });

    it("produces correct encrypted size (no prepended IV)", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();
      const original = new Uint8Array(1024); // 1KB
      crypto.getRandomValues(original);

      const encrypted = await encryptChunk(original, key, baseIv, 0);
      // V2: ciphertext + 16-byte auth tag (no IV prepended)
      expect(encrypted.byteLength).toBe(1024 + SEND_ENCRYPTION_OVERHEAD);
    });

    it("handles full-size chunk (SEND_PART_SIZE)", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();
      const original = new Uint8Array(SEND_PART_SIZE);
      original[0] = 0xAB;
      original[SEND_PART_SIZE - 1] = 0xCD;

      const encrypted = await encryptChunk(original, key, baseIv, 0);
      expect(encrypted.byteLength).toBe(SEND_PART_SIZE + SEND_ENCRYPTION_OVERHEAD);

      const decrypted = await decryptChunk(encrypted, key, baseIv, 0);
      expect(decrypted[0]).toBe(0xAB);
      expect(decrypted[SEND_PART_SIZE - 1]).toBe(0xCD);
      expect(decrypted.byteLength).toBe(SEND_PART_SIZE);
    });

    it("fails with wrong key", async () => {
      const key1 = await generateSendKey();
      const key2 = await generateSendKey();
      const baseIv = generateBaseIv();
      const original = new Uint8Array([1, 2, 3, 4]);

      const encrypted = await encryptChunk(original, key1, baseIv, 0);
      await expect(decryptChunk(encrypted, key2, baseIv, 0)).rejects.toThrow();
    });

    it("fails with wrong chunk index (anti-reordering)", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();
      const data = new Uint8Array([1, 2, 3, 4]);

      // Encrypt at index 0
      const encrypted = await encryptChunk(data, key, baseIv, 0);
      // Try to decrypt at index 1 — GCM auth tag mismatch
      await expect(decryptChunk(encrypted, key, baseIv, 1)).rejects.toThrow();
    });

    it("fails with wrong baseIv (anti-cross-file attack)", async () => {
      const key = await generateSendKey();
      const baseIv1 = generateBaseIv();
      const baseIv2 = generateBaseIv();
      const data = new Uint8Array([1, 2, 3, 4]);

      const encrypted = await encryptChunk(data, key, baseIv1, 0);
      await expect(decryptChunk(encrypted, key, baseIv2, 0)).rejects.toThrow();
    });

    it("same data at different indices produces different ciphertext", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();
      const data = new Uint8Array([1, 2, 3]);

      const enc0 = await encryptChunk(data, key, baseIv, 0);
      const enc1 = await encryptChunk(data, key, baseIv, 1);

      // Different IVs → different ciphertext (even for identical plaintext)
      expect(enc0).not.toEqual(enc1);
    });
  });

  describe("getEncryptedChunkSize", () => {
    it("V2: adds auth tag overhead only (16 bytes)", () => {
      expect(getEncryptedChunkSize(1024)).toBe(1024 + 16);
      expect(getEncryptedChunkSize(SEND_PART_SIZE)).toBe(SEND_PART_SIZE + 16);
      expect(getEncryptedChunkSize(0)).toBe(16);
    });

    it("SEND_ENCRYPTION_OVERHEAD is 16 (auth tag only)", () => {
      expect(SEND_ENCRYPTION_OVERHEAD).toBe(16);
    });
  });

  describe("multi-chunk file roundtrip (V2)", () => {
    it("encrypts and decrypts multi-chunk data with positional binding", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();
      const testChunkSize = 10000; // 10KB
      const fileSize = testChunkSize * 2 + 100;
      const file = new Uint8Array(fileSize);
      for (let i = 0; i < fileSize; i += 65536) {
        const end = Math.min(i + 65536, fileSize);
        crypto.getRandomValues(file.subarray(i, end));
      }

      // Encrypt chunks with positional index
      const encryptedChunks: Uint8Array[] = [];
      const totalChunks = Math.ceil(fileSize / testChunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * testChunkSize;
        const end = Math.min(start + testChunkSize, fileSize);
        const chunk = file.slice(start, end);
        const encrypted = await encryptChunk(chunk, key, baseIv, i);
        encryptedChunks.push(encrypted);
      }

      expect(encryptedChunks).toHaveLength(3);

      // Decrypt chunks with matching indices
      const decryptedChunks: Uint8Array[] = [];
      for (let i = 0; i < encryptedChunks.length; i++) {
        const decrypted = await decryptChunk(encryptedChunks[i]!, key, baseIv, i);
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

    it("detects chunk reordering (swap chunk 0 and 1)", async () => {
      const key = await generateSendKey();
      const baseIv = generateBaseIv();

      const chunk0 = new Uint8Array([1, 2, 3]);
      const chunk1 = new Uint8Array([4, 5, 6]);

      const enc0 = await encryptChunk(chunk0, key, baseIv, 0);
      const enc1 = await encryptChunk(chunk1, key, baseIv, 1);

      // Try decrypting in swapped order — should fail
      await expect(decryptChunk(enc1, key, baseIv, 0)).rejects.toThrow();
      await expect(decryptChunk(enc0, key, baseIv, 1)).rejects.toThrow();

      // Correct order still works
      const dec0 = await decryptChunk(enc0, key, baseIv, 0);
      const dec1 = await decryptChunk(enc1, key, baseIv, 1);
      expect(dec0).toEqual(chunk0);
      expect(dec1).toEqual(chunk1);
    });
  });
});
