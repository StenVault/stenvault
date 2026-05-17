/**
 * Runtime tests for the IndexedDB-backed resume storage (V2 per-file).
 *
 * happy-dom 20.x does not ship an IndexedDB implementation, so we pull in
 * fake-indexeddb/auto which installs a W3C-spec-compliant polyfill as the
 * `indexedDB` global. Each test starts from a clean DB by deleting the
 * shared database at setup so cross-test state doesn't leak.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB } from "idb";
import {
    saveResumeRecord,
    updateCompletedParts,
    findResumeRecord,
    listResumeRecords,
    deleteResumeRecord,
    cleanupExpiredRecords,
    __resetResumeDbForTests,
    type SendResumeRecord,
    type SendResumeFileEntry,
} from "./resume";

const DB_NAME = "stenvault-send-resume";

/**
 * Put a record directly into the store, bypassing the TypeScript type.
 * Used to plant pre-V2 shapes that the current code wouldn't accept via
 * `saveResumeRecord`. Uses the same upgrade logic as resume.ts so the
 * store exists when we try to write.
 */
async function putRawRecord(record: Record<string, unknown>): Promise<void> {
    const db = await openDB(DB_NAME, 1, {
        upgrade(database) {
            if (!database.objectStoreNames.contains("records")) {
                const store = database.createObjectStore("records", { keyPath: "sessionId" });
                store.createIndex("expiresAt", "expiresAt");
            }
        },
    });
    await db.put("records", record);
    db.close();
}

function hoursFromNow(hours: number): number {
    return Date.now() + hours * 60 * 60 * 1000;
}

function makeFile(overrides: Partial<SendResumeFileEntry> = {}): SendResumeFileEntry {
    return {
        fileIndex: 0,
        name: "hello.bin",
        size: 1_000_000,
        mimeType: "application/octet-stream",
        totalParts: 5,
        completedParts: [],
        ...overrides,
    };
}

function makeRecord(overrides: Partial<SendResumeRecord> = {}): SendResumeRecord {
    const files = overrides.files ?? [makeFile()];
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    return {
        v: 2,
        sessionId: "a".repeat(32),
        uploadSecret: "b".repeat(64),
        fragment: "ZmFrZS1mcmFnbWVudA",
        baseIv: "AAECAwQFBgcICQoL",
        totalBytes,
        fileCount: files.length,
        files,
        partSize: 5 * 1024 * 1024,
        createdAt: Date.now(),
        expiresAt: hoursFromNow(24),
        ...overrides,
    };
}

async function wipeDb(): Promise<void> {
    await __resetResumeDbForTests();
    await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
    });
}

beforeEach(async () => {
    await wipeDb();
});

afterEach(async () => {
    await wipeDb();
});

describe("resume storage (V2 per-file)", () => {
    it("roundtrips a saved single-file record", async () => {
        const rec = makeRecord();
        const ok = await saveResumeRecord(rec);
        expect(ok).toBe(true);

        const loaded = await findResumeRecord();
        expect(loaded).not.toBeNull();
        expect(loaded?.v).toBe(2);
        expect(loaded?.sessionId).toBe(rec.sessionId);
        expect(loaded?.uploadSecret).toBe(rec.uploadSecret);
        expect(loaded?.fragment).toBe(rec.fragment);
        expect(loaded?.baseIv).toBe(rec.baseIv);
        expect(loaded?.files).toHaveLength(1);
        expect(loaded?.files[0]?.name).toBe("hello.bin");
        expect(loaded?.fileCount).toBe(1);
        expect(loaded?.totalBytes).toBe(1_000_000);
    });

    it("roundtrips a multi-file bundle record", async () => {
        const rec = makeRecord({
            files: [
                makeFile({ fileIndex: 0, name: "a.bin", size: 500_000, totalParts: 3 }),
                makeFile({ fileIndex: 1, name: "b.bin", size: 2_000_000, totalParts: 7 }),
                makeFile({ fileIndex: 2, name: "c.bin", size: 100, totalParts: 1 }),
            ],
        });
        await saveResumeRecord(rec);

        const loaded = await findResumeRecord();
        expect(loaded?.fileCount).toBe(3);
        expect(loaded?.totalBytes).toBe(500_000 + 2_000_000 + 100);
        expect(loaded?.files.map((f) => f.name)).toEqual(["a.bin", "b.bin", "c.bin"]);
        expect(loaded?.files.map((f) => f.fileIndex)).toEqual([0, 1, 2]);
    });

    it("returns null when no records exist", async () => {
        const loaded = await findResumeRecord();
        expect(loaded).toBeNull();
    });

    it("filters out expired records", async () => {
        const expired = makeRecord({
            sessionId: "1".repeat(32),
            expiresAt: Date.now() - 1000,
        });
        const live = makeRecord({
            sessionId: "2".repeat(32),
            expiresAt: hoursFromNow(24),
        });
        await saveResumeRecord(expired);
        await saveResumeRecord(live);

        const loaded = await findResumeRecord();
        expect(loaded?.sessionId).toBe(live.sessionId);

        const all = await listResumeRecords();
        expect(all).toHaveLength(1);
    });

    it("drops pre-V2 records on read", async () => {
        // Plant an old-shape record directly. The `v === 2` runtime check
        // in `listResumeRecords` / `findResumeRecord` is what we're exercising.
        await putRawRecord({
            // Missing `v` field — classic V1 shape.
            sessionId: "c".repeat(32),
            uploadSecret: "d".repeat(64),
            fragment: "xx",
            baseIv: "yy",
            fileName: "legacy.bin",
            fileSize: 100,
            mimeType: "application/octet-stream",
            totalParts: 1,
            partSize: 5 * 1024 * 1024,
            isBundle: false,
            completedParts: [],
            createdAt: Date.now(),
            expiresAt: hoursFromNow(24),
        });
        await __resetResumeDbForTests();

        const loaded = await findResumeRecord();
        expect(loaded).toBeNull();

        // The pre-V2 record should have been cleaned up on read.
        const all = await listResumeRecords();
        expect(all).toEqual([]);
    });

    it("returns the most recent record when multiple are live", async () => {
        const older = makeRecord({
            sessionId: "1".repeat(32),
            createdAt: Date.now() - 5000,
        });
        const newer = makeRecord({
            sessionId: "2".repeat(32),
            createdAt: Date.now(),
        });
        await saveResumeRecord(older);
        await saveResumeRecord(newer);

        const loaded = await findResumeRecord();
        expect(loaded?.sessionId).toBe(newer.sessionId);
    });

    it("updateCompletedParts merges for a specific file only", async () => {
        const rec = makeRecord({
            files: [
                makeFile({ fileIndex: 0, name: "a.bin", totalParts: 3 }),
                makeFile({ fileIndex: 1, name: "b.bin", totalParts: 5 }),
            ],
        });
        await saveResumeRecord(rec);

        const updated = await updateCompletedParts(rec.sessionId, 1, [
            { partNumber: 1, etag: "etag-1" },
            { partNumber: 2, etag: "etag-2" },
        ]);
        expect(updated).toBe(true);

        const loaded = await findResumeRecord();
        expect(loaded?.files[0]?.completedParts).toEqual([]);
        expect(loaded?.files[1]?.completedParts).toEqual([
            { partNumber: 1, etag: "etag-1" },
            { partNumber: 2, etag: "etag-2" },
        ]);
        // Other fields preserved across the partial update.
        expect(loaded?.files[0]?.name).toBe("a.bin");
        expect(loaded?.files[1]?.name).toBe("b.bin");
    });

    it("updateCompletedParts returns false when session isn't tracked", async () => {
        const updated = await updateCompletedParts(
            "missing".padEnd(32, "0"),
            0,
            [{ partNumber: 1, etag: "etag-1" }],
        );
        expect(updated).toBe(false);
    });

    it("updateCompletedParts leaves other files alone for unknown fileIndex", async () => {
        const rec = makeRecord({
            files: [makeFile({ fileIndex: 0, name: "a.bin" })],
        });
        await saveResumeRecord(rec);

        const updated = await updateCompletedParts(rec.sessionId, 99, [
            { partNumber: 1, etag: "zz" },
        ]);
        // Matches the V1 "file not found → noop, return true" contract —
        // the put still went through against an unchanged record.
        expect(updated).toBe(true);

        const loaded = await findResumeRecord();
        expect(loaded?.files[0]?.completedParts).toEqual([]);
    });

    it("deleteResumeRecord removes a specific session", async () => {
        const a = makeRecord({ sessionId: "a".repeat(32) });
        const b = makeRecord({ sessionId: "b".repeat(32) });
        await saveResumeRecord(a);
        await saveResumeRecord(b);

        await deleteResumeRecord(a.sessionId);

        const all = await listResumeRecords();
        expect(all).toHaveLength(1);
        expect(all[0]?.sessionId).toBe(b.sessionId);
    });

    it("cleanupExpiredRecords deletes only expired entries and returns the count", async () => {
        await saveResumeRecord(makeRecord({ sessionId: "1".repeat(32), expiresAt: Date.now() - 10_000 }));
        await saveResumeRecord(makeRecord({ sessionId: "2".repeat(32), expiresAt: Date.now() - 5000 }));
        await saveResumeRecord(makeRecord({ sessionId: "3".repeat(32), expiresAt: hoursFromNow(24) }));

        const deleted = await cleanupExpiredRecords();
        expect(deleted).toBe(2);

        const all = await listResumeRecords();
        expect(all).toHaveLength(1);
        expect(all[0]?.sessionId).toBe("3".repeat(32));
    });
});
