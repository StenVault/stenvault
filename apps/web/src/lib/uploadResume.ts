/// <reference lib="dom" />
/**
 * Resume-state persistence for Vault multipart uploads, backed by IndexedDB.
 *
 * Tab close kills sessionStorage and the in-memory encrypted blob. IndexedDB
 * survives. Resuming a 2 GB upload an hour later is only possible if the
 * material needed to rebuild a byte-identical encrypted blob — the encryption
 * seed (fileKey, baseIv, hybrid encapsulation outputs) — survives the tab.
 *
 * The AES-256 file key inside the seed is **wrapped** with a KEK derived from
 * the master key (`deriveUploadResumeKeyFromMaster`) and AES-GCM-bound to the
 * `(userId, serverFileId)` tuple via AAD. Only the wrapped ciphertext + IV
 * land in IndexedDB; the rest of the seed (`baseIv`, `wrappedFileKey`,
 * KEM ciphertexts, signature metadata) is public CVEF material and stays
 * plaintext alongside it.
 *
 * Posture mirrors `apps/web/src/hooks/masterKey/deviceKeyStore.ts` — the UES
 * fast-path stores the master key wrapped by a non-extractable Device-KEK.
 * "Same-origin isolated" alone is not enough; the wrap is what makes the
 * record safe to leave on disk for the 24 h orphan-cleanup window.
 *
 * Resume requires the vault to be unlocked: `unwrapResumeSeed` needs the
 * caller to provide the master HKDF key. This matches the existing
 * `useMasterKeyEncryption` gate already enforced in the resume flow.
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { toArrayBuffer, type CVEFSignatureMetadata } from '@stenvault/shared/platform/crypto';
import type { HybridEncryptionSeed } from './hybridFile/types';
import { deriveUploadResumeKeyFromMaster } from '@/hooks/masterKeyCrypto';
import { debugWarn } from './debugLogger';

/** Write rhythm for resume checkpoints — 1 in N part completions. */
export const VAULT_RESUME_WRITE_STRIDE = 5;

/** Cap on completedParts we persist once we hit QuotaExceededError. */
const VAULT_RESUME_TAIL_CAP = 200;

const DB_NAME = 'stenvault-upload-resume';
const DB_VERSION = 1;
const STORE = 'records';
const EXPIRES_INDEX = 'expiresAt';

/** Current record schema version. Bump if the shape changes; reads drop
 *  records whose `v` doesn't match. v=2 introduces the wrapped-fileKey shape;
 *  v=1 records are dropped silently. */
export const VAULT_RESUME_RECORD_VERSION = 2 as const;

/** Default TTL: 24 h, matching R2's multipart orphan-cleanup window. */
export const VAULT_RESUME_TTL_MS = 24 * 60 * 60 * 1000;

export interface UploadResumePartEntry {
    partNumber: number;
    etag: string;
}

export interface UploadResumeFileIdentity {
    /** Original filename (plaintext, never sent) — pinned so the user can't
     *  silently swap files at the re-pick step. */
    name: string;
    /** Bytes — guards against rename + truncate. */
    size: number;
    /** ms epoch from File.lastModified — guards against same-name-different-content. */
    lastModified: number;
    /** Browser-detected MIME — used to rebuild the original mimeType field. */
    mimeType: string;
}

/**
 * Public seed material — non-sensitive bytes that are also embedded in the
 * CVEF metadata sent to the server. Persisted plaintext alongside the wrapped
 * fileKey because they leak nothing on their own (without the AES key the
 * KEM ciphertexts are useless).
 */
export interface VaultResumeSeedPublic {
    /** 12B base IV for chunk IV derivation. */
    baseIv: Uint8Array;
    /** 40B AES-KW wrapped file key (raw, not base64). */
    wrappedFileKey: Uint8Array;
    /** 32B X25519 ephemeral ciphertext from the original encapsulation. */
    classicalCiphertext: Uint8Array;
    /** 1088B ML-KEM-768 ciphertext from the original encapsulation. */
    pqCiphertext: Uint8Array;
    /** Optional signature metadata from the first pass — re-used verbatim. */
    signatureMetadata?: CVEFSignatureMetadata;
}

/**
 * Banner-friendly view of a resume record — everything needed to display the
 * row, dismiss it, or hand it back to `resumeUpload`. Crucially carries no
 * crypto material whatsoever; the wrapped fileKey is fetched and unwrapped
 * separately via `unwrapResumeSeed`.
 */
export interface VaultUploadResumeRecordView {
    serverFileId: number;
    multipartUploadId: string;
    serverFileKey: string;
    folderId: number | null;
    file: UploadResumeFileIdentity;
    encryptionVersion: number;
    contentHash?: string;
    fingerprintVersion?: number;
    partSize: number;
    totalParts: number;
    completedParts: UploadResumePartEntry[];
    createdAt: number;
    expiresAt: number;
}

/**
 * Persisted shape — what actually lives in IndexedDB. Carries the wrapped
 * fileKey and the public seed material. Not exported (consumers go through
 * the view + unwrap helpers).
 */
interface VaultUploadResumeRecordPersisted extends VaultUploadResumeRecordView {
    v: typeof VAULT_RESUME_RECORD_VERSION;
    /** AES-GCM ciphertext of the 32B fileKey (32B + 16B GCM tag = 48B). */
    seedFileKeyCiphertext: Uint8Array;
    /** 12B IV used for the AES-GCM wrap, fresh per save. */
    seedFileKeyIv: Uint8Array;
    /** Public seed material (non-sensitive, embedded in CVEF too). */
    seedPublic: VaultResumeSeedPublic;
}

/**
 * Input shape for `saveUploadResumeRecord`. Carries the full seed (including
 * the raw fileKey) — the helper wraps `seed.fileKey` internally before
 * writing to IDB.
 */
export interface SaveUploadResumeInput {
    serverFileId: number;
    multipartUploadId: string;
    serverFileKey: string;
    folderId: number | null;
    file: UploadResumeFileIdentity;
    seed: HybridEncryptionSeed;
    encryptionVersion: number;
    contentHash?: string;
    fingerprintVersion?: number;
    partSize: number;
    totalParts: number;
    completedParts: UploadResumePartEntry[];
    createdAt: number;
    expiresAt: number;
}

interface ResumeDbSchema extends DBSchema {
    [STORE]: {
        key: number;
        value: VaultUploadResumeRecordPersisted;
        indexes: { [EXPIRES_INDEX]: number };
    };
}

let dbPromise: Promise<IDBPDatabase<ResumeDbSchema>> | null = null;

async function getDb(): Promise<IDBPDatabase<ResumeDbSchema>> {
    if (dbPromise) return dbPromise;
    dbPromise = openDB<ResumeDbSchema>(DB_NAME, DB_VERSION, {
        upgrade(database) {
            if (!database.objectStoreNames.contains(STORE)) {
                const store = database.createObjectStore(STORE, { keyPath: 'serverFileId' });
                store.createIndex(EXPIRES_INDEX, 'expiresAt');
            }
        },
        terminated() {
            dbPromise = null;
        },
    });
    return dbPromise;
}

/** Test-only hook to close and forget the cached connection. */
export async function __resetUploadResumeDbForTests(): Promise<void> {
    if (dbPromise) {
        try {
            const db = await dbPromise;
            db.close();
        } catch {
            /* already closed */
        }
    }
    dbPromise = null;
}

function isCurrentVersion(record: unknown): record is VaultUploadResumeRecordPersisted {
    return (
        typeof record === 'object' &&
        record !== null &&
        (record as { v?: unknown }).v === VAULT_RESUME_RECORD_VERSION
    );
}

function toView(persisted: VaultUploadResumeRecordPersisted): VaultUploadResumeRecordView {
    const {
        serverFileId, multipartUploadId, serverFileKey, folderId, file,
        encryptionVersion, contentHash, fingerprintVersion,
        partSize, totalParts, completedParts, createdAt, expiresAt,
    } = persisted;
    return {
        serverFileId, multipartUploadId, serverFileKey, folderId, file,
        encryptionVersion, contentHash, fingerprintVersion,
        partSize, totalParts, completedParts, createdAt, expiresAt,
    };
}

function buildAad(userId: number, serverFileId: number): Uint8Array {
    return new TextEncoder().encode(`upload-resume-v1:${userId}:${serverFileId}`);
}

/**
 * Wrap a 32B file key for at-rest persistence. Derives a per-purpose KEK
 * from the master HKDF key, AES-GCM encrypts the fileKey with a fresh IV,
 * and binds the ciphertext to `(userId, serverFileId)` via AAD.
 */
async function wrapResumeSeedFileKey(
    fileKey: Uint8Array,
    hkdfKey: CryptoKey,
    userId: number,
    serverFileId: number,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    const kek = await deriveUploadResumeKeyFromMaster(hkdfKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = buildAad(userId, serverFileId);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
            kek,
            toArrayBuffer(fileKey),
        ),
    );
    return { ciphertext, iv };
}

/**
 * Reverse of `wrapResumeSeedFileKey`. Throws on AAD mismatch (wrong userId
 * or serverFileId), wrong master key (rotated by password reset), or
 * tampered ciphertext.
 */
async function unwrapResumeSeedFileKeyBytes(
    persisted: VaultUploadResumeRecordPersisted,
    hkdfKey: CryptoKey,
    userId: number,
): Promise<Uint8Array> {
    const kek = await deriveUploadResumeKeyFromMaster(hkdfKey);
    const aad = buildAad(userId, persisted.serverFileId);
    const plaintext = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: toArrayBuffer(persisted.seedFileKeyIv),
            additionalData: toArrayBuffer(aad),
        },
        kek,
        toArrayBuffer(persisted.seedFileKeyCiphertext),
    );
    return new Uint8Array(plaintext);
}

/**
 * Persist a fresh resume record. The caller's `input.seed.fileKey` is
 * wrapped before write — it never lands on disk in plaintext.
 *
 * Returns false on IndexedDB unavailability (private browsing, quota
 * exhausted after trim). On quota pressure the `completedParts` tail is
 * trimmed before retrying — losing some skip candidates is preferable to
 * losing the resume option entirely.
 */
export async function saveUploadResumeRecord(
    input: SaveUploadResumeInput,
    hkdfKey: CryptoKey,
    userId: number,
): Promise<boolean> {
    const { ciphertext, iv } = await wrapResumeSeedFileKey(
        input.seed.fileKey,
        hkdfKey,
        userId,
        input.serverFileId,
    );

    const persisted: VaultUploadResumeRecordPersisted = {
        v: VAULT_RESUME_RECORD_VERSION,
        serverFileId: input.serverFileId,
        multipartUploadId: input.multipartUploadId,
        serverFileKey: input.serverFileKey,
        folderId: input.folderId,
        file: input.file,
        encryptionVersion: input.encryptionVersion,
        contentHash: input.contentHash,
        fingerprintVersion: input.fingerprintVersion,
        partSize: input.partSize,
        totalParts: input.totalParts,
        completedParts: input.completedParts,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        seedFileKeyCiphertext: ciphertext,
        seedFileKeyIv: iv,
        seedPublic: {
            baseIv: input.seed.baseIv,
            wrappedFileKey: input.seed.wrappedFileKey,
            classicalCiphertext: input.seed.classicalCiphertext,
            pqCiphertext: input.seed.pqCiphertext,
            signatureMetadata: input.seed.signatureMetadata,
        },
    };

    try {
        const db = await getDb();
        await db.put(STORE, persisted);
        return true;
    } catch (err) {
        if (!isQuotaError(err)) {
            debugWarn('[upload-resume]', 'save failed (non-quota)', err);
            return false;
        }
        try {
            const db = await getDb();
            const trimmed: VaultUploadResumeRecordPersisted = {
                ...persisted,
                completedParts: persisted.completedParts.slice(-VAULT_RESUME_TAIL_CAP),
            };
            await db.put(STORE, trimmed);
            return true;
        } catch (err2) {
            debugWarn('[upload-resume]', 'save failed (quota after trim)', err2);
            return false;
        }
    }
}

/**
 * Update the `completedParts` slice of an existing record without rewriting
 * the rest. Called from the upload progress callback every Nth part. Does
 * not need the master key — touches no crypto material.
 */
export async function updateUploadResumeParts(
    serverFileId: number,
    completedParts: UploadResumePartEntry[],
): Promise<boolean> {
    try {
        const db = await getDb();
        const existing = await db.get(STORE, serverFileId);
        if (!existing || !isCurrentVersion(existing)) return false;
        const next: VaultUploadResumeRecordPersisted = { ...existing, completedParts };
        await db.put(STORE, next);
        return true;
    } catch (err) {
        if (!isQuotaError(err)) {
            debugWarn('[upload-resume]', 'updateParts failed', err);
            return false;
        }
        try {
            const db = await getDb();
            const existing = await db.get(STORE, serverFileId);
            if (!existing || !isCurrentVersion(existing)) return false;
            const trimmed: VaultUploadResumeRecordPersisted = {
                ...existing,
                completedParts: completedParts.slice(-VAULT_RESUME_TAIL_CAP),
            };
            await db.put(STORE, trimmed);
            return true;
        } catch {
            return false;
        }
    }
}

/** Return all live (non-expired, current-version) records as banner views. */
export async function listUploadResumeRecords(): Promise<VaultUploadResumeRecordView[]> {
    try {
        const db = await getDb();
        const all = await db.getAll(STORE);
        const now = Date.now();
        const live: VaultUploadResumeRecordView[] = [];
        for (const raw of all) {
            if (!isCurrentVersion(raw)) {
                const stale = raw as { serverFileId?: unknown };
                if (typeof stale.serverFileId === 'number') {
                    await db.delete(STORE, stale.serverFileId).catch(() => {});
                }
                continue;
            }
            if (raw.expiresAt > now) live.push(toView(raw));
        }
        return live;
    } catch (err) {
        debugWarn('[upload-resume]', 'list failed', err);
        return [];
    }
}

export async function getUploadResumeRecord(
    serverFileId: number,
): Promise<VaultUploadResumeRecordView | null> {
    try {
        const db = await getDb();
        const raw = await db.get(STORE, serverFileId);
        if (!raw || !isCurrentVersion(raw)) return null;
        if (raw.expiresAt <= Date.now()) return null;
        return toView(raw);
    } catch (err) {
        debugWarn('[upload-resume]', 'get failed', err);
        return null;
    }
}

/**
 * Look up a resume record and reconstruct its full `HybridEncryptionSeed`
 * (with plaintext fileKey) by unwrapping the persisted ciphertext with the
 * caller's master HKDF key.
 *
 * Returns null if the record is missing or expired. **Throws** if the
 * unwrap fails (wrong master key, AAD mismatch, tampered ciphertext) — the
 * caller decides whether to delete the record and surface an error.
 */
export async function unwrapResumeSeed(
    serverFileId: number,
    hkdfKey: CryptoKey,
    userId: number,
): Promise<HybridEncryptionSeed | null> {
    let persisted: VaultUploadResumeRecordPersisted | null = null;
    try {
        const db = await getDb();
        const raw = await db.get(STORE, serverFileId);
        if (!raw || !isCurrentVersion(raw)) return null;
        if (raw.expiresAt <= Date.now()) return null;
        persisted = raw;
    } catch (err) {
        debugWarn('[upload-resume]', 'unwrap lookup failed', err);
        return null;
    }

    const fileKey = await unwrapResumeSeedFileKeyBytes(persisted, hkdfKey, userId);
    return {
        fileKey,
        baseIv: persisted.seedPublic.baseIv,
        wrappedFileKey: persisted.seedPublic.wrappedFileKey,
        classicalCiphertext: persisted.seedPublic.classicalCiphertext,
        pqCiphertext: persisted.seedPublic.pqCiphertext,
        signatureMetadata: persisted.seedPublic.signatureMetadata,
    };
}

export async function deleteUploadResumeRecord(serverFileId: number): Promise<void> {
    try {
        const db = await getDb();
        await db.delete(STORE, serverFileId);
    } catch (err) {
        debugWarn('[upload-resume]', 'delete failed', err);
    }
}

/**
 * Remove every record with `expiresAt <= now`. Returns the count removed.
 * Call on app mount so an expired banner doesn't linger and IndexedDB
 * doesn't accumulate dead entries.
 */
export async function cleanupExpiredUploadResumeRecords(): Promise<number> {
    try {
        const db = await getDb();
        const now = Date.now();
        const tx = db.transaction(STORE, 'readwrite');
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
        debugWarn('[upload-resume]', 'cleanup failed', err);
        return 0;
    }
}

/**
 * Test-only: read the raw persisted shape so tests can assert that no
 * plaintext fileKey bytes appear in IDB.
 */
export async function __getUploadResumeRecordPersistedForTests(
    serverFileId: number,
): Promise<VaultUploadResumeRecordPersisted | null> {
    try {
        const db = await getDb();
        const raw = await db.get(STORE, serverFileId);
        if (!raw || !isCurrentVersion(raw)) return null;
        return raw;
    } catch {
        return null;
    }
}

function isQuotaError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}
