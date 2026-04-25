import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "@stenvault/shared/lib/toast";
import {
  fragmentToKey,
  decryptMetadata,
  decryptThumbnail,
  decryptSnippet,
  decryptPublicSendStream,
  buildBundleZipStream,
  predictBundleZipSize,
  type BundleDownloadFile,
} from "@stenvault/send/client";
import { streamDownloadToDisk } from "@/lib/platform/streamingDownload";
import { useSaveToVault } from "@/hooks/useSaveToVault";
import { devWarn } from "@/lib/debugLogger";
import type { PageState, ManifestEntry } from "./types";
import { getContextualError, SAVE_TO_VAULT_MAX_SIZE } from "./constants";

/** Pending action stored while the receiver enters the bundle password.
 *  "all" → download-as-zip; a fileIndex → single-file download. */
type PendingAction = { kind: "all" } | { kind: "file"; fileIndex: number };

/** V2 claim payload shape the hook caches and re-uses across single-file
 *  and bundle downloads to avoid double-incrementing downloadCount. */
interface ClaimResult {
  downloadToken: string;
  chunkBaseIv: string;
  totalBytes: number;
  encryptionOverhead: number;
  files: Array<{
    fileIndex: number;
    fileSize: number;
    mimeType: string;
    totalParts: number;
    partSize: number;
    chunkHashes: string | null;
    chunkManifestHmac: string | null;
  }>;
}

export function useReceivePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId || "";
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const {
    saveToVault,
    state: saveState,
    progress: saveProgress,
    error: saveError,
    canSave,
    reset: resetSave,
  } = useSaveToVault();
  const decryptedBlobRef = useRef<Blob | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const metaDecryptedRef = useRef(false);

  const [pageState, setPageState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [snippetText, setSnippetText] = useState<string | null>(null);
  const [isBundle, setIsBundle] = useState(false);
  const [manifest, setManifest] = useState<ManifestEntry[] | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyRetrigger, setKeyRetrigger] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyingRef = useRef(false);
  verifyingRef.current = verifying;
  const rateLimitedUntilRef = useRef<number | null>(null);
  rateLimitedUntilRef.current = rateLimitedUntil;
  const keyRef = useRef<CryptoKey | null>(null);

  // Label of the file currently being piped through decrypt (useful when
  // the bundle "Download all" flow is running — lets the progress UI show
  // which entry is in flight).
  const [currentDownloadName, setCurrentDownloadName] = useState<string | null>(null);
  // 0-indexed count of files already fully zipped in the bundle flow —
  // drives the "File N of M" hint. Stays null on single-file downloads.
  const [currentFileDone, setCurrentFileDone] = useState<number | null>(null);

  // Observer state for the "download is alive, just waiting" pulse. Updated
  // by a tick that compares `Date.now()` with the last progress timestamp.
  // Never gates the download pipeline — pure UI feedback.
  const [downloadStatus, setDownloadStatus] = useState<"active" | "stagnant" | "finalizing">("active");
  const lastProgressAtRef = useRef<number>(Date.now());

  // Countdown timer
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [isExpiringSoonUrgent, setIsExpiringSoonUrgent] = useState(false);

  // Download speed tracking
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadEta, setDownloadEta] = useState(0);
  const speedSamplesRef = useRef<Array<{ bytes: number; time: number }>>([]);

  // Report abuse state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("malware");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const reportMutation = trpc.publicSend.reportAbuse.useMutation();

  // Stable refs — useMutation returns new objects each render (Golden Rule 3)
  const reportRef = useRef(reportMutation.mutateAsync);
  reportRef.current = reportMutation.mutateAsync;

  // Scroll state for nav
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch preview
  const previewQuery = trpc.publicSend.getPreview.useQuery(
    { sessionId },
    { enabled: !!sessionId, retry: false },
  );

  const claimMutation = trpc.publicSend.claimDownload.useMutation();
  const claimRef = useRef(claimMutation.mutateAsync);
  claimRef.current = claimMutation.mutateAsync;

  const getFileUrlMutation = trpc.publicSend.getFileDownloadUrl.useMutation();
  const getFileUrlRef = useRef(getFileUrlMutation.mutateAsync);
  getFileUrlRef.current = getFileUrlMutation.mutateAsync;

  // Cached claim result — reused across per-file fetches + "Download all"
  // so we don't increment downloadCount twice in one sitting. Invalidated
  // on error or when the receiver navigates away.
  const claimResultRef = useRef<ClaimResult | null>(null);

  // Action queued while the password modal is showing. Runs after verify.
  const pendingActionRef = useRef<PendingAction | null>(null);

  // Extract key from fragment and decrypt metadata + thumbnail/snippet.
  // Guarded by metaDecryptedRef so that React Query background refetches
  // (e.g. refetchOnWindowFocus on mobile) don't reset pageState mid-download.
  useEffect(() => {
    if (!previewQuery.data) return;
    if (metaDecryptedRef.current) return;

    const fragment = window.location.hash.replace(/^#key=/, "");
    if (!fragment || fragment === window.location.hash) {
      setPageState("missing_key");
      return;
    }

    (async () => {
      try {
        const key = await fragmentToKey(fragment);
        keyRef.current = key;

        const meta = await decryptMetadata(
          previewQuery.data.encryptedMeta,
          previewQuery.data.metaIv,
          key,
        );
        // V2 BundleManifest: files[] in fileIndex order. Single-file
        // bundles skip BundleFileList and reuse the single-file UI; multi-file
        // renders the per-file picker + "Download all as ZIP" CTA.
        const first = meta.files[0];
        setFileName(
          meta.files.length > 1
            ? `${meta.files.length} files`
            : (first?.name ?? "file"),
        );
        setFileType(first?.type ?? "application/octet-stream");
        setIsBundle(meta.files.length > 1);
        setManifest(
          meta.files.map((f) => ({
            fileIndex: f.fileIndex,
            name: f.name,
            size: f.size,
            type: f.type,
          })),
        );

        // Decrypt thumbnail (best-effort)
        if (previewQuery.data.encryptedThumbnail && previewQuery.data.thumbnailIv) {
          try {
            const blob = await decryptThumbnail(
              previewQuery.data.encryptedThumbnail,
              previewQuery.data.thumbnailIv,
              key,
            );
            setThumbnailUrl(URL.createObjectURL(blob));
          } catch (err) {
            devWarn('[ReceivePage] Thumbnail decryption failed:', err);
            setThumbnailFailed(true);
          }
        }

        // Decrypt snippet (best-effort)
        if (previewQuery.data.encryptedSnippet && previewQuery.data.snippetIv) {
          try {
            const text = await decryptSnippet(
              previewQuery.data.encryptedSnippet,
              previewQuery.data.snippetIv,
              key,
            );
            setSnippetText(text);
          } catch (err) {
            devWarn('[ReceivePage] Snippet decryption failed:', err);
          }
        }

        metaDecryptedRef.current = true;

        if (previewQuery.data.hasPassword) {
          setPageState("password");
        } else {
          setPageState("preview");
        }
      } catch {
        setError("This link appears damaged — ask the sender to share it again");
        setPageState("error");
      }
    })();
  }, [previewQuery.data, keyRetrigger]);

  // Cleanup thumbnail URL
  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);

  // Countdown timer
  useEffect(() => {
    const expiresAt = previewQuery.data?.expiresAt;
    if (!expiresAt) return;

    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeRemaining("Expired");
        setIsExpiringSoon(true);
        setIsExpiringSoonUrgent(true);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      if (days > 0) setTimeRemaining(`${days}d ${hours}h`);
      else if (hours > 0) setTimeRemaining(`${hours}h ${mins}m`);
      else if (mins > 0) setTimeRemaining(`${mins}m ${secs}s`);
      else setTimeRemaining(`${secs}s`);

      setIsExpiringSoon(diff < 86400000);
      setIsExpiringSoonUrgent(diff < 3600000);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [previewQuery.data?.expiresAt]);

  useEffect(() => {
    if (previewQuery.error) {
      setError(previewQuery.error.message);
      setPageState("error");
    }
  }, [previewQuery.error]);

  /** Mint a fresh presigned URL via `getFileDownloadUrl`. Gated by the
   *  downloadToken in the cached claim. */
  const mintFileUrl = useCallback(async (fileIndex: number): Promise<string> => {
    const claim = claimResultRef.current;
    if (!claim) throw new Error("Download session expired. Please try again.");
    const { downloadUrl } = await getFileUrlRef.current({
      sessionId,
      fileIndex,
      downloadToken: claim.downloadToken,
    });
    return downloadUrl;
  }, [sessionId]);

  /** Execute a single-file download. Assumes claim is cached. */
  const runSingleFileDownload = useCallback(async (fileIndex: number) => {
    const key = keyRef.current;
    const claim = claimResultRef.current;
    if (!key || !claim) return;

    const fileEntry = claim.files.find((f) => f.fileIndex === fileIndex);
    const manifestEntry = manifest?.find((m) => m.fileIndex === fileIndex);
    if (!fileEntry || !manifestEntry) {
      setError("File not found in session");
      setPageState("error");
      return;
    }

    setPageState("downloading");
    setProgress(0);
    setDownloadSpeed(0);
    setDownloadEta(0);
    setCurrentDownloadName(manifestEntry.name);
    setCurrentFileDone(null);
    lastProgressAtRef.current = Date.now();
    speedSamplesRef.current = [];

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const url = await mintFileUrl(fileIndex);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      if (!response.body) throw new Error("Browser does not support streaming downloads");

      const chunkSize = fileEntry.partSize;
      const encryptionOverhead = claim.encryptionOverhead;

      const decryptedStream = decryptPublicSendStream(response.body, {
        key,
        fileSize: fileEntry.fileSize,
        totalParts: fileEntry.totalParts,
        chunkSize,
        encryptionOverhead,
        fileIndex,
        expectedChunkHashes: fileEntry.chunkHashes,
        expectedManifest: fileEntry.chunkManifestHmac,
        chunkBaseIv: claim.chunkBaseIv,
        signal: controller.signal,
        onProgress: (chunkIndex, total) => {
          lastProgressAtRef.current = Date.now();
          setProgress(Math.round(((chunkIndex + 1) / total) * 100));
          const now = Date.now();
          const chunkBytes = chunkSize + encryptionOverhead;
          speedSamplesRef.current.push({ bytes: chunkBytes, time: now });
          if (speedSamplesRef.current.length > 5) speedSamplesRef.current.shift();
          const samples = speedSamplesRef.current;
          if (samples.length >= 2) {
            const first = samples[0]!;
            const last = samples[samples.length - 1]!;
            const elapsed = (last.time - first.time) / 1000;
            const totalBytes = samples.reduce((s, v) => s + v.bytes, 0);
            if (elapsed > 0) {
              const bps = totalBytes / elapsed;
              setDownloadSpeed(bps);
              const remaining = (total - chunkIndex - 1) * chunkBytes;
              setDownloadEta(remaining > 0 ? Math.ceil(remaining / bps) : 0);
            }
          }
        },
      });

      // Small, auth-owned single-file downloads tee the stream so the "Save
      // to Vault" path doesn't need to re-download. Skip for bundle entries
      // (the tee would interact badly with the zip pipeline).
      const canCapture =
        !isBundle &&
        isAuthenticated &&
        fileEntry.fileSize <= SAVE_TO_VAULT_MAX_SIZE;

      if (canCapture) {
        const [streamForDisk, streamForVault] = decryptedStream.tee();
        const capturePromise = new Response(streamForVault).blob().then((b) => {
          decryptedBlobRef.current = b;
        });

        await streamDownloadToDisk(streamForDisk, {
          filename: manifestEntry.name,
          mimeType: manifestEntry.type || "application/octet-stream",
          totalSize: fileEntry.fileSize,
        });
        await capturePromise;
      } else {
        decryptedBlobRef.current = null;
        await streamDownloadToDisk(decryptedStream, {
          filename: manifestEntry.name,
          mimeType: manifestEntry.type || "application/octet-stream",
          totalSize: fileEntry.fileSize,
        });
      }

      setPageState("done");
    } catch (err: unknown) {
      const errWithMeta = err as { name?: string; message?: string };
      if (errWithMeta?.name === "AbortError") {
        setPageState(previewQuery.data?.hasPassword ? "password" : "preview");
        return;
      }
      setError(getContextualError(errWithMeta?.message || "Download failed"));
      setPageState("error");
    }
  }, [isAuthenticated, isBundle, manifest, mintFileUrl, previewQuery.data?.hasPassword]);

  /** Execute a "download all as zip" flow. Assumes claim is cached. */
  const runBundleZipDownload = useCallback(async () => {
    const key = keyRef.current;
    const claim = claimResultRef.current;
    if (!key || !claim || !manifest) return;

    setPageState("downloading");
    setProgress(0);
    setDownloadSpeed(0);
    setDownloadEta(0);
    setCurrentDownloadName(null);
    setCurrentFileDone(null);
    lastProgressAtRef.current = Date.now();
    speedSamplesRef.current = [];

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const bundleFiles: BundleDownloadFile[] = claim.files.map((f) => {
      const entry = manifest.find((m) => m.fileIndex === f.fileIndex);
      return {
        fileIndex: f.fileIndex,
        name: entry?.name ?? `file-${f.fileIndex}`,
        size: f.fileSize,
        mimeType: entry?.type ?? f.mimeType,
        totalParts: f.totalParts,
        partSize: f.partSize,
        chunkHashes: f.chunkHashes,
        chunkManifestHmac: f.chunkManifestHmac,
      };
    });

    const totalBytes = bundleFiles.reduce((s, f) => s + f.size, 0);
    const bytesCompletedByFile = new Map<number, number>();
    let bytesDone = 0;

    try {
      const zipStream = buildBundleZipStream({
        key,
        chunkBaseIv: claim.chunkBaseIv,
        encryptionOverhead: claim.encryptionOverhead,
        files: bundleFiles,
        getFileUrl: mintFileUrl,
        signal: controller.signal,
        onFileStarted: (file, filesDone) => {
          setCurrentDownloadName(file.name);
          setCurrentFileDone(filesDone);
        },
        onFileChunkProgress: (file, chunkIndex, totalChunks) => {
          lastProgressAtRef.current = Date.now();
          const ratio = totalChunks > 0 ? (chunkIndex + 1) / totalChunks : 1;
          const fileBytes = Math.min(file.size, Math.round(file.size * ratio));
          const prior = bytesCompletedByFile.get(file.fileIndex) ?? 0;
          if (fileBytes <= prior) return;
          bytesDone += fileBytes - prior;
          bytesCompletedByFile.set(file.fileIndex, fileBytes);
          if (totalBytes > 0) {
            setProgress(Math.min(100, Math.round((bytesDone / totalBytes) * 100)));
          }
          // Speed sampling based on the delta bytes moved through this tick.
          const now = Date.now();
          speedSamplesRef.current.push({ bytes: fileBytes - prior, time: now });
          if (speedSamplesRef.current.length > 5) speedSamplesRef.current.shift();
          const samples = speedSamplesRef.current;
          if (samples.length >= 2) {
            const first = samples[0]!;
            const last = samples[samples.length - 1]!;
            const elapsed = (last.time - first.time) / 1000;
            const moved = samples.reduce((s, v) => s + v.bytes, 0);
            if (elapsed > 0) {
              const bps = moved / elapsed;
              setDownloadSpeed(bps);
              const remaining = totalBytes - bytesDone;
              setDownloadEta(remaining > 0 ? Math.ceil(remaining / bps) : 0);
            }
          }
        },
      });

      // Use the bundle session ID as the zip name. No plaintext bundle
      // name exists at upload time — files.length is the only reliable
      // cue — so "stenvault-bundle-<shortid>.zip" keeps it unambiguous.
      const shortId = sessionId.slice(0, 8);
      const zipFilename = `stenvault-bundle-${shortId}.zip`;

      // Bundle downloads can't populate "Save to Vault" — they'd need a
      // folder creation flow. Clear the ref so the Done screen stays
      // consistent with what actually landed on disk.
      decryptedBlobRef.current = null;

      // Exact ZIP size — includes per-file local headers, data descriptors,
      // central directory and EOCD. Using plaintext sum here truncates the
      // CD+EOCD (Firefox enforces Content-Length) → corrupt .zip.
      const zipTotalSize = predictBundleZipSize(
        bundleFiles.map((f) => ({ name: f.name, size: f.size })),
      );
      await streamDownloadToDisk(zipStream, {
        filename: zipFilename,
        mimeType: "application/zip",
        totalSize: zipTotalSize,
        signal: controller.signal,
      });

      setProgress(100);
      setPageState("done");
    } catch (err: unknown) {
      const errWithMeta = err as { name?: string; message?: string };
      if (errWithMeta?.name === "AbortError") {
        setPageState(previewQuery.data?.hasPassword ? "password" : "preview");
        return;
      }
      setError(getContextualError(errWithMeta?.message || "Download failed"));
      setPageState("error");
    }
  }, [manifest, mintFileUrl, previewQuery.data?.hasPassword, sessionId]);

  /** Entry point for both PreviewState and BundleFileList — claims once,
   *  then dispatches to per-file or bundle-zip flow. If a password is
   *  required, defers the action and transitions to the password state. */
  const requestDownload = useCallback(
    async (action: PendingAction, pwd?: string) => {
      const key = keyRef.current;
      if (!key || !previewQuery.data) return;

      // If we already have a live claim (e.g. the user clicked a second
      // file after the first finished), skip the claim round-trip.
      if (claimResultRef.current) {
        if (action.kind === "all") await runBundleZipDownload();
        else await runSingleFileDownload(action.fileIndex);
        return;
      }

      try {
        const claim: ClaimResult = await claimRef.current({
          sessionId,
          ...(pwd ? { password: pwd } : {}),
        });
        claimResultRef.current = claim;

        if (action.kind === "all") await runBundleZipDownload();
        else await runSingleFileDownload(action.fileIndex);
      } catch (err: unknown) {
        const errWithMeta = err as {
          message?: string;
          data?: { code?: string };
        };
        const msg = errWithMeta?.message || "";
        if (
          errWithMeta?.data?.code === "UNAUTHORIZED" ||
          msg.includes("Password required")
        ) {
          pendingActionRef.current = action;
          setPageState("password");
          return;
        }
        if (msg.includes("not found") || msg.includes("expired")) {
          setError("This file has expired or been deleted");
          setPageState("error");
          return;
        }
        setError(getContextualError(msg));
        setPageState("error");
      }
    },
    [previewQuery.data, runBundleZipDownload, runSingleFileDownload, sessionId],
  );

  // Auto-verify password: claims download without transitioning to "downloading" UI.
  // On success, chains into the pending action (single file or download-all).
  const verifyPassword = useCallback(
    async (pwd: string) => {
      const key = keyRef.current;
      if (!key || !previewQuery.data || verifyingRef.current) return;
      if (rateLimitedUntilRef.current && Date.now() < rateLimitedUntilRef.current) return;

      setVerifying(true);
      setError(null);

      try {
        const claim: ClaimResult = await claimRef.current({
          sessionId,
          password: pwd,
        });
        claimResultRef.current = claim;
        setPassword(pwd);
        setVerifying(false);

        // Default to "all" for bundles, first file for single-file — matches
        // what the preview button would have triggered.
        const fallback: PendingAction = isBundle
          ? { kind: "all" }
          : { kind: "file", fileIndex: 0 };
        const action = pendingActionRef.current ?? fallback;
        pendingActionRef.current = null;
        if (action.kind === "all") await runBundleZipDownload();
        else await runSingleFileDownload(action.fileIndex);
      } catch (err: unknown) {
        setVerifying(false);
        const errWithMeta = err as {
          message?: string;
          data?: { code?: string };
        };
        const msg = errWithMeta?.message || "";
        if (msg.includes("Incorrect password")) {
          setError("Incorrect password");
        } else if (
          msg.includes("Too many") ||
          msg.includes("rate limit") ||
          errWithMeta?.data?.code === "TOO_MANY_REQUESTS"
        ) {
          setRateLimitedUntil(Date.now() + 30_000);
          setError("Too many attempts. Try again in 30s.");
          if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
          rateLimitTimerRef.current = setTimeout(() => setRateLimitedUntil(null), 30_000);
        } else if (msg.includes("not found") || msg.includes("expired")) {
          setError("This file has expired or been deleted");
          setPageState("error");
        } else {
          setError(msg || "Verification failed");
        }
      }
    },
    [isBundle, previewQuery.data, runBundleZipDownload, runSingleFileDownload, sessionId],
  );

  /** "Main" download button — defers to bundle-zip for multi-file,
   *  single-file download for everything else. */
  const handleDownload = useCallback(() => {
    void requestDownload(isBundle ? { kind: "all" } : { kind: "file", fileIndex: 0 });
  }, [isBundle, requestDownload]);

  const handleDownloadFile = useCallback(
    (fileIndex: number) => {
      void requestDownload({ kind: "file", fileIndex });
    },
    [requestDownload],
  );

  const handleDownloadAll = useCallback(() => {
    void requestDownload({ kind: "all" });
  }, [requestDownload]);

  const handleReportAbuse = useCallback(async () => {
    try {
      await reportRef.current({
        sessionId,
        reason: reportReason as "malware" | "phishing" | "illegal_content" | "copyright" | "other",
        details: reportDetails || undefined,
      });
      setReportSubmitted(true);
      reportTimerRef.current = setTimeout(() => {
        setShowReportModal(false);
        setReportSubmitted(false);
        setReportReason("malware");
        setReportDetails("");
      }, 2000);
    } catch (err: unknown) {
      const errWithMeta = err as { message?: string };
      toast.error(errWithMeta?.message || "Failed to submit report");
    }
  }, [sessionId, reportReason, reportDetails]);

  /** Retry decryption with a manually-provided key fragment */
  const retryWithKey = useCallback((fragment: string) => {
    window.location.hash = `#key=${fragment}`;
    setPageState("loading");
    metaDecryptedRef.current = false;
    setKeyRetrigger((v) => v + 1);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    };
  }, []);

  // Publishes `downloadStatus` from the last-progress-timestamp ref. Runs
  // only while the download UI is up; never blocks the pipeline. Threshold
  // of 800ms tolerates normal drain-waits + client-zip inter-file gaps
  // without flickering, but catches the 1s+ stalls that feel frozen.
  useEffect(() => {
    const active = pageState === "downloading" || pageState === "decrypting";
    if (!active) {
      setDownloadStatus("active");
      return;
    }
    const id = setInterval(() => {
      if (progress >= 100) setDownloadStatus("finalizing");
      else if (Date.now() - lastProgressAtRef.current > 800) setDownloadStatus("stagnant");
      else setDownloadStatus("active");
    }, 250);
    return () => clearInterval(id);
  }, [pageState, progress]);

  const previewData = previewQuery.data;
  const isProcessing = pageState === "downloading" || pageState === "decrypting";

  // Contextual hint for the "stagnant" UI state. If we're between files in
  // a bundle, point at the next one; otherwise surface "writing to disk"
  // since the remaining wait is the browser flushing its internal buffer.
  const statusHint = useMemo(() => {
    if (downloadStatus === "finalizing") return "Writing to disk…";
    if (downloadStatus !== "stagnant") return undefined;
    if (
      isBundle &&
      currentFileDone !== null &&
      manifest &&
      currentFileDone + 1 < manifest.length
    ) {
      return `Preparing file ${currentFileDone + 2} of ${manifest.length}…`;
    }
    return "Writing to disk…";
  }, [downloadStatus, isBundle, currentFileDone, manifest]);

  return {
    // Page state
    pageState, error, setError,
    // File info
    fileName, fileType, thumbnailUrl, snippetText,
    isBundle, manifest, thumbnailFailed,
    currentDownloadName, currentFileDone, downloadStatus, statusHint,
    // Key input (missing_key state)
    keyInput, setKeyInput, retryWithKey,
    // Password
    password, setPassword, showPassword, setShowPassword, verifyPassword, verifying, rateLimitedUntil,
    // Progress
    progress, downloadSpeed, downloadEta,
    // Countdown
    timeRemaining, isExpiringSoon, isExpiringSoonUrgent,
    // Handlers
    handleDownload, handleDownloadFile, handleDownloadAll, handleReportAbuse,
    abortControllerRef,
    // Report abuse
    showReportModal, setShowReportModal, reportReason, setReportReason,
    reportDetails, setReportDetails, reportSubmitted, reportMutation,
    // Save to vault
    saveToVault, saveState, saveProgress, saveError, canSave, resetSave,
    decryptedBlobRef,
    // Auth & query
    isAuthenticated, previewData, isProcessing, sessionId,
    // Nav
    isScrolled,
  };
}

export type UseReceivePageReturn = ReturnType<typeof useReceivePage>;
