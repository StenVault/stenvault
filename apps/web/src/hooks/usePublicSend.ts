/**
 * usePublicSend - Orchestrates anonymous encrypted file sharing.
 *
 * State machine: idle → encrypting → uploading → completing → done | error
 *
 * Features:
 * - Multi-file support (auto-zip via fflate)
 * - Speed/ETA tracking
 * - Upload resume (sessionStorage)
 * - Thumbnail/snippet encryption
 * - Auth-aware (higher limits for logged-in users)
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  generateSendKey,
  generateBaseIv,
  keyToFragment,
  encryptMetadata,
  encryptThumbnail,
  encryptSnippet,
  computeChunkManifest,
} from "@/lib/publicSendCrypto";
import { arrayBufferToBase64 } from "@stenvault/shared/platform/crypto";
import { prepareStreamingBundle, type ZipManifest } from "@/lib/zipBundle";
import { uploadEncryptedSend, type SendUploadPart, type SendUploadPartUrl } from "@/lib/sendUpload";
import { uploadStreamingZip } from "@/lib/streamingZipUpload";
import { generateThumbnail, readTextSnippet } from "@/lib/sendThumbnail";
import {
  getResumeKey, findResumeState, persistResumeState,
  RESUME_WRITE_STRIDE, type ResumeState,
} from "@/lib/sendResume";
import { classifySendError } from "@/lib/sendErrorClassifier";

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
  /** Whether a resumable session exists */
  resumeAvailable: boolean;
  /** Active session ID (available after initiateSend) */
  sessionId: string | null;
  send: (files: File[], config?: SendConfig) => Promise<void>;
  /** Update session options (password, expiry, max downloads) after initiation */
  updateSession: (fields: UpdateSessionFields) => Promise<{ success: boolean; expiresAt: string }>;
  resumeSession: () => Promise<void>;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const uploadSecretRef = useRef<string | null>(null);
  const abortRef = useRef(false);

  const initiateMutation = trpc.publicSend.initiateSend.useMutation();
  const completeMutation = trpc.publicSend.completeSend.useMutation();
  const signSendPartsMutation = trpc.publicSend.signSendParts.useMutation();
  const updateSessionMutation = trpc.publicSend.updateSendSession.useMutation();

  // Stable refs — useMutation returns new objects each render (Golden Rule 3)
  const initiateRef = useRef(initiateMutation.mutateAsync);
  initiateRef.current = initiateMutation.mutateAsync;
  const completeRef = useRef(completeMutation.mutateAsync);
  completeRef.current = completeMutation.mutateAsync;
  const signRef = useRef(signSendPartsMutation.mutateAsync);
  signRef.current = signSendPartsMutation.mutateAsync;
  const updateRef = useRef(updateSessionMutation.mutateAsync);
  updateRef.current = updateSessionMutation.mutateAsync;

  // Check for resume state on mount
  useEffect(() => {
    setResumeAvailable(findResumeState() !== null);
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
      // Hoisted so the catch block can clean up sessionStorage for a session
      // that was created but never completed (partial-upload trap).
      let activeSessionId: string | null = null;
      try {
        abortRef.current = false;
        setState("encrypting");
        setProgress(0);
        setError(null);
        setSpeed(0);
        setEta(0);

        // 1. Generate random AES-256 key
        const key = await generateSendKey();
        const fragment = await keyToFragment(key);

        // 2. Prepare file data — single file stays as Blob, multi-file
        //    uses streaming ZIP to avoid loading everything into memory.
        const isBundle = files.length > 1;
        let fileBlob: Blob | null = null;
        let manifest: ZipManifest | null = null;
        let mimeType: string;
        let displayName: string;
        let streamingZipSize: number | null = null;
        let streamingZipEntryNames: string[] | null = null;

        if (!isBundle) {
          const single = files[0]!;
          fileBlob = single;
          manifest = null;
          mimeType = single.type || "application/octet-stream";
          displayName = single.name;
        } else {
          const prep = prepareStreamingBundle(files);
          manifest = prep.manifest;
          mimeType = prep.mimeType;
          displayName = prep.displayName;
          streamingZipSize = prep.zipSize;
          streamingZipEntryNames = prep.zipEntryNames;
        }

        // 3. Generate thumbnail/snippet (best-effort)
        let thumbnailData: { ciphertext: string; iv: string } | null = null;
        let snippetData: { ciphertext: string; iv: string } | null = null;

        if (!isBundle && files.length === 1) {
          const singleFile = files[0]!;

          // Thumbnail for images/videos
          const thumb = await generateThumbnail(singleFile);
          if (thumb) {
            thumbnailData = await encryptThumbnail(thumb, key);
          }

          // Snippet for text files
          const snippet = await readTextSnippet(singleFile);
          if (snippet) {
            snippetData = await encryptSnippet(snippet, key);
          }
        }

        // 4. Encrypt metadata
        const { ciphertext: encryptedMeta, iv: metaIv } = await encryptMetadata(
          {
            name: displayName,
            type: mimeType,
            isBundle: isBundle || undefined,
            manifest: manifest || undefined,
          },
          key,
        );

        // 5. Generate base IV for chunk IV derivation (anti-reordering)
        const baseIv = generateBaseIv();
        const chunkBaseIv = arrayBufferToBase64(baseIv.buffer as ArrayBuffer);

        // 6. Initiate send (get first batch of presigned URLs + session meta)
        const effectiveFileSize = fileBlob ? fileBlob.size : streamingZipSize!;
        setState("uploading");
        const initiateResult = await initiateRef.current({
          fileSize: effectiveFileSize,
          mimeType,
          encryptedMeta,
          metaIv,
          expiresInHours: config?.expiresInHours ?? 24,
          maxDownloads: config?.maxDownloads ?? null,
          turnstileToken: config?.turnstileToken,
          encryptedThumbnail: thumbnailData?.ciphertext,
          thumbnailIv: thumbnailData?.iv,
          encryptedSnippet: snippetData?.ciphertext,
          snippetIv: snippetData?.iv,
          isBundle,
          notifyOnDownload: config?.notifyOnDownload,
          replyToSessionId: config?.replyToSessionId,
          chunkBaseIv,
        });
        const { sessionId: newSessionId, partUrls: initialPartUrls, totalParts, uploadSecret } = initiateResult;
        activeSessionId = newSessionId;
        setSessionId(newSessionId);
        uploadSecretRef.current = uploadSecret;

        // 6. Encrypt + upload each chunk with parallel workers and on-demand
        //    URL refresh, collecting hashes for the integrity manifest.
        const refreshPartUrls = async (
          partNumbers: number[],
        ): Promise<SendUploadPartUrl[]> => {
          const { partUrls } = await signRef.current({
            sessionId: newSessionId,
            uploadSecret,
            partNumbers,
          });
          return partUrls;
        };

        // Throttled, quota-aware resume checkpoints. We only write every
        // RESUME_WRITE_STRIDE parts because a 5-part loss on a theoretical
        // resume is harmless and it cuts 80% of sessionStorage writes — which
        // matters both for CPU on mobile and for the quota ceiling on large
        // uploads (3200+ parts at 16 MiB each).
        const resumeKey = getResumeKey(newSessionId);
        let resumeWritesDisabled = false;
        let lastResumeWriteAt = 0;

        let parts: SendUploadPart[] = [];
        let chunkHashes: string[] = [];

        const sharedCallbacks = {
          abortSignal: { get aborted() { return abortRef.current; } },
          onProgress: (pct: number) => setProgress(pct),
          onSpeed: (bps: number, etaSec: number) => { setSpeed(bps); setEta(etaSec); },
          onPartComplete: (completed: ReadonlyArray<SendUploadPart>) => {
            if (resumeWritesDisabled) return;
            const done = completed.length;
            const isFinal = done === totalParts;
            if (!isFinal && done - lastResumeWriteAt < RESUME_WRITE_STRIDE) return;
            lastResumeWriteAt = done;
            const resumeState: ResumeState = {
              sessionId: newSessionId,
              completedParts: [...completed],
              fragment,
              totalParts,
              fileSize: effectiveFileSize,
            };
            if (!persistResumeState(resumeKey, resumeState)) {
              resumeWritesDisabled = true;
            }
          },
        };

        const result = fileBlob
          ? await uploadEncryptedSend({
              fileBlob,
              key,
              baseIv,
              initialPartUrls,
              totalParts,
              refreshPartUrls,
              ...sharedCallbacks,
            })
          : await uploadStreamingZip({
              files,
              zipEntryNames: streamingZipEntryNames!,
              key,
              baseIv,
              initialPartUrls,
              totalParts,
              zipSize: streamingZipSize!,
              refreshPartUrls,
              ...sharedCallbacks,
            });

        parts = result.parts;
        chunkHashes = result.chunkHashes;

        // 7. Complete the upload with chunk manifest for integrity verification.
        setState("completing");
        const integrityManifest = await computeChunkManifest(chunkHashes, key);
        await completeRef.current({
          sessionId: newSessionId,
          parts,
          uploadSecret,
          chunkManifest: integrityManifest,
          chunkHashes: chunkHashes.join(':'),
        });

        // 8. Build share URL + persist to localStorage
        const baseUrl = window.location.origin;
        const url = `${baseUrl}/send/${newSessionId}#key=${fragment}`;
        setShareUrl(url);
        setState("done");

        // Clean up resume state
        sessionStorage.removeItem(getResumeKey(newSessionId));
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

        // Stale resume state for a session that was created but never
        // completed would trap the user on a "Resume available" button that
        // always fails. Clear it before surfacing the error.
        if (activeSessionId) {
          try {
            sessionStorage.removeItem(getResumeKey(activeSessionId));
          } catch {
            /* storage unavailable — not worth failing the error path over */
          }
        }
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

  const resumeSession = useCallback(async () => {
    const resumeState = findResumeState();
    if (!resumeState) {
      setError("No resumable session found");
      setState("error");
      return;
    }

    // Clear the resume state — user chose not to resume or it failed
    setResumeAvailable(false);
    sessionStorage.removeItem(getResumeKey(resumeState.sessionId));

    // Note: Resume requires re-upload since we can't re-encrypt without the file.
    // The sessionStorage only stores metadata, not the file blob.
    // Show a message guiding the user to re-send.
    setError("Resume is not available — please re-send the file. Your previous upload session has expired.");
    setState("error");
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
    sessionId,
    send,
    updateSession,
    resumeSession,
    reset,
  };
}
