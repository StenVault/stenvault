import { LANDING_COLORS } from "@/components/landing-v3/constants";
import { MagneticButton } from "@/components/landing-v3/components/MagneticButton";
import { formatBytes } from "@stenvault/shared";
import {
  X,
  FileIcon,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { EncryptionRing } from "@/components/ui/EncryptionRing";
import { ShimmerBar } from "@/components/ui/ShimmerBar";
import type { UseLocalTransferReturn } from "@/hooks/useLocalTransfer";
import { formatSpeed, formatEta } from "./utils";

export interface TransferProgressDisplayProps {
  transfer: UseLocalTransferReturn;
  role: "send" | "receive";
  showCancelConfirm?: boolean;
  setShowCancelConfirm?: (v: boolean) => void;
}

/**
 * Transfer progress display (shared by sender and receiver).
 * Shows current file indicator for multi-file transfers.
 */
export function TransferProgressDisplay({
  transfer,
  role,
  showCancelConfirm,
  setShowCancelConfirm,
}: TransferProgressDisplayProps) {
  const { state, progress, verificationCode, error } = transfer;
  const isMultiFile = progress.totalFiles > 1;

  return (
    <div>
      {/* Status */}
      <div className="flex items-center gap-3 mb-5">
        <div className="shrink-0">
          <EncryptionRing
            progress={state === "completed" ? 100 : progress.percent}
            state={state}
            size={44}
            strokeWidth={2.5}
          />
        </div>
        <div>
          <p className="font-semibold text-sm" style={{ color: LANDING_COLORS.textPrimary }}>
            {state === "requesting" && "Requesting..."}
            {state === "waiting_accept" && "Waiting for acceptance..."}
            {state === "connecting" && "Establishing connection..."}
            {state === "transferring" && (role === "send" ? "Sending..." : "Receiving...")}
            {state === "completed" && "Transfer complete!"}
            {state === "error" && "Transfer failed"}
          </p>
          {error && (
            <p className="text-xs text-red-400 mt-0.5">{error}</p>
          )}
        </div>
      </div>

      {/* Multi-file current file indicator */}
      {isMultiFile && state === "transferring" && progress.currentFileName && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl mb-4"
          style={{ backgroundColor: `${LANDING_COLORS.bg}60` }}
        >
          <FileIcon className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs truncate flex-1" style={{ color: LANDING_COLORS.textPrimary }}>
            {progress.currentFileName}
          </span>
          <span
            className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${LANDING_COLORS.accent}15`,
              color: LANDING_COLORS.accent,
            }}
          >
            {progress.currentFileIndex + 1}/{progress.totalFiles}
          </span>
        </div>
      )}

      {/* Verification code */}
      {verificationCode && state !== "completed" && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl mb-5"
          style={{ backgroundColor: `${LANDING_COLORS.bg}60` }}
        >
          <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium" style={{ color: LANDING_COLORS.textMuted }}>
              Verify this code matches on both devices
            </span>
            <code className="font-mono text-base text-indigo-300 tracking-wider font-bold">
              {verificationCode}
            </code>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(state === "transferring" || state === "completed") && (
        <div className="space-y-2.5">
          <ShimmerBar
            progress={progress.percent}
            active={state === "transferring"}
            variant={state === "completed" ? "success" : "accent"}
          />
          <div
            className="flex items-center justify-between text-xs"
            style={{ color: LANDING_COLORS.textMuted }}
          >
            <span>{formatBytes(progress.bytesSent)} / {formatBytes(progress.totalBytes)}</span>
            <span className="font-medium">{progress.percent}%</span>
          </div>
          {state === "transferring" && (
            <div
              className="flex items-center justify-between text-xs"
              style={{ color: LANDING_COLORS.textMuted }}
            >
              <span>{formatSpeed(progress.speed)}</span>
              <span>ETA: {formatEta(progress.eta)}</span>
            </div>
          )}
        </div>
      )}

      {/* Cancel confirmation dialog */}
      {showCancelConfirm && (
        <div
          className="flex items-center gap-3 p-3.5 rounded-xl mt-4 border"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            borderColor: "rgba(239, 68, 68, 0.2)",
          }}
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs font-medium text-red-300 flex-1">
            Cancel transfer in progress?
          </p>
          <button
            onClick={() => {
              transfer.cancelTransfer();
              setShowCancelConfirm?.(false);
            }}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Yes, cancel
          </button>
          <button
            onClick={() => setShowCancelConfirm?.(false)}
            className="px-3 py-1 rounded-lg text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer"
            style={{ color: LANDING_COLORS.textMuted }}
          >
            No
          </button>
        </div>
      )}

      {/* Cancel button (during active states) */}
      {!showCancelConfirm &&
        (state === "requesting" ||
          state === "waiting_accept" ||
          state === "connecting" ||
          state === "transferring") && (
          <div className="mt-4">
            <button
              onClick={() => {
                if (state === "transferring") {
                  setShowCancelConfirm?.(true);
                } else {
                  transfer.cancelTransfer();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-white/5 cursor-pointer"
              style={{ color: LANDING_COLORS.textMuted }}
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        )}

      {/* Done / Error actions */}
      {(state === "completed" || state === "error") && (
        <div className="mt-5">
          <MagneticButton
            variant="secondary"
            size="sm"
            onClick={() => transfer.reset()}
          >
            {state === "completed"
              ? isMultiFile ? "Transfer more files" : "Transfer another file"
              : "Try again"}
          </MagneticButton>
        </div>
      )}
    </div>
  );
}
