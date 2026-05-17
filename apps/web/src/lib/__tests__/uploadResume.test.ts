/**
 * IndexedDB-backed resume storage for Vault multipart uploads.
 *
 * happy-dom does not ship an IndexedDB implementation; fake-indexeddb/auto
 * installs a W3C-compliant polyfill as the `indexedDB` global so this can
 * run identically to the Send V2 resume tests. Real WebCrypto comes from
 * Node 20+ via globalThis.crypto.subtle — no mocks for the wrap/unwrap step.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB } from 'idb';
import { toArrayBuffer } from '@stenvault/shared/platform/crypto';
import {
    saveUploadResumeRecord,
    updateUploadResumeParts,
    listUploadResumeRecords,
    getUploadResumeRecord,
    deleteUploadResumeRecord,
    cleanupExpiredUploadResumeRecords,
    unwrapResumeSeed,
    __resetUploadResumeDbForTests,
    __getUploadResumeRecordPersistedForTests,
    VAULT_RESUME_TTL_MS,
    type SaveUploadResumeInput,
} from '../uploadResume';

const DB_NAME = 'stenvault-upload-resume';
const TEST_USER_ID = 42;

async function putRawRecord(record: Record<string, unknown>): Promise<void> {
    const db = await openDB(DB_NAME, 1, {
        upgrade(database) {
            if (!database.objectStoreNames.contains('records')) {
                const store = database.createObjectStore('records', { keyPath: 'serverFileId' });
                store.createIndex('expiresAt', 'expiresAt');
            }
        },
    });
    await db.put('records', record);
    db.close();
}

function hoursFromNow(hours: number): number {
    return Date.now() + hours * 60 * 60 * 1000;
}

/**
 * Build a deterministic HKDF CryptoKey from a 32-byte seed. Real WebCrypto;
 * different seeds → different derived KEKs → unwrap MUST fail across them.
 */
async function makeTestHkdf(seed: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', toArrayBuffer(seed), 'HKDF', false, ['deriveKey']);
}

const HKDF_SEED_A = new Uint8Array(32).fill(0xa1);
const HKDF_SEED_B = new Uint8Array(32).fill(0xb2);

const KNOWN_FILE_KEY = new Uint8Array(32);
for (let i = 0; i < 32; i++) KNOWN_FILE_KEY[i] = i + 1; // 0x01..0x20

function makeInput(overrides: Partial<SaveUploadResumeInput> = {}): SaveUploadResumeInput {
    return {
        serverFileId: 100,
        multipartUploadId: 'upload-id-x',
        serverFileKey: 'users/42/abc.bin',
        folderId: null,
        file: {
            name: 'video.mp4',
            size: 1024 * 1024 * 100,
            lastModified: 1714000000000,
            mimeType: 'video/mp4',
        },
        seed: {
            fileKey: new Uint8Array(KNOWN_FILE_KEY),
            baseIv: new Uint8Array(12).fill(2),
            wrappedFileKey: new Uint8Array(40).fill(3),
            classicalCiphertext: new Uint8Array(32).fill(4),
            pqCiphertext: new Uint8Array(1088).fill(5),
        },
        encryptionVersion: 4,
        partSize: 100 * 1024 * 1024,
        totalParts: 1,
        completedParts: [],
        createdAt: Date.now(),
        expiresAt: hoursFromNow(24),
        ...overrides,
    };
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

describe('uploadResume — IndexedDB CRUD', () => {
    beforeEach(async () => {
        await __resetUploadResumeDbForTests();
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () => resolve();
        });
    });

    afterEach(async () => {
        await __resetUploadResumeDbForTests();
    });

    it('saves and retrieves a banner view by serverFileId', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        const ok = await saveUploadResumeRecord(makeInput({ serverFileId: 7 }), hkdf, TEST_USER_ID);
        expect(ok).toBe(true);

        const fetched = await getUploadResumeRecord(7);
        expect(fetched).not.toBeNull();
        expect(fetched!.multipartUploadId).toBe('upload-id-x');
        expect(fetched!.file.name).toBe('video.mp4');
        // View carries no crypto material
        expect((fetched as unknown as { seed?: unknown }).seed).toBeUndefined();
    });

    it('lists all live records as views', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 1 }), hkdf, TEST_USER_ID);
        await saveUploadResumeRecord(makeInput({ serverFileId: 2 }), hkdf, TEST_USER_ID);
        await saveUploadResumeRecord(makeInput({ serverFileId: 3 }), hkdf, TEST_USER_ID);

        const records = await listUploadResumeRecords();
        expect(records).toHaveLength(3);
        expect(records.map(r => r.serverFileId).sort()).toEqual([1, 2, 3]);
    });

    it('returns null from get() for an expired record', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(
            makeInput({ serverFileId: 8, expiresAt: Date.now() - 1000 }),
            hkdf,
            TEST_USER_ID,
        );

        const fetched = await getUploadResumeRecord(8);
        expect(fetched).toBeNull();
    });

    it('list() filters out expired records', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(
            makeInput({ serverFileId: 1, expiresAt: hoursFromNow(1) }),
            hkdf, TEST_USER_ID,
        );
        await saveUploadResumeRecord(
            makeInput({ serverFileId: 2, expiresAt: Date.now() - 5000 }),
            hkdf, TEST_USER_ID,
        );

        const records = await listUploadResumeRecords();
        expect(records.map(r => r.serverFileId)).toEqual([1]);
    });

    it('updates only the completedParts slice without touching other fields', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        const original = makeInput({ serverFileId: 9, totalParts: 5 });
        await saveUploadResumeRecord(original, hkdf, TEST_USER_ID);

        const ok = await updateUploadResumeParts(9, [
            { partNumber: 1, etag: 'a' },
            { partNumber: 2, etag: 'b' },
        ]);
        expect(ok).toBe(true);

        const updated = await getUploadResumeRecord(9);
        expect(updated!.completedParts).toEqual([
            { partNumber: 1, etag: 'a' },
            { partNumber: 2, etag: 'b' },
        ]);
        expect(updated!.multipartUploadId).toBe(original.multipartUploadId);
        expect(updated!.totalParts).toBe(5);

        // Wrapped seed survives the part update
        const seed = await unwrapResumeSeed(9, hkdf, TEST_USER_ID);
        expect(seed).not.toBeNull();
        expect(Array.from(seed!.fileKey)).toEqual(Array.from(KNOWN_FILE_KEY));
    });

    it('updateUploadResumeParts returns false when the record is missing', async () => {
        const ok = await updateUploadResumeParts(999, [{ partNumber: 1, etag: 'a' }]);
        expect(ok).toBe(false);
    });

    it('deletes a record by serverFileId', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 11 }), hkdf, TEST_USER_ID);
        expect(await getUploadResumeRecord(11)).not.toBeNull();

        await deleteUploadResumeRecord(11);

        expect(await getUploadResumeRecord(11)).toBeNull();
    });

    it('cleanupExpiredRecords removes expired and reports the count', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 1, expiresAt: hoursFromNow(1) }), hkdf, TEST_USER_ID);
        await saveUploadResumeRecord(makeInput({ serverFileId: 2, expiresAt: Date.now() - 5000 }), hkdf, TEST_USER_ID);
        await saveUploadResumeRecord(makeInput({ serverFileId: 3, expiresAt: Date.now() - 10000 }), hkdf, TEST_USER_ID);

        const deleted = await cleanupExpiredUploadResumeRecords();
        expect(deleted).toBe(2);

        const remaining = await listUploadResumeRecords();
        expect(remaining.map(r => r.serverFileId)).toEqual([1]);
    });

    it('drops records with a wrong schema version on read', async () => {
        // Plant a v1 record (pre-wrap shape) — current reader must ignore it
        await putRawRecord({
            v: 1,
            serverFileId: 42,
            expiresAt: hoursFromNow(1),
            file: { name: 'old.bin' },
        });

        const list = await listUploadResumeRecords();
        expect(list).toEqual([]);

        const single = await getUploadResumeRecord(42);
        expect(single).toBeNull();
    });

    it('TTL constant matches the 24 h R2 orphan-cleanup window', () => {
        expect(VAULT_RESUME_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });
});

describe('uploadResume — fileKey wrapping (defense-in-depth)', () => {
    beforeEach(async () => {
        await __resetUploadResumeDbForTests();
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () => resolve();
        });
    });

    afterEach(async () => {
        await __resetUploadResumeDbForTests();
    });

    it('persisted record contains no plaintext fileKey bytes', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 50 }), hkdf, TEST_USER_ID);

        const persisted = await __getUploadResumeRecordPersistedForTests(50);
        expect(persisted).not.toBeNull();

        // The fileKey hex must NOT appear anywhere in the persisted shape.
        const knownHex = bytesToHex(KNOWN_FILE_KEY);
        const fields = [
            persisted!.seedFileKeyCiphertext,
            persisted!.seedFileKeyIv,
            persisted!.seedPublic.baseIv,
            persisted!.seedPublic.wrappedFileKey,
            persisted!.seedPublic.classicalCiphertext,
            persisted!.seedPublic.pqCiphertext,
        ];
        for (const field of fields) {
            expect(bytesToHex(field).includes(knownHex)).toBe(false);
        }

        // The ciphertext IS 48B (32 plaintext + 16 GCM tag).
        expect(persisted!.seedFileKeyCiphertext.length).toBe(48);
        expect(persisted!.seedFileKeyIv.length).toBe(12);
    });

    it('unwrap restores the original fileKey byte-for-byte', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 51 }), hkdf, TEST_USER_ID);

        const seed = await unwrapResumeSeed(51, hkdf, TEST_USER_ID);
        expect(seed).not.toBeNull();
        expect(Array.from(seed!.fileKey)).toEqual(Array.from(KNOWN_FILE_KEY));
        expect(Array.from(seed!.baseIv)).toEqual(Array.from(new Uint8Array(12).fill(2)));
        expect(seed!.classicalCiphertext.length).toBe(32);
        expect(seed!.pqCiphertext.length).toBe(1088);
    });

    it('unwrap with mismatched serverFileId fails', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 52 }), hkdf, TEST_USER_ID);

        // Tamper: copy the persisted record under a different serverFileId
        // so AAD on unwrap won't match the stored ciphertext.
        const persisted = await __getUploadResumeRecordPersistedForTests(52);
        await putRawRecord({ ...persisted!, serverFileId: 99 });

        await expect(unwrapResumeSeed(99, hkdf, TEST_USER_ID)).rejects.toThrow();
    });

    it('unwrap with mismatched userId fails', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(makeInput({ serverFileId: 53 }), hkdf, TEST_USER_ID);

        // Different userId in the AAD → AES-GCM auth tag check fails.
        await expect(unwrapResumeSeed(53, hkdf, TEST_USER_ID + 1)).rejects.toThrow();
    });

    it('unwrap with a different master HKDF fails (password reset / cross-user)', async () => {
        const hkdfA = await makeTestHkdf(HKDF_SEED_A);
        const hkdfB = await makeTestHkdf(HKDF_SEED_B);

        await saveUploadResumeRecord(makeInput({ serverFileId: 54 }), hkdfA, TEST_USER_ID);

        await expect(unwrapResumeSeed(54, hkdfB, TEST_USER_ID)).rejects.toThrow();
    });

    it('unwrap returns null for an expired record (no decrypt attempt)', async () => {
        const hkdf = await makeTestHkdf(HKDF_SEED_A);
        await saveUploadResumeRecord(
            makeInput({ serverFileId: 55, expiresAt: Date.now() - 1000 }),
            hkdf,
            TEST_USER_ID,
        );

        const seed = await unwrapResumeSeed(55, hkdf, TEST_USER_ID);
        expect(seed).toBeNull();
    });
});
