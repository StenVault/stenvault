/**
 * ReceivePage - Premium Encrypted File Download (Receiver)
 *
 * Matches the dark obsidian theme of SendPage.
 * Extracts #key= from URL fragment, fetches preview, decrypts, downloads.
 */
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { GradientMesh } from "@/components/ui/GradientMesh";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { EncryptionRing } from "@/components/ui/EncryptionRing";
import { Lock, AlertCircle, Link2, Server } from "lucide-react";

import { useReceivePage } from "./receive/useReceivePage";
import { ReceiveNav } from "./receive/ReceiveNav";
import { ReceiveFooter } from "./receive/ReceiveFooter";
import { PreviewState } from "./receive/PreviewState";
import { PasswordState } from "./receive/PasswordState";
import { DownloadingState } from "./receive/DownloadingState";
import { DoneState } from "./receive/DoneState";
import { ReportAbuseSection } from "./receive/ReportAbuseSection";
import { ViralCTAs } from "./receive/ViralCTAs";

export default function ReceivePage() {
  const state = useReceivePage();

  return (
    <div className="min-h-screen" style={{ backgroundColor: LANDING_COLORS.bg }}>
      <ReceiveNav isScrolled={state.isScrolled} />

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 overflow-hidden">
        <GradientMesh variant="default" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-md mx-auto">
            {/* Trust Badge */}
            <div className="flex justify-center mb-6">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-sm"
                style={{ borderColor: `${LANDING_COLORS.success}30`, backgroundColor: `${LANDING_COLORS.success}08` }}
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">End-to-end encrypted</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>

            <h1
              className="text-2xl sm:text-3xl font-normal text-center tracking-tight leading-[1.1] mb-2"
              style={{ color: LANDING_COLORS.textPrimary }}
            >
              Encrypted File
            </h1>
            <p className="text-sm text-center mb-8" style={{ color: LANDING_COLORS.textSecondary }}>
              Only you and the sender can see this file
            </p>

            {/* ═══════════ CARD ═══════════ */}
            <div
              className="rounded-2xl border overflow-hidden backdrop-blur-xl"
              style={{ backgroundColor: `${LANDING_COLORS.surface}B3`, borderColor: LANDING_COLORS.border }}
            >
              <div className="p-6 sm:p-8">
                {/* ── LOADING ── */}
                {state.pageState === "loading" && (
                  <div className="flex flex-col items-center gap-4 py-12">
                    <EncryptionRing progress={0} state="connecting" size={56} />
                    <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>Loading file info...</p>
                  </div>
                )}

                {/* ── MISSING KEY ── */}
                {state.pageState === "missing_key" && (
                  <div className="space-y-6 py-4">
                    <div className="text-center space-y-3">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                        style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
                      >
                        <Lock className="w-8 h-8 text-violet-400" />
                      </div>
                      <p className="font-semibold text-lg" style={{ color: LANDING_COLORS.textPrimary }}>
                        Missing decryption key
                      </p>
                      <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
                        Paste the full link or the key fragment below
                      </p>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Paste full link or key fragment"
                        value={state.keyInput}
                        onChange={(e) => state.setKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && state.keyInput.trim()) {
                            const val = state.keyInput.trim();
                            const keyMatch = val.match(/#key=(.+)$/);
                            state.retryWithKey(keyMatch?.[1] ?? val);
                          }
                        }}
                        className="w-full h-10 rounded-lg border px-3 text-sm outline-none transition-colors focus:ring-1"
                        style={{ backgroundColor: LANDING_COLORS.bg, borderColor: LANDING_COLORS.border, color: LANDING_COLORS.textPrimary }}
                      />
                      <MagneticButton
                        size="lg"
                        variant="primary"
                        className="w-full"
                        disabled={!state.keyInput.trim()}
                        onClick={() => {
                          const val = state.keyInput.trim();
                          const keyMatch = val.match(/#key=(.+)$/);
                          state.retryWithKey(keyMatch?.[1] ?? val);
                        }}
                      >
                        <Lock className="w-5 h-5" />
                        Decrypt
                      </MagneticButton>
                    </div>
                  </div>
                )}

                {/* ── PREVIEW ── */}
                {state.pageState === "preview" && state.previewData && (
                  <PreviewState
                    previewData={state.previewData}
                    fileName={state.fileName}
                    thumbnailUrl={state.thumbnailUrl}
                    snippetText={state.snippetText}
                    thumbnailFailed={state.thumbnailFailed}
                    isBundle={state.isBundle}
                    manifest={state.manifest}
                    timeRemaining={state.timeRemaining}
                    isExpiringSoon={state.isExpiringSoon}
                    isExpiringSoonUrgent={state.isExpiringSoonUrgent}
                    isAuthenticated={state.isAuthenticated}
                    handleDownload={state.handleDownload}
                    handleDownloadFile={state.handleDownloadFile}
                    handleDownloadAll={state.handleDownloadAll}
                  />
                )}

                {/* ── PASSWORD ── */}
                {state.pageState === "password" && (
                  <PasswordState
                    fileName={state.fileName}
                    fileSize={state.previewData?.totalBytes}
                    thumbnailUrl={state.thumbnailUrl}
                    thumbnailFailed={state.thumbnailFailed}
                    isBundle={state.isBundle}
                    error={state.error}
                    setError={state.setError}
                    password={state.password}
                    setPassword={state.setPassword}
                    showPassword={state.showPassword}
                    setShowPassword={state.setShowPassword}
                    handleDownload={state.handleDownload}
                    verifyPassword={state.verifyPassword}
                    verifying={state.verifying}
                    rateLimitedUntil={state.rateLimitedUntil}
                  />
                )}

                {/* ── DOWNLOADING / DECRYPTING ── */}
                {state.isProcessing && (
                  <DownloadingState
                    progress={state.progress}
                    downloadSpeed={state.downloadSpeed}
                    downloadEta={state.downloadEta}
                    abortControllerRef={state.abortControllerRef}
                    currentFileDone={state.currentFileDone}
                    currentDownloadName={state.currentDownloadName}
                    totalFiles={state.manifest?.length ?? null}
                    downloadStatus={state.downloadStatus}
                    statusHint={state.statusHint}
                  />
                )}

                {/* ── DONE ── */}
                {state.pageState === "done" && (
                  <DoneState
                    fileName={state.fileName}
                    fileType={state.fileType}
                    isAuthenticated={state.isAuthenticated}
                    decryptedBlobRef={state.decryptedBlobRef}
                    canSave={state.canSave}
                    saveState={state.saveState}
                    saveToVault={state.saveToVault}
                    saveProgress={state.saveProgress}
                    saveError={state.saveError}
                    resetSave={state.resetSave}
                    handleDownload={state.handleDownload}
                  />
                )}

                {/* ── ERROR ── */}
                {state.pageState === "error" && (
                  <div className="space-y-4 py-8">
                    <div className="text-center space-y-3">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                        style={{ backgroundColor: `${LANDING_COLORS.danger}15` }}
                      >
                        <AlertCircle className="w-8 h-8" style={{ color: LANDING_COLORS.danger }} />
                      </div>
                      <p className="font-semibold text-lg" style={{ color: LANDING_COLORS.textPrimary }}>
                        Unable to access file
                      </p>
                      <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
                        {state.error}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── REPORT ABUSE ── */}
                <ReportAbuseSection
                  pageState={state.pageState}
                  showReportModal={state.showReportModal}
                  setShowReportModal={state.setShowReportModal}
                  reportReason={state.reportReason}
                  setReportReason={state.setReportReason}
                  reportDetails={state.reportDetails}
                  setReportDetails={state.setReportDetails}
                  reportSubmitted={state.reportSubmitted}
                  handleReportAbuse={state.handleReportAbuse}
                  isReporting={state.reportMutation.isPending}
                />
              </div>
            </div>

            {/* ═══════════ VIRAL CTAs ═══════════ */}
            {state.pageState !== "loading" && (
              <ViralCTAs sessionId={state.sessionId} isAuthenticated={state.isAuthenticated} />
            )}

            {/* ═══════════ HOW IT WORKS ═══════════ */}
            {state.pageState !== "loading" && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: Lock, label: "Encrypted in your browser" },
                  { icon: Link2, label: "Key never leaves the URL" },
                  { icon: Server, label: "Server sees only bytes" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                    style={{ backgroundColor: `${LANDING_COLORS.surface}80` }}
                  >
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
                    >
                      <Icon className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                    <span className="text-xs font-medium" style={{ color: LANDING_COLORS.textMuted }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <ReceiveFooter />
    </div>
  );
}
