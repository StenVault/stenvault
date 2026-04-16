import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  fragmentToKey,
  decryptMetadata,
  decryptPublicSendStream,
  decryptThumbnail,
  decryptSnippet,
} from "@/lib/publicSendCrypto";
import { streamDownloadToDisk } from "@/lib/platform/streamingDownload";
import { useSaveToVault } from "@/hooks/useSaveToVault";
import { devWarn } from "@/lib/debugLogger";
import type { PageState, ManifestEntry } from "./types";
import { getContextualError, SAVE_TO_VAULT_MAX_SIZE } from "./constants";

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
  const [showManifest, setShowManifest] = useState(false);
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
  const claimResultRef = useRef<any>(null);

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
        setFileName(meta.name);
        setFileType(meta.type);
        setIsBundle(meta.isBundle ?? false);
        setManifest(meta.manifest?.files ?? null);

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

  // Auto-verify password: claims download without transitioning to "downloading" UI.
  // On success, chains into handleDownload. On failure, shows inline error.
  const verifyPassword = useCallback(async (pwd: string) => {
    const key = keyRef.current;
    if (!key || !previewQuery.data || verifyingRef.current) return;
    if (rateLimitedUntilRef.current && Date.now() < rateLimitedUntilRef.current) return;

    setVerifying(true);
    setError(null);

    try {
      const claim = await claimRef.current({
        sessionId,
        password: pwd,
      });
      // Claim succeeded — store result so handleDownload reuses it (no double call)
      claimResultRef.current = claim;
      setPassword(pwd);
      setVerifying(false);
      handleDownloadRef.current();
    } catch (err: any) {
      setVerifying(false);
      const msg = err?.message || "";
      if (msg.includes("Incorrect password")) {
        setError("Incorrect password");
      } else if (msg.includes("Too many") || msg.includes("rate limit") || err?.data?.code === "TOO_MANY_REQUESTS") {
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
  }, [sessionId, previewQuery.data]);

  // Ref so verifyPassword can call handleDownload without circular deps
  const handleDownloadRef = useRef<() => void>(() => {});

  const handleDownload = useCallback(async () => {
    const key = keyRef.current;
    if (!key || !previewQuery.data) return;

    try {
      setPageState("downloading");
      setProgress(0);
      setDownloadSpeed(0);
      setDownloadEta(0);
      speedSamplesRef.current = [];

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Reuse claim from verifyPassword if available, otherwise fetch fresh
      const cached = claimResultRef.current;
      claimResultRef.current = null;
      const claim = cached ?? await claimRef.current({
        sessionId,
        ...(password ? { password } : {}),
      });

      const response = await fetch(claim.downloadUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      if (!response.body) throw new Error("Browser does not support streaming downloads");

      const { fileSize, totalParts, chunkSize, encryptionOverhead } = claim;

      const decryptedStream = decryptPublicSendStream(response.body, {
        key,
        fileSize,
        totalParts,
        chunkSize,
        encryptionOverhead,
        expectedChunkHashes: claim.chunkHashes,
        expectedManifest: claim.chunkManifest,
        chunkBaseIv: claim.chunkBaseIv,
        onProgress: (chunkIndex, total) => {
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

      // If authenticated and file is small enough, tee the stream to capture
      // the decrypted blob for "Save to Vault" without re-downloading
      const canCapture = isAuthenticated && fileSize <= SAVE_TO_VAULT_MAX_SIZE;

      if (canCapture) {
        const [streamForDisk, streamForVault] = decryptedStream.tee();
        const capturePromise = new Response(streamForVault).blob().then((b) => {
          decryptedBlobRef.current = b;
        });

        await streamDownloadToDisk(streamForDisk, {
          filename: fileName || "download",
          mimeType: fileType || "application/octet-stream",
          totalSize: fileSize,
        });
        await capturePromise;
      } else {
        decryptedBlobRef.current = null;
        await streamDownloadToDisk(decryptedStream, {
          filename: fileName || "download",
          mimeType: fileType || "application/octet-stream",
          totalSize: fileSize,
        });
      }

      setPageState("done");
    } catch (err: any) {
      const msg = err?.message || "Download failed";
      if (msg.includes("Incorrect password")) {
        setError("Incorrect password");
        setPageState("password");
      } else if (err?.name === "AbortError") {
        setPageState(previewQuery.data?.hasPassword ? "password" : "preview");
      } else {
        setError(getContextualError(msg));
        setPageState("error");
      }
    }
  }, [sessionId, password, previewQuery.data, fileName, fileType, isAuthenticated]);

  handleDownloadRef.current = handleDownload;

  const handleReportAbuse = useCallback(async () => {
    try {
      await reportRef.current({
        sessionId,
        reason: reportReason as any,
        details: reportDetails || undefined,
      });
      setReportSubmitted(true);
      reportTimerRef.current = setTimeout(() => {
        setShowReportModal(false);
        setReportSubmitted(false);
        setReportReason("malware");
        setReportDetails("");
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit report");
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

  const previewData = previewQuery.data;
  const isProcessing = pageState === "downloading" || pageState === "decrypting";

  return {
    // Page state
    pageState, error, setError,
    // File info
    fileName, fileType, thumbnailUrl, snippetText,
    isBundle, manifest, showManifest, setShowManifest, thumbnailFailed,
    // Key input (missing_key state)
    keyInput, setKeyInput, retryWithKey,
    // Password
    password, setPassword, showPassword, setShowPassword, verifyPassword, verifying, rateLimitedUntil,
    // Progress
    progress, downloadSpeed, downloadEta,
    // Countdown
    timeRemaining, isExpiringSoon, isExpiringSoonUrgent,
    // Handlers
    handleDownload, handleReportAbuse,
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
