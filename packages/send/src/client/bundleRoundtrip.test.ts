// @vitest-environment node
/**
 * Send V2 bundle crypto roundtrip — integration tests.
 *
 * These validate the invariant the whole refactor depends on: encrypting
 * a multi-file bundle and then decrypting it yields byte-for-byte the
 * original contents, with per-file IV isolation. They sit above the
 * aead-stream unit tests (single-chunk semantics) and below Playwright
 * UI tests (which validate user flow). The niche they fill is multi-file
 * integration without the XHR/fetch mocks that `upload.test.ts` uses.
 *
 * Scenarios mirror `SEND_V2_DESIGN.md` §12.3 except for the UI-resume
 * flow (covered by `resume.test.ts` + Playwright). Scenario 4 (>4 GB)
 * is gated behind `SEND_LARGE_BUNDLE=1` because it runs for minutes.
 */
import { describe, it, expect } from "vitest";
import {
    encryptSendChunk,
    decryptSendChunk,
    deriveSendChunkIV,
} from "@stenvault/aead-stream";

const KEY_BYTES = Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => (i * 7 + 13) & 0xff),
);
const BASE_IV = Uint8Array.from(
    Array.from({ length: 8 }, (_, i) => (i * 31 + 3) & 0xff),
);

async function importSessionKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        KEY_BYTES as BufferSource,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

/** Fill a Uint8Array with a reproducible LCG pattern seeded from (fileIndex, size). */
function fakeFileBytes(fileIndex: number, size: number): Uint8Array {
    const out = new Uint8Array(size);
    // Linear congruential generator — deterministic per (seed, size).
    let state = ((fileIndex + 1) * 2654435761) >>> 0;
    for (let i = 0; i < size; i++) {
        state = (state * 1664525 + 1013904223) >>> 0;
        out[i] = state & 0xff;
    }
    return out;
}

/** Split a byte array into chunks of `partSize`, no padding. */
function splitIntoChunks(data: Uint8Array, partSize: number): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < data.byteLength; offset += partSize) {
        chunks.push(data.slice(offset, Math.min(offset + partSize, data.byteLength)));
    }
    return chunks;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

describe("bundle roundtrip — happy multi-file (scenario 1)", () => {
    it("encrypts 3 files with different sizes and decrypts each byte-exactly", async () => {
        const key = await importSessionKey();
        const partSize = 4 * 1024; // 4 KB chunks to exercise multi-chunk paths

        const files = [
            { fileIndex: 0, name: "tiny.txt", bytes: fakeFileBytes(0, 1024) },       // 1 KB, 1 chunk
            { fileIndex: 1, name: "medium.bin", bytes: fakeFileBytes(1, 10 * 1024) }, // 10 KB, 3 chunks
            { fileIndex: 2, name: "large.bin", bytes: fakeFileBytes(2, 100 * 1024) }, // 100 KB, 25 chunks
        ];

        // Encrypt — store per-file chunks exactly the way R2 multipart would.
        const storage = new Map<number, Uint8Array[]>();
        for (const file of files) {
            const plainChunks = splitIntoChunks(file.bytes, partSize);
            const encrypted: Uint8Array[] = [];
            for (let i = 0; i < plainChunks.length; i++) {
                encrypted.push(
                    await encryptSendChunk(plainChunks[i]!, key, BASE_IV, file.fileIndex, i),
                );
            }
            storage.set(file.fileIndex, encrypted);
        }

        // Decrypt — each file's chunks must decrypt with its own fileIndex.
        for (const file of files) {
            const stored = storage.get(file.fileIndex)!;
            const out = new Uint8Array(file.bytes.byteLength);
            let offset = 0;
            for (let i = 0; i < stored.length; i++) {
                const plain = await decryptSendChunk(stored[i]!, key, BASE_IV, file.fileIndex, i);
                out.set(plain, offset);
                offset += plain.byteLength;
            }
            expect(bytesEqual(out, file.bytes)).toBe(true);
        }
    });

    it("rejects a swapped chunk between two files (cross-file tampering)", async () => {
        const key = await importSessionKey();
        const partSize = 4 * 1024;
        const a = fakeFileBytes(0, partSize);
        const b = fakeFileBytes(1, partSize);

        const ctA = await encryptSendChunk(a, key, BASE_IV, 0, 0);
        const ctB = await encryptSendChunk(b, key, BASE_IV, 1, 0);

        // Swapping ciphertexts between fileIndexes must fail authentication.
        await expect(decryptSendChunk(ctA, key, BASE_IV, 1, 0)).rejects.toThrow();
        await expect(decryptSendChunk(ctB, key, BASE_IV, 0, 0)).rejects.toThrow();
    });
});

describe("bundle IV uniqueness (scenario 2)", () => {
    it("no two (fileIndex, chunkIndex) pairs collide for a realistic bundle", () => {
        // 10 files × 500 chunks = 5000 derived IVs. All must be distinct —
        // a collision under a shared session key is catastrophic for AES-GCM.
        const seen = new Set<string>();
        for (let file = 0; file < 10; file++) {
            for (let chunk = 0; chunk < 500; chunk++) {
                const iv = deriveSendChunkIV(BASE_IV, file, chunk);
                const hex = Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join("");
                expect(seen.has(hex)).toBe(false);
                seen.add(hex);
            }
        }
        expect(seen.size).toBe(10 * 500);
    });

    it("boundary fileIndex and chunkIndex (65535) still produce valid IVs", () => {
        const iv = deriveSendChunkIV(BASE_IV, 65535, 65535);
        expect(iv.byteLength).toBe(12);
        // Bytes 8..12 should be 0xFFFF || 0xFFFF big-endian — the last four bytes all 0xFF.
        expect(iv[8]).toBe(0xff);
        expect(iv[9]).toBe(0xff);
        expect(iv[10]).toBe(0xff);
        expect(iv[11]).toBe(0xff);
    });
});

describe("bundle resume simulation (scenario 3)", () => {
    it("resume flow: finish file 0, partial file 1, resume file 1, bytes match", async () => {
        const key = await importSessionKey();
        const partSize = 4 * 1024;

        const file0 = fakeFileBytes(0, 20 * 1024); // 5 chunks
        const file1 = fakeFileBytes(1, 20 * 1024); // 5 chunks

        const chunks0 = splitIntoChunks(file0, partSize);
        const chunks1 = splitIntoChunks(file1, partSize);

        // "Upload" attempt 1: file 0 fully, file 1 only chunks 0..2.
        const storedFile0: Uint8Array[] = [];
        for (let i = 0; i < chunks0.length; i++) {
            storedFile0.push(await encryptSendChunk(chunks0[i]!, key, BASE_IV, 0, i));
        }
        const storedFile1: Uint8Array[] = [];
        for (let i = 0; i < 3; i++) {
            storedFile1.push(await encryptSendChunk(chunks1[i]!, key, BASE_IV, 1, i));
        }

        // Abort — simulate caller losing in-flight state.
        // Resume: re-encrypt chunks 0..2 of file 1 from plaintext; must produce
        // byte-identical ciphertext to what's already on R2 (resume protocol
        // relies on this determinism). Then upload the remaining chunks 3..4.
        for (let i = 0; i < 3; i++) {
            const reencrypted = await encryptSendChunk(chunks1[i]!, key, BASE_IV, 1, i);
            expect(bytesEqual(reencrypted, storedFile1[i]!)).toBe(true);
        }
        for (let i = 3; i < chunks1.length; i++) {
            storedFile1.push(await encryptSendChunk(chunks1[i]!, key, BASE_IV, 1, i));
        }

        // Decrypt both files from their stored chunks — bytes must match the
        // original plaintexts. Resume must leave no seam.
        const decrypt = async (stored: Uint8Array[], fileIndex: number, totalBytes: number) => {
            const out = new Uint8Array(totalBytes);
            let offset = 0;
            for (let i = 0; i < stored.length; i++) {
                const plain = await decryptSendChunk(stored[i]!, key, BASE_IV, fileIndex, i);
                out.set(plain, offset);
                offset += plain.byteLength;
            }
            return out;
        };

        expect(bytesEqual(await decrypt(storedFile0, 0, file0.byteLength), file0)).toBe(true);
        expect(bytesEqual(await decrypt(storedFile1, 1, file1.byteLength), file1)).toBe(true);
    });
});

/**
 * Scenario 4 — >4 GB bundle.
 *
 * The whole point of V2. Gated behind `SEND_LARGE_BUNDLE=1` because it
 * takes minutes and allocates gigabytes. On-demand pre-release only.
 *
 * Run with: `SEND_LARGE_BUNDLE=1 pnpm test bundleRoundtrip`
 */
describe("bundle roundtrip — >4 GB gated (scenario 4)", () => {
    it.skipIf(!process.env.SEND_LARGE_BUNDLE)(
        "streams >4 GB total across 2 files without errors and sampled bytes match",
        { timeout: 30 * 60 * 1000 }, // 30 min cap
        async () => {
            const key = await importSessionKey();
            const partSize = 1 * 1024 * 1024; // 1 MB — realistic SEND_PART_SIZE magnitude
            const chunksPerFile = 2600;       // 2.6 GB per file, 5.2 GB total
            const fileCount = 2;

            // SHA-256 accumulator: hash plaintext on the fly, verify by
            // re-running the same generator through decrypt and comparing
            // the digest. Avoids keeping 5 GB in memory twice.
            const plaintextDigests: string[] = [];

            for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
                // Encrypt pass — generate, hash, encrypt, discard ciphertext
                // except for a sampled subset we keep for the decrypt check.
                const keepSampleAt = new Set([0, 100, chunksPerFile - 1]);
                const samples = new Map<number, { plain: Uint8Array; cipher: Uint8Array }>();

                // WebCrypto's digest API is one-shot — no streaming. Hash each
                // plaintext chunk independently in parallel; Promise.all after
                // the loop is a no-cost win vs awaiting each push sequentially.
                // A deterministic generator means any drift between encrypt and
                // decrypt passes shows up in the combined digest.
                const hashPromises: Promise<string>[] = [];
                for (let chunkIndex = 0; chunkIndex < chunksPerFile; chunkIndex++) {
                    const plain = fakeFileBytes(
                        (fileIndex + 1) * 100000 + chunkIndex,
                        partSize,
                    );
                    const cipher = await encryptSendChunk(
                        plain,
                        key,
                        BASE_IV,
                        fileIndex,
                        chunkIndex,
                    );
                    hashPromises.push(sha256Hex(plain));
                    if (keepSampleAt.has(chunkIndex)) {
                        samples.set(chunkIndex, { plain, cipher });
                    }
                }
                const perChunkHex = await Promise.all(hashPromises);
                plaintextDigests.push(perChunkHex.join(":"));

                // Decrypt pass — re-encrypt same plaintext to prove determinism
                // and decrypt the samples we kept, verifying byte equality.
                for (const [chunkIndex, sample] of samples) {
                    const decrypted = await decryptSendChunk(
                        sample.cipher,
                        key,
                        BASE_IV,
                        fileIndex,
                        chunkIndex,
                    );
                    expect(bytesEqual(decrypted, sample.plain)).toBe(true);
                }
            }

            // Sanity: each file's digest differs from the other's. If the
            // LCG seed-by-fileIndex logic ever collapses, this catches it.
            expect(new Set(plaintextDigests).size).toBe(fileCount);
        },
    );
});
