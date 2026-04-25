/**
 * SendPage - Orchestrator for anonymous encrypted file sharing.
 * Single-screen tool: all states (idle → active → done) render within one centered card.
 * Informational sections (How It Works, FAQ) sit below the fold.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { easings } from "@stenvault/shared/lib/motion";
import { usePublicSend, type SendConfig } from "@/hooks/usePublicSend";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTurnstile } from "@/hooks/useTurnstile";
import { trpc } from "@/lib/trpc";
import {
  formatBytes,
  SEND_EXPIRY_PRESETS,
  SEND_EXPIRY_ANON_MAX_HOURS,
  SEND_FILE_SIZE_TIERS,
} from "@stenvault/shared";
import { readDroppedEntries } from "@/lib/directoryReader";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { GradientMesh } from "@/components/ui/GradientMesh";
import { toast } from "@stenvault/shared/lib/toast";
import { Shield, Lock, Clock, Server, Crown, Bell } from "lucide-react";
import { getHistory, addToHistory, removeFromHistory, clearHistory } from "@stenvault/send/client";

import { EXPIRY_OPTIONS_ANON, EXPIRY_OPTIONS_AUTH } from "./send/constants";
import { formatSize } from "./send/utils";
import {
  SEND_RING_SIZE_MOBILE,
  SEND_RING_SIZE_DESKTOP,
  SEND_RIPPLE_TOP_MOBILE,
  SEND_RIPPLE_TOP_DESKTOP,
} from "./send/sendLayout";
import { useIsMobile } from "@/hooks/useMobile";
import { SendOptionsPanel } from "./send/SendOptionsPanel";
import { SendPasswordInput } from "./send/SendPasswordInput";
import { SendHistoryCards } from "./send/SendHistoryCards";
import { SendDropzone } from "./send/SendDropzone";
import { SendActiveView } from "./send/SendActiveView";
import { SendDoneView } from "./send/SendDoneView";
import { SendResumeBanner } from "./send/SendResumeBanner";
import { HowItWorksSection } from "./send/HowItWorksSection";
import { FAQSection } from "./send/FAQSection";

const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.25 },
};

export default function SendPage() {
  const {
    state, progress, shareUrl, error, speed, eta,
    resumeRecord, sessionId, send, updateSession,
    resumeSession, dismissResume, reset,
  } = usePublicSend();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { containerRef: turnstileRef, getToken: getTurnstileToken } = useTurnstile(
    import.meta.env.VITE_TURNSTILE_SITE_KEY,
  );

  // File state
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
  }, []);

  // Send history (localStorage)
  const [history, setHistory] = useState(() => getHistory());

  // Config
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [notifyOnDownload, setNotifyOnDownload] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [showSuccessRipple, setShowSuccessRipple] = useState(false);
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();

  // Password handlers
  const handleProtect = useCallback(async (password: string) => {
    await updateSession({ password });
    setIsPasswordProtected(true);
  }, [updateSession]);

  const handleRemovePassword = useCallback(async () => {
    await updateSession({ password: null });
    setIsPasswordProtected(false);
  }, [updateSession]);

  // Saved indicators for live option updates
  const [savedField, setSavedField] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = useCallback((field: string) => {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 1500);
  }, []);

  useEffect(() => {
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); };
  }, []);

  // Live option update handlers
  const handleExpiryChange = useCallback(async (hours: number) => {
    if (hours === expiresInHours) return;
    setExpiresInHours(hours);
    if (!sessionId) return;
    try {
      await updateSession({ expiresInHours: hours });
      showSaved("expiry");
    } catch {
      toast.error("Failed to update expiry");
    }
  }, [sessionId, expiresInHours, updateSession, showSaved]);

  const debouncedMaxDownloads = useDebounce(maxDownloads, 300);
  const isInitialMaxDownloads = useRef(true);

  useEffect(() => {
    if (isInitialMaxDownloads.current) {
      isInitialMaxDownloads.current = false;
      return;
    }
    if (!sessionId || debouncedMaxDownloads === "") return;
    const val = parseInt(debouncedMaxDownloads, 10);
    if (isNaN(val) || val < 1) return;
    updateSession({ maxDownloads: val })
      .then(() => showSaved("downloads"))
      .catch(() => toast.error("Failed to update download limit"));
  }, [debouncedMaxDownloads, sessionId, updateSession, showSaved]);

  // Reply chain tracking
  const replyToSessionId = new URLSearchParams(window.location.search).get("reply") || undefined;

  // Plan-aware limits
  const { data: subscription } = trpc.stripe.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60000,
  });
  const planMaxFileSize = subscription?.features?.publicSendMaxFileSize;
  const planMaxExpiryHours = subscription?.features?.publicSendMaxExpiryHours
    ?? SEND_EXPIRY_ANON_MAX_HOURS;

  const maxSize = isAuthenticated && planMaxFileSize
    ? formatBytes(planMaxFileSize, 0)
    : isAuthenticated
      ? SEND_FILE_SIZE_TIERS.FREE.label
      : SEND_FILE_SIZE_TIERS.ANON.label;

  const expiryOptions = useMemo(() => {
    const base = isAuthenticated ? EXPIRY_OPTIONS_AUTH : EXPIRY_OPTIONS_ANON;
    if (!isAuthenticated || planMaxExpiryHours === -1) return base;
    return base.filter((opt) => opt.value <= planMaxExpiryHours);
  }, [isAuthenticated, planMaxExpiryHours]);

  const maxExpiryLabel = useMemo(() => {
    if (!isAuthenticated) return SEND_EXPIRY_PRESETS.SEVEN_DAYS.label;
    if (planMaxExpiryHours === -1) return SEND_EXPIRY_PRESETS.THIRTY_DAYS.label;
    const last = expiryOptions[expiryOptions.length - 1];
    return last?.label ?? SEND_EXPIRY_PRESETS.ONE_DAY.label;
  }, [isAuthenticated, planMaxExpiryHours, expiryOptions]);

  useEffect(() => {
    if (planMaxExpiryHours !== -1 && expiresInHours > planMaxExpiryHours) {
      const maxAllowed = expiryOptions[expiryOptions.length - 1]?.value ?? 24;
      setExpiresInHours(maxAllowed);
    }
  }, [planMaxExpiryHours, expiryOptions, expiresInHours]);

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = await readDroppedEntries(e.dataTransfer);
    if (dropped.length > 0) setFiles(dropped);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setFiles(Array.from(fileList));
  }, []);

  // Upload-first: auto-start send when files are selected
  const filesRef = useRef<File[]>([]);
  filesRef.current = files;
  useEffect(() => {
    if (files.length === 0 || state !== "idle") {
      return;
    }
    const autoSend = async () => {
      const turnstileToken = await getTurnstileToken();
      if (!isAuthenticated && !turnstileToken) {
        toast.error("Security check couldn't complete. Please refresh the page and try again.");
        return;
      }
      const config: SendConfig = {
        expiresInHours,
        turnstileToken,
        notifyOnDownload: isAuthenticated ? notifyOnDownload : undefined,
        replyToSessionId,
      };
      await send(filesRef.current, config);
    };
    autoSend();
  }, [files, state, send, getTurnstileToken, isAuthenticated, expiresInHours, notifyOnDownload, replyToSessionId]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Encrypted file via StenVault Send", url: shareUrl });
      } catch { /* User cancelled or not supported */ }
    } else {
      handleCopy();
    }
  }, [shareUrl, handleCopy]);

  const handleReset = useCallback(() => {
    reset();
    setFiles([]);
    setExpiresInHours(24);
    setMaxDownloads("");
    setCopied(false);
    setShowQR(false);
    setNotifyOnDownload(false);
    setIsPasswordProtected(false);
    setShowSuccessRipple(false);
  }, [reset]);

  const isActive = state === "encrypting" || state === "uploading" || state === "completing";
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const fileDisplayName = files.length === 0 ? "" : files.length === 1 ? files[0]!.name : `${files.length} files`;
  const fileDisplaySize = files.length > 0 ? formatSize(totalSize) : "";

  // Save to history on upload completion + trigger success ripple
  const prevStateRef = useRef(state);
  useEffect(() => {
    const wasDone = prevStateRef.current !== "done" && state === "done";
    prevStateRef.current = state;
    if (!wasDone) return;

    if (!reducedMotion) {
      setShowSuccessRipple(true);
    }

    if (!shareUrl || !sessionId) return;
    addToHistory({
      sessionId,
      fileName: fileDisplayName || "Encrypted file",
      fileSize: totalSize,
      shareUrl: shareUrl!,
      expiresAt: new Date(Date.now() + expiresInHours * 3_600_000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    setHistory(getHistory());
  }, [state, shareUrl, sessionId, fileDisplayName, totalSize, expiresInHours, reducedMotion]);

  // History handlers
  const handleHistoryDismiss = useCallback((id: string) => {
    removeFromHistory(id);
    setHistory(getHistory());
  }, []);

  const handleHistoryCopy = useCallback(async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  }, []);

  // Auto-migrate anonymous history to backend on first authenticated page load
  const migrateMutation = trpc.publicSend.migrateAnonSendHistory.useMutation();
  const migrateRef = useRef(migrateMutation.mutateAsync);
  migrateRef.current = migrateMutation.mutateAsync;
  useEffect(() => {
    if (!isAuthenticated || history.length === 0) return;
    const migrationKey = "stenvault:send:history:migrated";
    try { if (localStorage.getItem(migrationKey)) return; } catch { return; }

    const entries = history.map((h) => ({ sessionId: h.sessionId }));
    migrateRef.current({ entries })
      .then(() => {
        try { localStorage.setItem(migrationKey, "1"); } catch { /* best effort */ }
        clearHistory();
        setHistory([]);
      })
      .catch((err: any) => { console.warn("[Send] History migration failed:", err?.message); });
  }, [isAuthenticated]);

  // Options panel (used in active + done states only)
  const optionsPanel = (
    <SendOptionsPanel
      expiresInHours={expiresInHours}
      onExpiryChange={handleExpiryChange}
      expiryOptions={expiryOptions}
      maxDownloads={maxDownloads}
      onMaxDownloadsChange={setMaxDownloads}
      savedField={savedField}
      passwordSlot={
        <SendPasswordInput
          onProtect={handleProtect}
          onRemove={handleRemovePassword}
          isProtected={isPasswordProtected}
          disabled={!sessionId}
        />
      }
      notifySlot={
        isAuthenticated ? (
          <button
            type="button"
            onClick={() => setNotifyOnDownload(!notifyOnDownload)}
            className="flex items-center justify-between w-full py-2 cursor-pointer group"
          >
            <span
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: LANDING_COLORS.textSecondary }}
            >
              <Bell className="w-4 h-4" />
              Notify me on first download
            </span>
            <div
              className="relative w-10 h-[22px] rounded-full transition-colors duration-200"
              style={{
                backgroundColor: notifyOnDownload
                  ? LANDING_COLORS.accent
                  : `${LANDING_COLORS.textMuted}40`,
              }}
            >
              <div
                className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{
                  transform: notifyOnDownload ? "translateX(22px)" : "translateX(3px)",
                }}
              />
            </div>
          </button>
        ) : undefined
      }
    />
  );

  return (
    <div style={{ backgroundColor: LANDING_COLORS.bg }}>
      <meta name="referrer" content="no-referrer" />

      {/* Main card — centered in viewport */}
      <section className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center py-6 overflow-hidden">
        <GradientMesh variant="subtle" />

        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 relative z-10">
          <div
            className="rounded-2xl border overflow-hidden backdrop-blur-xl flex flex-col"
            style={{
              backgroundColor: `${LANDING_COLORS.surface}B3`,
              borderColor: LANDING_COLORS.border,
            }}
          >
            <div className="relative p-6 sm:p-8">
              {/* Turnstile container */}
              <div ref={turnstileRef} className="absolute opacity-0 pointer-events-none overflow-hidden" />

              {showSuccessRipple && (
                <motion.div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none z-20"
                  style={{
                    top: isMobile ? SEND_RIPPLE_TOP_MOBILE : SEND_RIPPLE_TOP_DESKTOP,
                    width: isMobile ? SEND_RING_SIZE_MOBILE : SEND_RING_SIZE_DESKTOP,
                    height: isMobile ? SEND_RING_SIZE_MOBILE : SEND_RING_SIZE_DESKTOP,
                    border: `2px solid ${LANDING_COLORS.success}`,
                  }}
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 0.6, ease: easings.vaultEnter }}
                  onAnimationComplete={() => setShowSuccessRipple(false)}
                />
              )}

              {/* Resume banner */}
              {resumeRecord && state === "idle" && (
                <SendResumeBanner
                  record={resumeRecord}
                  onResume={resumeSession}
                  onDismiss={dismissResume}
                />
              )}

              {/* Auth-aware tier badge */}
              {isAuthenticated && state === "idle" && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4"
                  style={{
                    backgroundColor: `${LANDING_COLORS.accent}08`,
                    border: `1px solid ${LANDING_COLORS.accent}20`,
                  }}
                >
                  <Crown className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-medium text-violet-300">
                    Signed in — {maxSize} limit, up to {maxExpiryLabel}
                  </span>
                </div>
              )}

              {/* State views with crossfade transition */}
              <AnimatePresence mode="wait">
                {(state === "idle" || state === "error") && (
                  <motion.div key="idle" {...FADE}>
                    <SendDropzone
                      files={files}
                      isDragging={isDragging}
                      error={error}
                      state={state}
                      maxSize={maxSize}
                      fileDisplayName={fileDisplayName}
                      fileDisplaySize={fileDisplaySize}
                      fileInputRef={fileInputRef}
                      folderInputRef={folderInputRef}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onFileSelect={handleFileSelect}
                      replyToSessionId={replyToSessionId}
                      historySlot={
                        history.length > 0 ? (
                          <SendHistoryCards
                            history={history}
                            onDismiss={handleHistoryDismiss}
                            onCopy={handleHistoryCopy}
                          />
                        ) : null
                      }
                    />
                  </motion.div>
                )}

                {isActive && (
                  <motion.div key="active" {...FADE}>
                    <SendActiveView
                      state={state}
                      progress={progress}
                      speed={speed}
                      eta={eta}
                      fileDisplayName={fileDisplayName}
                      fileDisplaySize={fileDisplaySize}
                    />
                  </motion.div>
                )}

                {state === "done" && shareUrl && (
                  <motion.div key="done" {...FADE}>
                    <SendDoneView
                      shareUrl={shareUrl}
                      fileCount={files.length}
                      copied={copied}
                      showQR={showQR}
                      expiresInHours={expiresInHours}
                      maxDownloads={maxDownloads}
                      isPasswordProtected={isPasswordProtected}
                      isAuthenticated={isAuthenticated}
                      optionsPanel={optionsPanel}
                      onCopy={handleCopy}
                      onShare={handleShare}
                      onToggleQR={() => setShowQR(!showQR)}
                      onReset={handleReset}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Trust signals footer */}
            <div
              className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-3.5 border-t"
              style={{ borderColor: LANDING_COLORS.border }}
            >
              {[
                { icon: Shield, label: "Zero-knowledge" },
                { icon: Lock, label: "AES-256-GCM" },
                { icon: Clock, label: "Auto-delete" },
                { icon: Server, label: "EU servers" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 text-[10px] sm:text-xs font-medium"
                  style={{ color: LANDING_COLORS.textMuted }}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <HowItWorksSection />
      <FAQSection />
    </div>
  );
}
