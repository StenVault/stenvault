/// <reference lib="dom" />
/**
 * Resume-state persistence for Send uploads, backed by IndexedDB.
 *
 * sessionStorage dies when the tab closes; IndexedDB survives. Resuming a
 * 2 GB upload 24h later is only possible if the state (sessionId, upload
 * secret, AES key material, baseIv, per-file identity) survives a tab close.
 *
 * Storing the AES key fragment in IndexedDB is equivalent to leaving it in
 * the URL fragment: same-origin isolated, never sent to the server. The
 * zero-knowledge contract is preserved — this is only the sender's own
 * browser, and the key is already there at the moment the record is written.
 *
 * V2 shape: per-file entries instead of a flat single-file/bundle split.
 * Pre-V2 records are silently dropped on read since Send V2 is a breaking
 * change with zero production users to migrate.
 */
import { openDB, type IDBPDatabase, type DBSchema } from "idb";

/** Write rhythm for resume checkpoints — 1 in N part completions. */
export const RESUME_WRITE_STRIDE = 5;

/** Cap on a single file's completedParts we persist once we hit QuotaExceededError. */
const RESUME_TAIL_CAP = 200;

const DB_NAME = "stenvault-send-resume";
const DB_VERSION = 1;
const STORE = "records";
const EXPIRES_INDEX = "expiresAt";

/** Current record schema version. Bump if the shape changes; reads drop
 *  records whose `v` doesn't match. */
export const RESUME_RECORD_VERSION = 2 as const;

/**
 * Per-file slice of the resume record. One entry per file in the bundle —
 * single-file sends carry `files.length === 1`. The pre-check on resume
 * matches `name`+`size` per slot so the user can't rename or swap files.
 */
export interface SendResumeFileEntry {
    fileIndex: number;
    /** Deduplicated display name at send time — pinned so resume won't
     *  silently accept a rename. */
    name: string;
    /** Bytes — part of the same-file pre-check. */
    size: number;
    mimeType: string;
    totalParts: number;
    /** Parts already uploaded to R2 with their canonical ETags.
     *  The pipeline re-hashes these chunks locally (derived-IV means the
     *  ciphertext is byte-identical) but skips the PUT. */
    completedParts: Array<{ partNumber: number; etag: string }>;
}

/**
 * Persistent record for an in-flight Send upload. Schema is pinned by
 * `resumeSchema.test.ts` — any addition/removal here must be deliberate
 * because a shape change across versions without a migration breaks
 * resume for anyone with a record mid-flight.
 */
export interface SendResumeRecord {
    /** Schema version. Records with `v !== 2` are dropped on read. */
    v: typeof RESUME_RECORD_VERSION;
    /** 32-char hex, primary key. */
    sessionId: string;
    /** 64-char hex — proves the caller is the uploader when reconciling. */
    uploadSecret: string;
    /** Base64url-encoded AES-256 key, same shape as the URL fragment. */
    fragment: string;
    /** Base64-encoded 12-byte base IV for V2 derived chunk IVs. */
    baseIv: string;
    /** Sum of `files[].size` — banner caption + cheap aggregate checks. */
    totalBytes: number;
    /** `files.length` — banner caption, avoids recomputing. */
    fileCount: number;
    /** Per-file state; one entry per bundle slot in fileIndex order. */
    files: SendResumeFileEntry[];
    /** SEND_PART_SIZE at creation time — stored so a constant change can't break in-flight sessions. */
    partSize: number;
    /** ms epoch. */
    createdAt: number;
    /** ms epoch — mirrors `session.expiresAt` on the server; cleanup index key. */
    expiresAt: number;
}

interface ResumeDbSchema extends DBSchema {
    [STORE]: {
        key: string;
        value: SendResumeRecord;
        indexes: { [EXPIRES_INDEX]: number };
    };
}

let dbPromise: Promise<IDBPDatabase<ResumeDbSchema>> | null = null;

async function getDb(): Promise<IDBPDatabase<ResumeDbSchema>> {
    if (dbPromise) return dbPromise;
    dbPromise = openDB<ResumeDbSchema>(DB_NAME, DB_VERSION, {
        upgrade(database) {
            if (!database.objectStoreNames.contains(STORE)) {
                const store = database.createObjectStore(STORE, { keyPath: "sessionId" });
                store.createIndex(EXPIRES_INDEX, "expiresAt");
            }
        },
        // A programmatic deleteDatabase closes any live connections; drop the
        // cached promise so the next call reopens instead of returning a handle
        // to a database that no longer exists. Primarily exercised in tests.
        terminated() {
            dbPromise = null;
        },
    });
    return dbPromise;
}

/**
 * Test-only hook to close and forget the cached connection. Lets a test wipe
 * the underlying database between cases without hanging on deleteDatabase's
 * "blocked" state.
 */
export async function __resetResumeDbForTests(): Promise<void> {
    if (dbPromise) {
        try {
            const db = await dbPromise;
            db.close();
        } catch {
            /* already closed or failed to open — forget either way */
        }
    }
    dbPromise = null;
}

/** Runtime check — IndexedDB returns `unknown` effectively, so validate the
 *  `v` marker before trusting the shape. Pre-V2 records fail this. */
function isCurrentVersion(record: unknown): record is SendResumeRecord {
    return (
        typeof record === "object" &&
        record !== null &&
        (record as { v?: unknown }).v === RESUME_RECORD_VERSION
    );
}

/**
 * Persist the record. Returns `false` only when IndexedDB is completely
 * unavailable (private browsing, quota exhausted after trim). On quota
 * pressure we first trim each file's `completedParts` to the tail before
 * giving up.
 */
export async function saveResumeRecord(record: SendResumeRecord): Promise<boolean> {
    try {
        const db = await getDb();
        await db.put(STORE, record);
        return true;
    } catch (err) {
        if (!isQuotaError(err)) {
            console.warn("[send] saveResumeRecord failed (non-quota)", err);
            return false;
        }
        try {
            const db = await getDb();
            const trimmed: SendResumeRecord = {
                ...record,
                files: record.files.map((f) => ({
                    ...f,
                    completedParts: f.completedParts.slice(-RESUME_TAIL_CAP),
                })),
            };
            await db.put(STORE, trimmed);
            return true;
        } catch (err2) {
            console.warn("[send] saveResumeRecord failed (quota after trim)", err2);
            return false;
        }
    }
}

/**
 * Merge one file's `completedParts` into the existing record without
 * rewriting the other files. Called from the upload progress hook on every
 * stride — keeping this narrow avoids contending with other files' writers
 * when per-file parallel upload lands later.
 */
export async function updateCompletedParts(
    sessionId: string,
    fileIndex: number,
    completedParts: SendResumeFileEntry["completedParts"],
): Promise<boolean> {
    try {
        const db = await getDb();
        const existing = await db.get(STORE, sessionId);
        if (!existing || !isCurrentVersion(existing)) return false;
        const nextFiles = existing.files.map((f) =>
            f.fileIndex === fileIndex ? { ...f, completedParts } : f,
        );
        const next: SendResumeRecord = { ...existing, files: nextFiles };
        await db.put(STORE, next);
        return true;
    } catch (err) {
        if (!isQuotaError(err)) {
            console.warn("[send] Failed to update resume completedParts", err);
            return false;
        }
        try {
            const db = await getDb();
            const existing = await db.get(STORE, sessionId);
            if (!existing || !isCurrentVersion(existing)) return false;
            const nextFiles = existing.files.map((f) =>
                f.fileIndex === fileIndex
                    ? { ...f, completedParts: completedParts.slice(-RESUME_TAIL_CAP) }
                    : f,
            );
            const trimmed: SendResumeRecord = { ...existing, files: nextFiles };
            await db.put(STORE, trimmed);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Return the most recent non-expired record, or null. "Most recent" is
 * by `createdAt` desc — there should be at most one in-flight upload per
 * tab normally, but multiple tabs could have created records.
 */
export async function findResumeRecord(): Promise<SendResumeRecord | null> {
    try {
        const records = await listResumeRecords();
        if (records.length === 0) return null;
        records.sort((a, b) => b.createdAt - a.createdAt);
        return records[0] ?? null;
    } catch (err) {
        console.warn("[send] findResumeRecord failed", err);
        return null;
    }
}

/**
 * List live records. Pre-V2 records are dropped on read so expired
 * banners from before the Send V2 upgrade don't linger in IndexedDB.
 */
export async function listResumeRecords(): Promise<SendResumeRecord[]> {
    try {
        const db = await getDb();
        const all = await db.getAll(STORE);
        const now = Date.now();
        const live: SendResumeRecord[] = [];
        for (const raw of all) {
            if (!isCurrentVersion(raw)) {
                // Best-effort cleanup. Failure here isn't fatal — the record
                // is already invisible to the caller.
                const stale = raw as { sessionId?: unknown };
                if (typeof stale.sessionId === "string") {
                    await db.delete(STORE, stale.sessionId).catch(() => {});
                }
                continue;
            }
            if (raw.expiresAt > now) live.push(raw);
        }
        return live;
    } catch (err) {
        console.warn("[send] Failed to list resume records", err);
        return [];
    }
}

export async function deleteResumeRecord(sessionId: string): Promise<void> {
    try {
        const db = await getDb();
        await db.delete(STORE, sessionId);
    } catch (err) {
        console.warn("[send] deleteResumeRecord failed", err);
    }
}

/**
 * Remove every record with `expiresAt <= now`. Returns the count removed.
 * Call on page mount so a user with an expired record doesn't see a
 * useless banner and so IndexedDB doesn't accumulate dead entries.
 */
export async function cleanupExpiredRecords(): Promise<number> {
    try {
        const db = await getDb();
        const now = Date.now();
        const tx = db.transaction(STORE, "readwrite");
        const index = tx.store.index(EXPIRES_INDEX);
        let deleted = 0;
        let cursor = await index.openCursor(IDBKeyRange.upperBound(now));
        while (cursor) {
            await cursor.delete();
            deleted++;
            cursor = await cursor.continue();
        }
        await tx.done;
        return deleted;
    } catch (err) {
        console.warn("[send] cleanupExpiredRecords failed", err);
        return 0;
    }
}

function isQuotaError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED";
}
