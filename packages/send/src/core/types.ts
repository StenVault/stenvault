/**
 * Public Send — Types, Zod Schemas & Constants (V2 per-file bundle)
 *
 * Anonymous encrypted file sharing (no account required). These types
 * are consumed by both @stenvault/send/client (browser upload/download
 * orchestration) and @stenvault/send/server (session persistence and
 * tRPC procedures). DOM-free on purpose — apps/api imports these
 * without needing the WebCrypto type surface.
 *
 * V2 architecture: each session carries N independent files. See
 * SEND_V2_DESIGN.md for the upload/download flow and IV derivation.
 */
import { z } from "zod";
import {
    SEND_EXPIRY_AUTH_MAX_HOURS,
    SEND_FILE_SIZE_AUTH_MAX_BYTES,
    SEND_PASSWORD_MIN_LENGTH,
    SEND_PART_SIZE,
} from "@stenvault/shared";

// ============ Constants ============

export { SEND_PART_SIZE };

/** Default TTL for send sessions (24 hours). */
export const DEFAULT_SEND_TTL_HOURS = 24;

/** AES-GCM auth tag size (16 bytes). */
export const SEND_AUTH_TAG_SIZE = 16;

/** Encryption overhead per chunk: auth tag only (IV is derived, not prepended). */
export const SEND_ENCRYPTION_OVERHEAD = SEND_AUTH_TAG_SIZE;

/** Maximum files per bundle. Bound by IV fileIndex be16 space (65535),
 *  practical UI + UX, and server manifest size in Redis. */
export const SEND_MAX_BUNDLE_FILES = 256;

/** Blocked MIME types — executables not allowed via /send. */
export const BLOCKED_SEND_MIME_TYPES = new Set([
    "application/x-msdownload",
    "application/x-executable",
    "application/x-msdos-program",
    "application/vnd.microsoft.portable-executable",
]);

/** Abuse report reasons. */
export const ABUSE_REASONS = [
    "malware",
    "phishing",
    "illegal_content",
    "copyright",
    "other",
] as const;

export type AbuseReason = (typeof ABUSE_REASONS)[number];

/** Number of abuse reports to auto-flag a session. */
export const ABUSE_REPORT_THRESHOLD = 3;

export const SEND_ABUSE_PREFIX = "send:abuse:";
export const SEND_ABUSE_INDEX_KEY = "send:abuse:index";
export const SEND_BLOCKED_PREFIX = "send:blocked:";
export const SEND_FLAGGED_IP_PREFIX = "send:ip:flagged:";
export const SEND_BYTE_QUOTA_PREFIX = "send:byteq:";
export const SEND_STATS_PREFIX = "send:stats:daily:";

/** Number of flagged sessions per IP before auto-ban. */
export const AUTO_BAN_IP_THRESHOLD = 3;

export const SEND_HISTORY_PREFIX = "send:history:";
export const SEND_SESSION_PREFIX = "send:session:";
export const SEND_STORAGE_PREFIX = "send/temp/";

/** Redis key prefix for short-lived download tokens issued by claimDownload. */
export const SEND_DOWNLOAD_TOKEN_PREFIX = "send:dtok:";

/** Max TTL of a download token (clamped at claim time against session expiry). */
export const SEND_DOWNLOAD_TOKEN_MAX_TTL_SECONDS = 60 * 60; // 1 hour

/** Redis key prefix for per-session signSendParts budget counters. */
export const SEND_SIGN_BUDGET_PREFIX = "send:signbudget:";

/**
 * Sign-budget multiplier — how many times the declared totalParts sum an
 * uploader is allowed to request presigned URLs for. The budget is seeded at
 * initiateBundle and atomically decremented on every signSendParts call.
 *
 * Covers three legitimate refresh sources: presigned-URL TTL expiry mid-upload
 * (15 min TTL vs. slow-network uploads that can easily run 30+ min), per-part
 * R2 AccessDenied retries, and the client's optimistic pool refills in
 * `createUrlPool`. 5× is empirical headroom; if real uploads start hitting the
 * cap the multiplier can be raised without touching the middleware layer.
 */
export const SEND_SIGN_BUDGET_MULTIPLIER = 5;

// ============ Types ============

export type SendStatus = "uploading" | "ready" | "expired" | "deleted";

/** Receiver-facing manifest — encrypted (AES-GCM + session key) on the
 *  client before upload, stored in `SendSession.encryptedMeta`. */
export interface BundleManifest {
    v: 2;
    files: Array<{
        fileIndex: number;
        name: string;
        size: number;
        type: string;
    }>;
}

/** Per-file server-side state. One R2 multipart upload per entry. The
 *  server sees `fileSize`/`mimeType` + R2 coordinates; filenames stay
 *  encrypted inside `SendSession.encryptedMeta`. */
export interface SendFileEntry {
    fileIndex: number;
    fileSize: number;
    mimeType: string;
    totalParts: number;
    partSize: number;
    r2Key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
    status: "uploading" | "ready";
    /** Colon-separated hex SHA-256 hashes of encrypted chunks (set by completeBundle). */
    chunkHashes?: string;
    /** Hex HMAC-SHA256 over this file's chunkHashes (set by completeBundle). */
    chunkManifestHmac?: string;
}

/** V2 bundle session shape. Stored as the Redis value at
 *  `send:session:{sessionId}`. */
export interface SendSession {
    sessionId: string;
    uploaderIp: string;
    /** SHA-256 of the upload secret (hex). Bearer-token auth for upload ops. */
    uploadSecretHash?: string;

    /** AES-GCM ciphertext of {@link BundleManifest} (base64). */
    encryptedMeta: string;
    /** AES-GCM IV for `encryptedMeta` (base64). */
    metaIv: string;
    /** Base IV seed for per-chunk IV derivation (base64, ≥8 bytes). */
    chunkBaseIv: string;

    files: SendFileEntry[];
    /** Sum of files[].fileSize — precomputed to avoid a reduce in hot paths. */
    totalBytes: number;

    status: SendStatus;
    passwordHash: string | null;
    maxDownloads: number | null;
    downloadCount: number;
    createdAt: string;
    expiresAt: string;

    userId?: string | null;
    encryptedThumbnail?: string | null;
    thumbnailIv?: string | null;
    encryptedSnippet?: string | null;
    snippetIv?: string | null;
    notifyOnDownload?: boolean;
    notificationSent?: boolean;
    replyToSessionId?: string | null;
}

// ============ Zod schemas ============

/** Hex-only 32-char session ID validator (shared across all publicSend schemas). */
export const sessionIdZ = z.string().regex(/^[a-f0-9]{32}$/, "Invalid session ID");

/** Assert `files[].fileIndex` is exactly `[0, 1, ..., N-1]` — no gaps, no
 *  duplicates. IV derivation relies on dense indices; a gap would leave
 *  a usable fileIndex slot that the server never allocated, letting a
 *  malicious client PUT to an R2 key nobody can decrypt. */
function assertContiguousFileIndices<T extends { fileIndex: number }>(
    files: ReadonlyArray<T>,
    ctx: z.RefinementCtx,
): void {
    const indices = files.map((f) => f.fileIndex).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) {
        if (indices[i] !== i) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "files[].fileIndex must be exactly 0..N-1 with no gaps or duplicates",
            });
            return;
        }
    }
}

const bundleFileInitSchema = z.object({
    fileIndex: z.number().int().min(0).max(65535),
    fileSize: z.number().int().positive().max(SEND_FILE_SIZE_AUTH_MAX_BYTES, "File too large"),
    mimeType: z.string().min(1).max(255),
    totalParts: z.number().int().positive().max(10_000),
});

export const initiateBundleSchema = z.object({
    files: z
        .array(bundleFileInitSchema)
        .min(1)
        .max(SEND_MAX_BUNDLE_FILES)
        .superRefine(assertContiguousFileIndices),
    /** AES-GCM ciphertext of the BundleManifest (base64). */
    encryptedMeta: z.string().min(1).max(50_000),
    /** AES-GCM IV for `encryptedMeta` (base64). */
    metaIv: z.string().min(1).max(64),
    /** Base IV seed for per-chunk IV derivation (base64, ≥8 bytes). */
    chunkBaseIv: z.string().min(1).max(24),
    password: z.string().min(SEND_PASSWORD_MIN_LENGTH).max(128).optional(),
    expiresInHours: z
        .number()
        .int()
        .min(1)
        .max(SEND_EXPIRY_AUTH_MAX_HOURS)
        .default(DEFAULT_SEND_TTL_HOURS),
    maxDownloads: z.number().int().min(1).max(1000).nullable().default(null),
    turnstileToken: z.string().optional(),
    encryptedThumbnail: z.string().max(500_000).optional(),
    thumbnailIv: z.string().max(64).optional(),
    encryptedSnippet: z.string().max(10_000).optional(),
    snippetIv: z.string().max(64).optional(),
    notifyOnDownload: z.boolean().optional(),
    replyToSessionId: sessionIdZ.optional(),
});

const bundleFileCompleteSchema = z.object({
    fileIndex: z.number().int().min(0).max(65535),
    parts: z
        .array(
            z.object({
                partNumber: z.number().int().positive(),
                etag: z.string().min(1),
            }),
        )
        .min(1),
    /** Colon-separated hex hashes, one per chunk (for integrity manifest). */
    chunkHashes: z.string().min(1).max(100_000),
    /** HMAC-SHA256 in hex = 64 chars. */
    chunkManifestHmac: z.string().regex(/^[a-f0-9]{64}$/, "Invalid HMAC"),
});

export const completeBundleSchema = z.object({
    sessionId: sessionIdZ,
    uploadSecret: z.string().length(64),
    files: z
        .array(bundleFileCompleteSchema)
        .min(1)
        .max(SEND_MAX_BUNDLE_FILES)
        .superRefine(assertContiguousFileIndices),
});

export const signSendPartsSchema = z.object({
    sessionId: sessionIdZ,
    uploadSecret: z.string().length(64),
    fileIndex: z.number().int().min(0).max(65535),
    /** Part numbers to mint fresh presigned URLs for (1-indexed, deduped, bounded). */
    partNumbers: z
        .array(z.number().int().positive().max(10_000))
        .min(1)
        .max(64),
});

export const queryUploadStatusSchema = z.object({
    sessionId: sessionIdZ,
    uploadSecret: z.string().length(64),
    fileIndex: z.number().int().min(0).max(65535),
});

export const getPreviewSchema = z.object({
    sessionId: sessionIdZ,
});

export const claimDownloadSchema = z.object({
    sessionId: sessionIdZ,
    /** Password (required if share is password-protected). */
    password: z.string().min(1).max(128).optional(),
});

export const getFileDownloadUrlSchema = z.object({
    sessionId: sessionIdZ,
    fileIndex: z.number().int().min(0).max(65535),
    /** Token issued by claimDownload — gates per-file URL minting so a
     *  caller cannot bypass the password check or downloadCount increment. */
    downloadToken: z.string().length(64),
});

export const updateSendSessionSchema = z.object({
    sessionId: sessionIdZ,
    uploadSecret: z.string().length(64),
    password: z.string().min(SEND_PASSWORD_MIN_LENGTH).max(128).nullable().optional(),
    expiresInHours: z.number().int().min(1).max(SEND_EXPIRY_AUTH_MAX_HOURS).optional(),
    maxDownloads: z.number().int().min(1).max(1000).nullable().optional(),
});

export const reportAbuseSchema = z.object({
    sessionId: sessionIdZ,
    reason: z.enum(ABUSE_REASONS),
    details: z.string().max(500).optional(),
});
