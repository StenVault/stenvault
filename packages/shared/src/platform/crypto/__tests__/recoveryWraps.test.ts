/**
 * Recovery wraps schema tests.
 *
 * Exercises the Zod schema invariants; the actual crypto wrap/unwrap is
 * platform-specific and covered by backend integration tests + (future)
 * web-hook round-trip tests.
 */

import { describe, it, expect } from "vitest";
import {
    recoveryWrapSchema,
    recoveryWrapsSchema,
    findRecoveryWrap,
    sortRecoveryWrapsByIndex,
    type RecoveryWrap,
} from "../recoveryWraps";
import { RECOVERY_CODE_COUNT } from "../../../utils/recoveryCode";

const VALID_ARGON2 = {
    type: "argon2id" as const,
    memoryCost: 47104,
    timeCost: 1,
    parallelism: 1,
    hashLength: 32,
};

function makeWrap(codeIndex: number, overrides: Partial<RecoveryWrap> = {}): RecoveryWrap {
    return {
        codeIndex,
        salt: "s".repeat(44),
        argon2Params: VALID_ARGON2,
        wrappedMK: "w".repeat(56),
        ...overrides,
    };
}

function makeValidArray(): RecoveryWrap[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, (_, i) => makeWrap(i));
}

describe("recoveryWrapSchema", () => {
    it("accepts a well-formed wrap", () => {
        expect(() => recoveryWrapSchema.parse(makeWrap(0))).not.toThrow();
    });

    it("rejects negative codeIndex", () => {
        expect(() => recoveryWrapSchema.parse(makeWrap(-1))).toThrow();
    });

    it("rejects codeIndex >= RECOVERY_CODE_COUNT", () => {
        expect(() => recoveryWrapSchema.parse(makeWrap(RECOVERY_CODE_COUNT))).toThrow();
    });

    it("rejects non-integer codeIndex", () => {
        expect(() => recoveryWrapSchema.parse(makeWrap(1.5))).toThrow();
    });

    it("rejects too-short salt", () => {
        expect(() =>
            recoveryWrapSchema.parse(makeWrap(0, { salt: "short" }))
        ).toThrow();
    });

    it("rejects wrong argon2 type", () => {
        expect(() =>
            recoveryWrapSchema.parse(
                makeWrap(0, { argon2Params: { ...VALID_ARGON2, type: "argon2i" as any } })
            )
        ).toThrow();
    });

    it("rejects argon2 memoryCost below floor", () => {
        expect(() =>
            recoveryWrapSchema.parse(
                makeWrap(0, { argon2Params: { ...VALID_ARGON2, memoryCost: 1024 } })
            )
        ).toThrow();
    });

    it("rejects argon2 hashLength below 32", () => {
        expect(() =>
            recoveryWrapSchema.parse(
                makeWrap(0, { argon2Params: { ...VALID_ARGON2, hashLength: 16 } })
            )
        ).toThrow();
    });
});

describe("recoveryWrapsSchema", () => {
    it("accepts an array of length RECOVERY_CODE_COUNT with unique 0..N-1 indices", () => {
        expect(() => recoveryWrapsSchema.parse(makeValidArray())).not.toThrow();
    });

    it("accepts the same array in shuffled order (set match, not positional)", () => {
        const shuffled = [...makeValidArray()].reverse();
        expect(() => recoveryWrapsSchema.parse(shuffled)).not.toThrow();
    });

    it("rejects length != RECOVERY_CODE_COUNT (short)", () => {
        const arr = makeValidArray().slice(0, RECOVERY_CODE_COUNT - 1);
        expect(() => recoveryWrapsSchema.parse(arr)).toThrow();
    });

    it("rejects length != RECOVERY_CODE_COUNT (long)", () => {
        const arr = [...makeValidArray(), makeWrap(0)];
        expect(() => recoveryWrapsSchema.parse(arr)).toThrow();
    });

    it("rejects duplicate codeIndex", () => {
        const arr = makeValidArray();
        arr[1] = makeWrap(0); // force duplicate
        expect(() => recoveryWrapsSchema.parse(arr)).toThrow();
    });

    it("rejects gap in codeIndex (missing any of 0..N-1)", () => {
        const arr = makeValidArray();
        arr[5] = makeWrap(5, { codeIndex: 99 } as any);
        expect(() => recoveryWrapsSchema.parse(arr)).toThrow();
    });
});

describe("findRecoveryWrap", () => {
    it("returns the matching wrap by codeIndex", () => {
        const arr = makeValidArray();
        const found = findRecoveryWrap(arr, 3);
        expect(found?.codeIndex).toBe(3);
    });

    it("returns null when no wrap matches", () => {
        const arr = makeValidArray();
        expect(findRecoveryWrap(arr, 999)).toBeNull();
    });
});

describe("sortRecoveryWrapsByIndex", () => {
    it("sorts ascending by codeIndex without mutating input", () => {
        const shuffled = [...makeValidArray()].reverse();
        const sorted = sortRecoveryWrapsByIndex(shuffled);
        expect(sorted.map((w) => w.codeIndex)).toEqual(
            Array.from({ length: RECOVERY_CODE_COUNT }, (_, i) => i)
        );
        // input unchanged
        expect(shuffled[0]!.codeIndex).toBe(RECOVERY_CODE_COUNT - 1);
    });
});

function shuffle<T>(arr: T[], seed: number): T[] {
    // Fisher-Yates with a seeded PRNG so the property test is reproducible.
    const out = [...arr];
    let s = seed;
    const rand = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

describe("recoveryWrapsSchema (property)", () => {
    it("accepts any permutation of 0..N-1 (100 seeds)", () => {
        const base = makeValidArray();
        for (let seed = 1; seed <= 100; seed++) {
            const permuted = shuffle(base, seed);
            expect(() => recoveryWrapsSchema.parse(permuted)).not.toThrow();
        }
    });

    it("rejects any array with exactly one missing index (all N positions)", () => {
        for (let missing = 0; missing < RECOVERY_CODE_COUNT; missing++) {
            const arr = makeValidArray();
            // Replace the wrap at `missing` with a duplicate of another index.
            const replacement = (missing + 1) % RECOVERY_CODE_COUNT;
            arr[missing] = makeWrap(replacement);
            expect(() => recoveryWrapsSchema.parse(arr)).toThrow();
        }
    });

    it("findRecoveryWrap returns the right entry for every index under permutation", () => {
        const base = makeValidArray();
        for (let seed = 1; seed <= 20; seed++) {
            const permuted = shuffle(base, seed);
            for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
                expect(findRecoveryWrap(permuted, i)?.codeIndex).toBe(i);
            }
        }
    });
});
