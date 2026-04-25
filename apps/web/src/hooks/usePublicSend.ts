/**
 * usePublicSend - Orchestrates anonymous encrypted file sharing.
 *
 * State machine: idle → encrypting → uploading → completing → done | error
 *
 * Features:
 * - Multi-file support (per-file bundle upload — Send V2)
 * - Speed/ETA tracking
 * - Upload resume (IndexedDB)
 * - Thumbnail/snippet encryption
 * - Auth-aware (higher limits for logged-in users)
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { SEND_PART_SIZE } from "@stenvault/shared";
import {
  generateSendKey,
  generateBaseIv,
  keyToFragment,
  fragmentToKey,
  encryptMetadata,
  encryptThumbnail,
  encryptSnippet,
  computeChunkManifest,
  uploadBundle,
  type SendUploadPart,
  type SendUploadPartUrl,
  generateThumbnail,
  readTextSnippet,
  saveResumeRecord,
  updateCompletedParts,
  findResumeRecord,
  deleteResumeRecord,
  cleanupExpiredRecords,
  RESUME_WRITE_STRIDE,
  type SendResumeRecord,
  classifySendError,
} from "@stenvault/send/client";
import type { BundleManifest } from "@stenvault/send/core";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@stenvault/shared/platform/crypto";
import { deduplicateFilenames } from "@/lib/zipBundle";

export type SendState = "idle" | "encrypting" | "uploading" | "completing" | "done" | "error";

export interface SendConfig {
  expiresInHours?: number;
  maxDownloads?: number | null;
  turnstileToken?: string;
  notifyOnDownload?: boolean;
  /** Session ID this send is replying to (viral reply chain) */
  replyToSessionId?: string;
}

export interface UpdateSessionFields {
  password?: string | null;
  expiresInHours?: number;
  maxDownloads?: number | null;
}

export interface UsePublicSendReturn {
  state: SendState;
  /** 0-100 progress during upload */
  progress: number;
  /** Full share URL (with #key= fragment) */
  shareUrl: string | null;
  error: string | null;
  /** Upload speed in bytes/sec */
  speed: number;
  /** Estimated time remaining in seconds */
  eta: number;
  /** Whether a resumable session exists — kept for banner visibility gating. */
  resumeAvailable: boolean;
  /** The persisted record backing the resume banner (file name, progress, …). */
  resumeRecord: SendResumeRecord | null;
  /** Active session ID (available after initiateSend) */
  sessionId: string | null;
  send: (files: File[], config?: SendConfig) => Promise<void>;
  /** Update session options (password, expiry, max downloads) after initiation */
  updateSession: (fields: UpdateSessionFields) => Promise<{ success: boolean; expiresAt: string }>;
  /**
   * Resume an interrupted upload by re-supplying the same files — one entry
   * for a single-file session, or the full set in the original order for a
   * bundle.
   */
  resumeSession: (files: File[]) => Promise<void>;
  /** Forget the persisted resume record without attempting resume. */
  dismissResume: () => Promise<void>;
  reset: () => void;
}

export function usePublicSend(): UsePublicSendReturn {
  const [state, setState] = useState<SendState>("idle");
  const [progress, setProgress] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [resumeRecord, setResumeRecord] = useState<SendResumeRecord | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const uploadSecretRef = useRef<string | null>(null);
  const abortRef = useRef(false);

  // Step 3 transitional: names match the V2 procedures but the shape this
  // hook feeds them is still V1. Step 4 reshapes the inputs and flows.
  const initiateMutation = trpc.publicSend.initiateBundle.useMutation();
  const completeMutation = trpc.publicSend.completeBundle.useMutation();
  const signSendPartsMutation = trpc.publicSend.signSendParts.useMutation();
  const updateSessionMutation = trpc.publicSend.updateSendSession.useMutation();
  const queryUploadStatusMutation = trpc.publicSend.queryUploadStatus.useMutation();

  // Stable refs — useMutation returns new objects each render (Golden Rule 3)
  const initiateRef = useRef(initiateMutation.mutateAsync);
  initiateRef.current = initiateMutation.mutateAsync;
  const completeRef = useRef(completeMutation.mutateAsync);
  completeRef.current = completeMutation.mutateAsync;
  const signRef = useRef(signSendPartsMutation.mutateAsync);
  signRef.current = signSendPartsMutation.mutateAsync;
  const updateRef = useRef(updateSessionMutation.mutateAsync);
  updateRef.current = updateSessionMutation.mutateAsync;
  const queryStatusRef = useRef(queryUploadStatusMutation.mutateAsync);
  queryStatusRef.current = queryUploadStatusMutation.mutateAsync;

  // Check for resume state on mount. Cleanup expired records first so we don't
  // surface a stale banner for a session the server has long forgotten.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await cleanupExpiredRecords();
      const record = await findResumeRecord();
      if (!cancelled) {
        setResumeRecord(record);
        setResumeAvailable(record !== null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Warn before unload during active upload
  useEffect(() => {
    if (state !== "encrypting" && state !== "uploading" && state !== "completing") return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  const reset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setShareUrl(null);
    setError(null);
    setSpeed(0);
    setEta(0);
    setSessionId(null);
    uploadSecretRef.current = null;
    abortRef.current = false;
  }, []);

  const send = useCallback(
    async (files: File[], config?: SendConfig) => {
      // Hoisted so the catch block can clean up the resume record for a
      // session that was created but never completed (partial-upload trap).
      let activeSessionId: string | null = null;
      try {
        abortRef.current = false;
        setState("encrypting");
        setProgress(0);
        setError(null);
        setSpeed(0);
        setEta(0);

        // 1. Generate random AES-256 key for this session.
        const key = await generateSendKey();
        const fragment = await keyToFragment(key);

        // 2. Prepare per-file data. Each selected File becomes an entry in
        //    the V2 bundle — a separate R2 multipart upload, a separate
        //    fileIndex in the IV derivation. Deduplicate names so the
        //    receiver's file list never shows two rows labelled identically.
        const isBundle = files.length > 1;
        const dedupedNames = deduplicateFilenames(files);
        const bundleFiles = files.map((f, i) => ({
          fileIndex: i,
          fileBlob: f as Blob,
          name: dedupedNames[i]!,
          size: f.size,
          type: f.type || "application/octet-stream",
          totalParts: Math.ceil(f.size / SEND_PART_SIZE),
        }));

        // 3. Generate thumbnail/snippet (best-effort, single-file only).
        let thumbnailData: { ciphertext: string; iv: string } | null = null;
        let snippetData: { ciphertext: string; iv: string } | null = null;

        if (!isBundle && files.length === 1) {
          const singleFile = files[0]!;
          const thumb = await generateThumbnail(singleFile);
          if (thumb) {
            thumbnailData = await encryptThumbnail(thumb, key);
          }
          const snippet = await readTextSnippet(singleFile);
          if (snippet) {
            snippetData = await encryptSnippet(snippet, key);
          }
        }

        // 4. Encrypt the V2 BundleManifest (filenames + sizes + MIME).
        const manifest: BundleManifest = {
          v: 2,
          files: bundleFiles.map((f) => ({
            fileIndex: f.fileIndex,
            name: f.name,
            size: f.size,
            type: f.type,
          })),
        };
        const { ciphertext: encryptedMeta, iv: metaIv } = await encryptMetadata(manifest, key);

        // 5. Generate base IV for per-chunk IV derivation. Combined with
        //    fileIndex + chunkIndex this guarantees every chunk in the
        //    bundle has a unique IV under the shared session key.
        const baseIv = generateBaseIv();
        const chunkBaseIv = arrayBufferToBase64(baseIv.buffer as ArrayBuffer);

        // 6. Initiate the bundle session — server creates one R2 multipart
        //    upload per file and mints the initial presigned URL batch for
        //    file 0 only.
        setState("uploading");
        const initiateResult = await initiateRef.current({
          files: bundleFiles.map((f) => ({
            fileIndex: f.fileIndex,
            fileSize: f.size,
            mimeType: f.type,
            totalParts: f.totalParts,
          })),
          encryptedMeta,
          metaIv,
          chunkBaseIv,
          expiresInHours: config?.expiresInHours ?? 24,
          maxDownloads: config?.maxDownloads ?? null,
          turnstileToken: config?.turnstileToken,
          encryptedThumbnail: thumbnailData?.ciphertext,
          thumbnailIv: thumbnailData?.iv,
          encryptedSnippet: snippetData?.ciphertext,
          snippetIv: snippetData?.iv,
          notifyOnDownload: config?.notifyOnDownload,
          replyToSessionId: config?.replyToSessionId,
        });
        const {
          sessionId: newSessionId,
          uploadSecret,
          expiresAt: sessionExpiresAt,
        } = initiateResult;
        activeSessionId = newSessionId;
        setSessionId(newSessionId);
        uploadSecretRef.current = uploadSecret;

        // Map server-returned initial URLs back to their fileIndex. Only
        // file 0 is seeded today — every other file fetches on demand.
        const initialPartUrlsByFile = new Map<number, ReadonlyArray<SendUploadPartUrl>>();
        for (const f of initiateResult.files) {
          initialPartUrlsByFile.set(f.fileIndex, f.partUrls);
        }

        // Persist a resume record so a tab close between here and the
        // first chunk still leaves a resumable trace. V2 tracks every file
        // in the bundle with its own completedParts slot so resume can
        // skip the parts R2 already accepted on a file-by-file basis.
        const totalBundleBytes = bundleFiles.reduce((s, f) => s + f.size, 0);
        const resumeBaseRecord: SendResumeRecord = {
          v: 2,
          sessionId: newSessionId,
          uploadSecret,
          fragment,
          baseIv: chunkBaseIv,
          totalBytes: totalBundleBytes,
          fileCount: bundleFiles.length,
          files: bundleFiles.map((f) => ({
            fileIndex: f.fileIndex,
            name: f.name,
            size: f.size,
            mimeType: f.type,
            totalParts: f.totalParts,
            completedParts: [],
          })),
          partSize: SEND_PART_SIZE,
          createdAt: Date.now(),
          expiresAt: new Date(sessionExpiresAt).getTime(),
        };
        const persisted = await saveResumeRecord(resumeBaseRecord);
        const resumeWritesDisabledByFile = new Map<number, boolean>();
        if (!persisted) {
          for (const f of bundleFiles) resumeWritesDisabledByFile.set(f.fileIndex, true);
        }

        // On-demand presigned URL refresh — threads fileIndex through so
        // signSendParts hits the correct R2 upload.
        const refreshPartUrls = async (
          fileIndex: number,
          partNumbers: number[],
        ): Promise<SendUploadPartUrl[]> => {
          const { partUrls } = await signRef.current({
            sessionId: newSessionId,
            uploadSecret,
            fileIndex,
            partNumbers,
          });
          return partUrls;
        };

        // Per-file throttled resume checkpoints. Each file keeps its own
        // stride counter so a small file's rapid part completions don't
        // starve a bigger file's checkpoint cadence.
        const lastResumeWriteAtByFile = new Map<number, number>();
        const recordCompletion = (fileIndex: number, fileParts: ReadonlyArray<SendUploadPart>) => {
          if (resumeWritesDisabledByFile.get(fileIndex)) return;
          const done = fileParts.length;
          const fileInfo = bundleFiles.find((b) => b.fileIndex === fileIndex);
          const isFinal = fileInfo ? done === fileInfo.totalParts : false;
          const lastAt = lastResumeWriteAtByFile.get(fileIndex) ?? 0;
          if (!isFinal && done - lastAt < RESUME_WRITE_STRIDE) return;
          lastResumeWriteAtByFile.set(fileIndex, done);
          updateCompletedParts(newSessionId, fileIndex, [...fileParts]).then((ok) => {
            if (!ok) resumeWritesDisabledByFile.set(fileIndex, true);
          });
        };

        const bundleResult = await uploadBundle({
          files: bundleFiles.map((f) => ({
            fileIndex: f.fileIndex,
            fileBlob: f.fileBlob,
            totalParts: f.totalParts,
            initialPartUrls: initialPartUrlsByFile.get(f.fileIndex) ?? [],
          })),
          key,
          baseIv,
          refreshPartUrls,
          abortSignal: { get aborted() { return abortRef.current; } },
          onProgress: (pct: number) => setProgress(pct),
          onSpeed: (bps: number, etaSec: number) => { setSpeed(bps); setEta(etaSec); },
          onPartComplete: (fileIndex, completed) => recordCompletion(fileIndex, completed),
        });

        // 7. Complete the upload with per-file integrity proofs.
        setState("completing");
        const completionFiles = await Promise.all(
          bundleResult.files.map(async (f) => ({
            fileIndex: f.fileIndex,
            parts: f.parts,
            chunkHashes: f.chunkHashes.join(":"),
            chunkManifestHmac: await computeChunkManifest(f.chunkHashes, key),
          })),
        );
        await completeRef.current({
          sessionId: newSessionId,
          uploadSecret,
          files: completionFiles,
        });

        // 8. Build share URL + persist to localStorage
        const baseUrl = window.location.origin;
        const url = `${baseUrl}/send/${newSessionId}#key=${fragment}`;
        setShareUrl(url);
        setState("done");

        // Clean up resume state
        await deleteResumeRecord(newSessionId);
        setResumeRecord(null);
        setResumeAvailable(false);
      } catch (err: unknown) {
        // Production-visible. debugLog is dev-only (see memory:
        // "debugLog invisible in production"), so for a critical path like
        // the Send orchestrator we want console.error to land in Railway
        // logs and browser devtools alike.
        console.error("[send] upload failed", {
          sessionId: activeSessionId,
          error: err,
        });

        // Stale resume record for a session that was created but never
        // completed would trap the user on a "Resume available" banner that
        // always fails. Clear it before surfacing the error.
        if (activeSessionId) {
          await deleteResumeRecord(activeSessionId);
        }
        setResumeRecord(null);
        setResumeAvailable(false);

        const classified = classifySendError(err);
        if (classified.kind === "aborted") {
          // User cancelled — go back to idle without an error banner.
          setState("idle");
          setProgress(0);
          setSpeed(0);
          setEta(0);
          return;
        }
        setError(classified.userMessage);
        setState("error");
        setProgress(0);
        setSpeed(0);
        setEta(0);
      }
    },
    [],
  );

  const resumeSession = useCallback(async (files: File[]) => {
    try {
      abortRef.current = false;
      setError(null);
      setProgress(0);
      setSpeed(0);
      setEta(0);

      if (files.length === 0) {
        setError("Please select the file to resume.");
        setState("error");
        return;
      }

      const record = await findResumeRecord();
      if (!record) {
        setResumeRecord(null);
        setResumeAvailable(false);
        setError("No resumable upload was found.");
        setState("error");
        return;
      }

      // Strict identity pre-check — every slot must match by deduped name
      // and byte size. Full hash verification would force reading every
      // byte, which defeats the point of resume. Any tampering still
      // fails the manifest check at completeBundle time.
      if (files.length !== record.fileCount) {
        setError(
          `This upload had ${record.fileCount} file${record.fileCount === 1 ? "" : "s"}, you selected ${files.length}. Re-select all of them in the original order.`,
        );
        setState("error");
        return;
      }
      const deduped = deduplicateFilenames(files);
      for (let i = 0; i < record.files.length; i++) {
        const slot = record.files[i]!;
        const picked = files[i]!;
        if (deduped[i] !== slot.name) {
          setError(
            `File ${i + 1} doesn't match the interrupted upload (expected ${slot.name}). Re-select the same files in the original order.`,
          );
          setState("error");
          return;
        }
        if (picked.size !== slot.size) {
          setError(
            `"${slot.name}" doesn't match the interrupted upload (expected ${slot.size} bytes, got ${picked.size}).`,
          );
          setState("error");
          return;
        }
      }

      setState("uploading");
      setSessionId(record.sessionId);
      uploadSecretRef.current = record.uploadSecret;

      const key = await fragmentToKey(record.fragment);
      const baseIv = new Uint8Array(base64ToArrayBuffer(record.baseIv));

      // Reconcile every file with R2 in parallel — `queryUploadStatus`
      // calls are read-only and the serial ordering doesn't buy us
      // anything but latency on a 256-file bundle.
      const statuses = await Promise.all(
        record.files.map((slot) =>
          queryStatusRef.current({
            sessionId: record.sessionId,
            uploadSecret: record.uploadSecret,
            fileIndex: slot.fileIndex,
          }),
        ),
      ).catch((err: unknown) => {
        const code = (err as { data?: { code?: string } })?.data?.code;
        if (code === "NOT_FOUND" || code === "BAD_REQUEST") {
          // Session is gone or no longer accepting uploads — discard the
          // record so the user doesn't loop on a banner that always fails.
          return null;
        }
        throw err;
      });
      if (statuses === null) {
        await deleteResumeRecord(record.sessionId);
        setResumeRecord(null);
        setResumeAvailable(false);
        setError("The interrupted upload has expired on the server. Please send the file again.");
        setState("error");
        return;
      }

      // Seed the bar with how much R2 already has before the pipeline
      // starts pumping. Without this the user stares at 0% while the
      // client re-encrypts skipped chunks to re-hash them locally.
      const alreadyUploadedBytes = statuses.reduce((sum, s, i) => {
        const slot = record.files[i]!;
        const fullChunks = Math.min(s.uploadedParts.length, slot.totalParts);
        return sum + Math.min(slot.size, fullChunks * record.partSize);
      }, 0);
      if (record.totalBytes > 0) {
        setProgress(
          Math.min(100, Math.round((alreadyUploadedBytes / record.totalBytes) * 100)),
        );
      }

      // Mint the initial URL batch for each file's still-missing parts.
      // One round-trip per file — batched so a wide bundle doesn't pay
      // six sequential signing round-trips before kick-off. Capped at 64
      // per call to match the server's `signSendParts` max (`partNumbers.max(64)`).
      const initialUrlsByFile = new Map<number, SendUploadPartUrl[]>();
      await Promise.all(
        record.files.map(async (slot, i) => {
          const status = statuses[i]!;
          if (status.missingPartNumbers.length === 0) {
            initialUrlsByFile.set(slot.fileIndex, []);
            return;
          }
          const { partUrls } = await signRef.current({
            sessionId: record.sessionId,
            uploadSecret: record.uploadSecret,
            fileIndex: slot.fileIndex,
            partNumbers: status.missingPartNumbers.slice(0, 64),
          });
          initialUrlsByFile.set(slot.fileIndex, [...partUrls]);
        }),
      );

      const refreshPartUrls = async (
        fileIndex: number,
        partNumbers: number[],
      ): Promise<SendUploadPartUrl[]> => {
        const { partUrls } = await signRef.current({
          sessionId: record.sessionId,
          uploadSecret: record.uploadSecret,
          fileIndex,
          partNumbers,
        });
        return partUrls;
      };

      // Per-file stride-throttled checkpoint writes during the pipeline.
      // Seed `lastResumeWriteAt` with the already-landed count so we don't
      // re-save the record until the pipeline has made fresh progress.
      const lastResumeWriteAtByFile = new Map<number, number>();
      const resumeWritesDisabledByFile = new Map<number, boolean>();
      record.files.forEach((slot, i) => {
        lastResumeWriteAtByFile.set(slot.fileIndex, statuses[i]!.uploadedParts.length);
      });
      const onPartComplete = (fileIndex: number, completed: ReadonlyArray<SendUploadPart>) => {
        if (resumeWritesDisabledByFile.get(fileIndex)) return;
        const done = completed.length;
        const slot = record.files.find((f) => f.fileIndex === fileIndex);
        const isFinal = slot ? done === slot.totalParts : false;
        const lastAt = lastResumeWriteAtByFile.get(fileIndex) ?? 0;
        if (!isFinal && done - lastAt < RESUME_WRITE_STRIDE) return;
        lastResumeWriteAtByFile.set(fileIndex, done);
        updateCompletedParts(record.sessionId, fileIndex, [...completed]).then((ok) => {
          if (!ok) resumeWritesDisabledByFile.set(fileIndex, true);
        });
      };

      const bundleResult = await uploadBundle({
        files: record.files.map((slot, i) => {
          const status = statuses[i]!;
          return {
            fileIndex: slot.fileIndex,
            fileBlob: files[i]! as Blob,
            totalParts: slot.totalParts,
            initialPartUrls: initialUrlsByFile.get(slot.fileIndex) ?? [],
            skipPartNumbers: status.uploadedParts.map((p) => p.partNumber),
            prefilledParts: [...status.uploadedParts],
          };
        }),
        key,
        baseIv,
        refreshPartUrls,
        abortSignal: { get aborted() { return abortRef.current; } },
        onProgress: (pct: number) => setProgress(pct),
        onSpeed: (bps: number, etaSec: number) => { setSpeed(bps); setEta(etaSec); },
        onPartComplete,
      });

      setState("completing");
      const completionFiles = await Promise.all(
        bundleResult.files.map(async (f) => ({
          fileIndex: f.fileIndex,
          parts: f.parts,
          chunkHashes: f.chunkHashes.join(":"),
          chunkManifestHmac: await computeChunkManifest(f.chunkHashes, key),
        })),
      );
      await completeRef.current({
        sessionId: record.sessionId,
        uploadSecret: record.uploadSecret,
        files: completionFiles,
      });

      const baseUrl = window.location.origin;
      const url = `${baseUrl}/send/${record.sessionId}#key=${record.fragment}`;
      setShareUrl(url);
      setState("done");

      await deleteResumeRecord(record.sessionId);
      setResumeRecord(null);
      setResumeAvailable(false);
    } catch (err: unknown) {
      console.error("[send] resume failed", err);
      const classified = classifySendError(err);
      if (classified.kind === "aborted") {
        setState("idle");
        setProgress(0);
        setSpeed(0);
        setEta(0);
        return;
      }
      setError(classified.userMessage);
      setState("error");
      setProgress(0);
      setSpeed(0);
      setEta(0);
    }
  }, []);

  const dismissResume = useCallback(async () => {
    const record = await findResumeRecord();
    if (record) await deleteResumeRecord(record.sessionId);
    setResumeRecord(null);
    setResumeAvailable(false);
  }, []);

  const updateSession = useCallback(
    async (fields: UpdateSessionFields) => {
      if (!sessionId || !uploadSecretRef.current) {
        throw new Error("No active session to update");
      }
      return updateRef.current({
        sessionId,
        uploadSecret: uploadSecretRef.current,
        ...fields,
      });
    },
    [sessionId],
  );

  return {
    state,
    progress,
    shareUrl,
    error,
    speed,
    eta,
    resumeAvailable,
    resumeRecord,
    sessionId,
    send,
    updateSession,
    resumeSession,
    dismissResume,
    reset,
  };
}
