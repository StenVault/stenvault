// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    DERIVE_IV_BASE_LENGTH,
    GCM_IV_LENGTH,
    deriveChunkIV,
    deriveSendChunkIV,
} from "./index";

const toHex = (u8: Uint8Array) =>
    Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");

describe("deriveChunkIV", () => {
    it("produces a 12-byte IV", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH).fill(0);
        const iv = deriveChunkIV(base, 0);
        expect(iv.byteLength).toBe(GCM_IV_LENGTH);
    });

    it("keeps the first 8 bytes of base IV intact", () => {
        const base = Uint8Array.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
        const iv = deriveChunkIV(base, 42);
        expect(Array.from(iv.slice(0, 8))).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
    });

    it("encodes chunk index as big-endian uint32 in the trailing 4 bytes", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH).fill(0);
        expect(toHex(deriveChunkIV(base, 0).slice(8))).toBe("00000000");
        expect(toHex(deriveChunkIV(base, 1).slice(8))).toBe("00000001");
        expect(toHex(deriveChunkIV(base, 255).slice(8))).toBe("000000ff");
        expect(toHex(deriveChunkIV(base, 256).slice(8))).toBe("00000100");
        expect(toHex(deriveChunkIV(base, 0xdeadbeef).slice(8))).toBe("deadbeef");
        expect(toHex(deriveChunkIV(base, 0xffffffff).slice(8))).toBe("ffffffff");
    });

    it("produces distinct IVs for distinct indexes with the same base", () => {
        const base = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
        const ivs = new Set<string>();
        for (let i = 0; i < 1024; i++) {
            ivs.add(toHex(deriveChunkIV(base, i)));
        }
        expect(ivs.size).toBe(1024);
    });

    it("is deterministic: same inputs produce byte-identical IV", () => {
        const base = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        const a = deriveChunkIV(base, 7);
        const b = deriveChunkIV(base, 7);
        expect(toHex(a)).toBe(toHex(b));
    });

    it("ignores base IV bytes past DERIVE_IV_BASE_LENGTH", () => {
        const baseA = new Uint8Array(GCM_IV_LENGTH);
        baseA.fill(0);
        const baseB = new Uint8Array(GCM_IV_LENGTH);
        baseB.fill(0);
        // Only the trailing 4 bytes differ — those are overwritten by the index.
        baseB[8] = 0xaa;
        baseB[11] = 0xff;
        expect(toHex(deriveChunkIV(baseA, 3))).toBe(toHex(deriveChunkIV(baseB, 3)));
    });

    it("does not mutate the provided base IV", () => {
        const base = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2]);
        const before = toHex(base);
        deriveChunkIV(base, 99);
        expect(toHex(base)).toBe(before);
    });
});

describe("deriveSendChunkIV", () => {
    it("produces a 12-byte IV", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH);
        const iv = deriveSendChunkIV(base, 0, 0);
        expect(iv.byteLength).toBe(GCM_IV_LENGTH);
    });

    it("keeps the first 8 bytes of base IV intact", () => {
        const base = Uint8Array.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
        const iv = deriveSendChunkIV(base, 7, 42);
        expect(Array.from(iv.slice(0, 8))).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
    });

    it("encodes fileIndex as big-endian uint16 in bytes 8..10", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH);
        expect(toHex(deriveSendChunkIV(base, 0, 0).slice(8, 10))).toBe("0000");
        expect(toHex(deriveSendChunkIV(base, 1, 0).slice(8, 10))).toBe("0001");
        expect(toHex(deriveSendChunkIV(base, 0x00ff, 0).slice(8, 10))).toBe("00ff");
        expect(toHex(deriveSendChunkIV(base, 0xbeef, 0).slice(8, 10))).toBe("beef");
        expect(toHex(deriveSendChunkIV(base, 0xffff, 0).slice(8, 10))).toBe("ffff");
    });

    it("encodes chunkIndex as big-endian uint16 in bytes 10..12", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH);
        expect(toHex(deriveSendChunkIV(base, 0, 0).slice(10, 12))).toBe("0000");
        expect(toHex(deriveSendChunkIV(base, 0, 1).slice(10, 12))).toBe("0001");
        expect(toHex(deriveSendChunkIV(base, 0, 0xdead).slice(10, 12))).toBe("dead");
        expect(toHex(deriveSendChunkIV(base, 0, 0xffff).slice(10, 12))).toBe("ffff");
    });

    it("produces distinct IVs for every (fileIndex, chunkIndex) pair in a grid", () => {
        const base = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
        const ivs = new Set<string>();
        for (let f = 0; f < 32; f++) {
            for (let c = 0; c < 32; c++) {
                ivs.add(toHex(deriveSendChunkIV(base, f, c)));
            }
        }
        expect(ivs.size).toBe(32 * 32);
    });

    it("is deterministic: same inputs produce byte-identical IV", () => {
        const base = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
        const a = deriveSendChunkIV(base, 3, 11);
        const b = deriveSendChunkIV(base, 3, 11);
        expect(toHex(a)).toBe(toHex(b));
    });

    it("does not mutate the provided base IV", () => {
        const base = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2]);
        const before = toHex(base);
        deriveSendChunkIV(base, 1, 2);
        expect(toHex(base)).toBe(before);
    });

    it("rejects fileIndex outside uint16 range", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH);
        expect(() => deriveSendChunkIV(base, -1, 0)).toThrow(RangeError);
        expect(() => deriveSendChunkIV(base, 0x10000, 0)).toThrow(RangeError);
        expect(() => deriveSendChunkIV(base, 1.5, 0)).toThrow(RangeError);
    });

    it("rejects chunkIndex outside uint16 range", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH);
        expect(() => deriveSendChunkIV(base, 0, -1)).toThrow(RangeError);
        expect(() => deriveSendChunkIV(base, 0, 0x10000)).toThrow(RangeError);
        expect(() => deriveSendChunkIV(base, 0, 1.5)).toThrow(RangeError);
    });

    it("matches vault deriveChunkIV at fileIndex=0, chunkIndex < 2^16 (IV-layer parity)", () => {
        // A byte-identical layout at fileIndex=0 is not a contract Send relies
        // on, but locking it down documents the layout choice and flags the
        // day someone refactors one function without the other.
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH).fill(0xa5);
        for (const idx of [0, 1, 255, 256, 0xbeef, 0xffff]) {
            expect(toHex(deriveSendChunkIV(base, 0, idx))).toBe(toHex(deriveChunkIV(base, idx)));
        }
    });

    it("diverges from vault deriveChunkIV when fileIndex > 0", () => {
        const base = new Uint8Array(DERIVE_IV_BASE_LENGTH);
        expect(toHex(deriveSendChunkIV(base, 1, 5))).not.toBe(toHex(deriveChunkIV(base, 5)));
    });
});
