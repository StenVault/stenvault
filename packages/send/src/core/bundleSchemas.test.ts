/**
 * Contract tests for the V2 bundle Zod schemas. These pin the input shapes
 * that the V2 publicSend procedures will validate — if a procedure changes
 * its contract, the test surfaces the break before a client ships.
 *
 * The contiguous-fileIndex rule is the load-bearing invariant: IV derivation
 * depends on dense 0..N-1 indices, so any schema that accepts a gap is a
 * latent crypto footgun.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import {
    SEND_MAX_BUNDLE_FILES,
    initiateBundleSchema,
    completeBundleSchema,
    getFileDownloadUrlSchema,
    signSendPartsSchema,
    queryUploadStatusSchema,
    type BundleManifest,
    type SendFileEntry,
    type SendSession,
} from "./types";

const validInitiateBase = {
    encryptedMeta: "YWFh",
    metaIv: "Ym1i",
    chunkBaseIv: "Y2Nj",
    expiresInHours: 24,
    maxDownloads: null,
};

const makeFile = (fileIndex: number) => ({
    fileIndex,
    fileSize: 1024,
    mimeType: "application/octet-stream",
    totalParts: 1,
});

describe("initiateBundleSchema", () => {
    it("accepts a single-file bundle", () => {
        const result = initiateBundleSchema.safeParse({
            ...validInitiateBase,
            files: [makeFile(0)],
        });
        expect(result.success).toBe(true);
    });

    it("accepts a multi-file bundle with contiguous indices", () => {
        const result = initiateBundleSchema.safeParse({
            ...validInitiateBase,
            files: [0, 1, 2, 3].map(makeFile),
        });
        expect(result.success).toBe(true);
    });

    it("rejects an empty files array", () => {
        const result = initiateBundleSchema.safeParse({ ...validInitiateBase, files: [] });
        expect(result.success).toBe(false);
    });

    it("rejects more than SEND_MAX_BUNDLE_FILES", () => {
        const files = Array.from({ length: SEND_MAX_BUNDLE_FILES + 1 }, (_, i) => makeFile(i));
        const result = initiateBundleSchema.safeParse({ ...validInitiateBase, files });
        expect(result.success).toBe(false);
    });

    it("rejects duplicate fileIndex", () => {
        const result = initiateBundleSchema.safeParse({
            ...validInitiateBase,
            files: [makeFile(0), makeFile(0)],
        });
        expect(result.success).toBe(false);
    });

    it("rejects a gap in fileIndex (0, 2)", () => {
        const result = initiateBundleSchema.safeParse({
            ...validInitiateBase,
            files: [makeFile(0), makeFile(2)],
        });
        expect(result.success).toBe(false);
    });

    it("rejects totalParts over 10,000", () => {
        const result = initiateBundleSchema.safeParse({
            ...validInitiateBase,
            files: [{ ...makeFile(0), totalParts: 10_001 }],
        });
        expect(result.success).toBe(false);
    });

    it("rejects fileSize of zero", () => {
        const result = initiateBundleSchema.safeParse({
            ...validInitiateBase,
            files: [{ ...makeFile(0), fileSize: 0 }],
        });
        expect(result.success).toBe(false);
    });
});

describe("completeBundleSchema", () => {
    const validBase = {
        sessionId: "a".repeat(32),
        uploadSecret: "b".repeat(64),
    };

    const validFile = {
        fileIndex: 0,
        parts: [{ partNumber: 1, etag: "\"etag-1\"" }],
        chunkHashes: "abc123:def456",
        chunkManifestHmac: "0".repeat(64),
    };

    it("accepts a well-formed single-file completion", () => {
        const result = completeBundleSchema.safeParse({
            ...validBase,
            files: [validFile],
        });
        expect(result.success).toBe(true);
    });

    it("rejects a non-hex chunkManifestHmac", () => {
        const result = completeBundleSchema.safeParse({
            ...validBase,
            files: [{ ...validFile, chunkManifestHmac: "not-valid-hex" }],
        });
        expect(result.success).toBe(false);
    });

    it("rejects an HMAC of wrong length", () => {
        const result = completeBundleSchema.safeParse({
            ...validBase,
            files: [{ ...validFile, chunkManifestHmac: "0".repeat(63) }],
        });
        expect(result.success).toBe(false);
    });

    it("rejects empty parts array", () => {
        const result = completeBundleSchema.safeParse({
            ...validBase,
            files: [{ ...validFile, parts: [] }],
        });
        expect(result.success).toBe(false);
    });

    it("rejects fileIndex gap in completion", () => {
        const result = completeBundleSchema.safeParse({
            ...validBase,
            files: [
                { ...validFile, fileIndex: 0 },
                { ...validFile, fileIndex: 2 },
            ],
        });
        expect(result.success).toBe(false);
    });
});

describe("getFileDownloadUrlSchema", () => {
    const validBase = {
        sessionId: "a".repeat(32),
        fileIndex: 0,
        downloadToken: "c".repeat(64),
    };

    it("accepts valid input", () => {
        const result = getFileDownloadUrlSchema.safeParse(validBase);
        expect(result.success).toBe(true);
    });

    it("rejects negative fileIndex", () => {
        const result = getFileDownloadUrlSchema.safeParse({ ...validBase, fileIndex: -1 });
        expect(result.success).toBe(false);
    });

    it("rejects malformed sessionId", () => {
        const result = getFileDownloadUrlSchema.safeParse({
            ...validBase,
            sessionId: "not-hex-32-chars",
        });
        expect(result.success).toBe(false);
    });

    it("rejects a downloadToken of wrong length", () => {
        const result = getFileDownloadUrlSchema.safeParse({
            ...validBase,
            downloadToken: "short",
        });
        expect(result.success).toBe(false);
    });
});

describe("signSendPartsSchema", () => {
    it("accepts a batch of part numbers for a file", () => {
        const result = signSendPartsSchema.safeParse({
            sessionId: "a".repeat(32),
            uploadSecret: "b".repeat(64),
            fileIndex: 3,
            partNumbers: [1, 2, 3, 4, 5],
        });
        expect(result.success).toBe(true);
    });

    it("rejects a batch larger than 64", () => {
        const partNumbers = Array.from({ length: 65 }, (_, i) => i + 1);
        const result = signSendPartsSchema.safeParse({
            sessionId: "a".repeat(32),
            uploadSecret: "b".repeat(64),
            fileIndex: 0,
            partNumbers,
        });
        expect(result.success).toBe(false);
    });
});

describe("queryUploadStatusSchema", () => {
    it("accepts valid per-file status query", () => {
        const result = queryUploadStatusSchema.safeParse({
            sessionId: "a".repeat(32),
            uploadSecret: "b".repeat(64),
            fileIndex: 7,
        });
        expect(result.success).toBe(true);
    });
});

describe("V2 type shapes", () => {
    it("BundleManifest pins v:2 + files array", () => {
        expectTypeOf<BundleManifest>().toEqualTypeOf<{
            v: 2;
            files: Array<{
                fileIndex: number;
                name: string;
                size: number;
                type: string;
            }>;
        }>();
    });

    it("SendFileEntry pins persisted fields", () => {
        expectTypeOf<keyof SendFileEntry>().toEqualTypeOf<
            | "fileIndex"
            | "fileSize"
            | "mimeType"
            | "totalParts"
            | "partSize"
            | "r2Key"
            | "uploadId"
            | "parts"
            | "status"
            | "chunkHashes"
            | "chunkManifestHmac"
        >();
    });

    it("SendSession pins top-level fields", () => {
        expectTypeOf<keyof SendSession>().toEqualTypeOf<
            | "sessionId"
            | "uploaderIp"
            | "uploadSecretHash"
            | "encryptedMeta"
            | "metaIv"
            | "chunkBaseIv"
            | "files"
            | "totalBytes"
            | "status"
            | "passwordHash"
            | "maxDownloads"
            | "downloadCount"
            | "createdAt"
            | "expiresAt"
            | "userId"
            | "encryptedThumbnail"
            | "thumbnailIv"
            | "encryptedSnippet"
            | "snippetIv"
            | "notifyOnDownload"
            | "notificationSent"
            | "replyToSessionId"
        >();
    });
});
