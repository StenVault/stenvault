// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    AUTH_TAG_SIZE,
    decryptChunk,
    decryptSendChunk,
    encryptChunk,
    encryptSendChunk,
    hashEncryptedChunk,
} from "./index";

const FIXED_KEY_BYTES = Uint8Array.from([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
    0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
]);

const FIXED_BASE_IV = Uint8Array.from([
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11,
    0x22, 0x33, 0x44, 0x55,
]);

async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        bytes as BufferSource,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

const toHex = (u8: Uint8Array) =>
    Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");

describe("encryptChunk + decryptChunk", () => {
    it("round-trips: decrypt(encrypt(pt)) === pt", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const plaintext = new TextEncoder().encode("hello, aead-stream");
        const ciphertext = await encryptChunk(plaintext, key, FIXED_BASE_IV, 0);
        const decrypted = await decryptChunk(ciphertext, key, FIXED_BASE_IV, 0);
        expect(toHex(decrypted)).toBe(toHex(plaintext));
    });

    it("output length is plaintext length + auth tag", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        for (const len of [0, 1, 16, 64, 1024, 5 * 1024 * 1024]) {
            const pt = new Uint8Array(len);
            const ct = await encryptChunk(pt, key, FIXED_BASE_IV, 0);
            expect(ct.byteLength).toBe(len + AUTH_TAG_SIZE);
        }
    });

    it("is deterministic: re-encrypting the same chunk produces byte-identical ciphertext", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("resumable upload depends on this");
        const a = await encryptChunk(pt, key, FIXED_BASE_IV, 5);
        const b = await encryptChunk(pt, key, FIXED_BASE_IV, 5);
        expect(toHex(a)).toBe(toHex(b));
    });

    it("reordering chunks fails decryption (position-binding via derived IV)", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("position matters");
        const ctAtIndex3 = await encryptChunk(pt, key, FIXED_BASE_IV, 3);
        // Same ciphertext, wrong declared index → auth failure.
        await expect(decryptChunk(ctAtIndex3, key, FIXED_BASE_IV, 4)).rejects.toThrow();
    });

    it("tampered ciphertext fails decryption", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("integrity check");
        const ct = await encryptChunk(pt, key, FIXED_BASE_IV, 0);
        const tampered = new Uint8Array(ct);
        tampered[0] ^= 0x01;
        await expect(decryptChunk(tampered, key, FIXED_BASE_IV, 0)).rejects.toThrow();
    });

    it("different chunk indexes with identical plaintext produce different ciphertext", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("same content, different slot");
        const ct0 = await encryptChunk(pt, key, FIXED_BASE_IV, 0);
        const ct1 = await encryptChunk(pt, key, FIXED_BASE_IV, 1);
        expect(toHex(ct0)).not.toBe(toHex(ct1));
    });

    it("produces byte-identical ciphertext across many indexes (regression vector)", async () => {
        // Two passes over the same 10 chunks must produce byte-identical
        // ciphertext. This is the property resumable uploads rely on —
        // any breaking change to IV derivation or AES-GCM parameters will
        // show up here.
        const key = await importKey(FIXED_KEY_BYTES);
        const plaintexts = Array.from({ length: 10 }, (_, i) =>
            new TextEncoder().encode(`chunk-${i.toString().padStart(3, "0")}`),
        );
        const passA = await Promise.all(
            plaintexts.map((pt, i) => encryptChunk(pt, key, FIXED_BASE_IV, i).then(toHex)),
        );
        const passB = await Promise.all(
            plaintexts.map((pt, i) => encryptChunk(pt, key, FIXED_BASE_IV, i).then(toHex)),
        );
        expect(passB).toEqual(passA);
        // Sanity: no two adjacent chunks collide (they differ in IV).
        expect(new Set(passA).size).toBe(plaintexts.length);
    });

    it("golden vector: empty plaintext at index 0 with fixed key and base IV", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const ct = await encryptChunk(new Uint8Array(0), key, FIXED_BASE_IV, 0);
        // AES-GCM over empty plaintext yields exactly the 16-byte tag.
        expect(ct.byteLength).toBe(AUTH_TAG_SIZE);
        // Tag is deterministic for fixed inputs — capture once, lock forever.
        expect(toHex(ct)).toBe("29313a6d102c641dd461e44564b37257");
    });

    it("golden vector: 32-byte zero plaintext at index 1", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const ct = await encryptChunk(new Uint8Array(32), key, FIXED_BASE_IV, 1);
        expect(toHex(ct)).toBe(
            "9160e48a6fc099f33825ad93fc345caeac15ad04885cff06e6a63bc27d2523f2d6d7c24611a00ca69eb656a560c85abb",
        );
    });
});

describe("encryptSendChunk + decryptSendChunk", () => {
    it("round-trips with (fileIndex, chunkIndex)", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const plaintext = new TextEncoder().encode("bundle file 1 chunk 5");
        const ciphertext = await encryptSendChunk(plaintext, key, FIXED_BASE_IV, 1, 5);
        const decrypted = await decryptSendChunk(ciphertext, key, FIXED_BASE_IV, 1, 5);
        expect(toHex(decrypted)).toBe(toHex(plaintext));
    });

    it("is deterministic for fixed (fileIndex, chunkIndex)", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("deterministic Send encryption");
        const a = await encryptSendChunk(pt, key, FIXED_BASE_IV, 3, 7);
        const b = await encryptSendChunk(pt, key, FIXED_BASE_IV, 3, 7);
        expect(toHex(a)).toBe(toHex(b));
    });

    it("same plaintext at different files produces different ciphertext", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("shared content");
        const file0 = await encryptSendChunk(pt, key, FIXED_BASE_IV, 0, 0);
        const file1 = await encryptSendChunk(pt, key, FIXED_BASE_IV, 1, 0);
        expect(toHex(file0)).not.toBe(toHex(file1));
    });

    it("same plaintext at different chunk indexes within one file differs", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("shared");
        const c0 = await encryptSendChunk(pt, key, FIXED_BASE_IV, 2, 0);
        const c1 = await encryptSendChunk(pt, key, FIXED_BASE_IV, 2, 1);
        expect(toHex(c0)).not.toBe(toHex(c1));
    });

    it("cross-file decrypt fails: ciphertext from fileIndex 0 won't decrypt as fileIndex 1", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("position-bound");
        const ct = await encryptSendChunk(pt, key, FIXED_BASE_IV, 0, 5);
        await expect(decryptSendChunk(ct, key, FIXED_BASE_IV, 1, 5)).rejects.toThrow();
    });

    it("cross-chunk decrypt fails: ciphertext from chunkIndex 5 won't decrypt as 6", async () => {
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("chunk-bound");
        const ct = await encryptSendChunk(pt, key, FIXED_BASE_IV, 2, 5);
        await expect(decryptSendChunk(ct, key, FIXED_BASE_IV, 2, 6)).rejects.toThrow();
    });

    it("at fileIndex=0, output matches vault encryptChunk (IV-layer parity)", async () => {
        // Proves the two encrypt paths share an IV byte-layout at fileIndex=0.
        // Not a runtime contract for Send V2, but the parity test catches the
        // day someone edits one derivation without the other.
        const key = await importKey(FIXED_KEY_BYTES);
        const pt = new TextEncoder().encode("fileIndex=0 parity check");
        const vaultCt = await encryptChunk(pt, key, FIXED_BASE_IV, 42);
        const sendCt = await encryptSendChunk(pt, key, FIXED_BASE_IV, 0, 42);
        expect(toHex(sendCt)).toBe(toHex(vaultCt));
    });
});

describe("hashEncryptedChunk", () => {
    it("is deterministic and matches SHA-256 of the input bytes", async () => {
        const bytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
        const hashA = await hashEncryptedChunk(bytes);
        const hashB = await hashEncryptedChunk(bytes);
        expect(hashA).toBe(hashB);
        expect(hashA).toBe(
            "5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953",
        );
    });

    it("hash of empty input is the known SHA-256 empty digest", async () => {
        expect(await hashEncryptedChunk(new Uint8Array(0))).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });

    it("tiny perturbations produce completely different digests (avalanche)", async () => {
        const a = await hashEncryptedChunk(Uint8Array.from([0]));
        const b = await hashEncryptedChunk(Uint8Array.from([1]));
        expect(a).not.toBe(b);
    });
});
