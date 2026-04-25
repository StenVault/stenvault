import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { EncryptionRing } from "@/components/ui/EncryptionRing";
import { ShimmerBar } from "@/components/ui/ShimmerBar";
import { formatSpeed, formatEta } from "@/pages/send/utils";
import type { RefObject } from "react";

interface DownloadingStateProps {
  progress: number;
  downloadSpeed: number;
  downloadEta: number;
  abortControllerRef: RefObject<AbortController | null>;
  /** When the bundle flow is running, the 0-indexed file count already zipped. */
  currentFileDone?: number | null;
  /** Name of the file currently streaming — rendered alongside the file counter. */
  currentDownloadName?: string | null;
  /** Total files in the bundle — omitted for single-file downloads. */
  totalFiles?: number | null;
  /** Pulse state driven by the last-progress-timestamp observer in the hook. */
  downloadStatus?: "active" | "stagnant" | "finalizing";
  /** Hint text shown when the pipeline is genuinely waiting (stagnant / finalizing). */
  statusHint?: string;
}

export function DownloadingState({
  progress,
  downloadSpeed,
  downloadEta,
  abortControllerRef,
  currentFileDone,
  currentDownloadName,
  totalFiles,
  downloadStatus = "active",
  statusHint,
}: DownloadingStateProps) {
  const showFileCounter =
    typeof currentFileDone === "number" && typeof totalFiles === "number" && totalFiles > 1;
  const pulsing = downloadStatus === "stagnant" || downloadStatus === "finalizing";

  return (
    <div className="space-y-8 py-6">
      <div className="text-center space-y-3">
        <div className="mx-auto w-fit">
          <EncryptionRing progress={progress} state="encrypting" size={64} />
        </div>
        <p className="font-semibold text-lg" style={{ color: LANDING_COLORS.textPrimary }}>
          Downloading & decrypting...
        </p>
        <p className="text-sm" style={{ color: LANDING_COLORS.textMuted }}>
          Decryption happens entirely in your browser
        </p>
      </div>

      <div className="space-y-2">
        <ShimmerBar progress={progress} />
        <p className="text-center text-sm font-medium" style={{ color: LANDING_COLORS.textSecondary }}>
          {progress}%
          {downloadSpeed > 0 && (
            <span className="ml-2 text-xs" style={{ color: LANDING_COLORS.textMuted }}>
              {formatSpeed(downloadSpeed)}
              {downloadEta > 0 && ` · ${formatEta(downloadEta)}`}
            </span>
          )}
        </p>
        {showFileCounter && currentDownloadName && (
          <p
            className="text-center text-xs truncate px-4"
            style={{ color: LANDING_COLORS.textMuted }}
            title={currentDownloadName}
          >
            File {currentFileDone! + 1} of {totalFiles} — {currentDownloadName}
          </p>
        )}
        {pulsing && statusHint && (
          <p
            className="text-center text-xs flex items-center justify-center gap-2 animate-pulse"
            style={{ color: LANDING_COLORS.textMuted }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: LANDING_COLORS.textMuted }}
            />
            {statusHint}
          </p>
        )}
      </div>

      <button
        onClick={() => abortControllerRef.current?.abort()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer"
        style={{
          borderColor: LANDING_COLORS.border,
          color: LANDING_COLORS.textSecondary,
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LANDING_COLORS.surface)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        Cancel
      </button>
    </div>
  );
}
