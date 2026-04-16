import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { formatBytes } from "@stenvault/shared";
import {
  Upload,
  ArrowRight,
  Loader2,
  FileIcon,
  X,
} from "lucide-react";
import type { UseLocalTransferReturn } from "@/hooks/useLocalTransfer";
import type { LocalReceiver } from "@/hooks/useLocalSSE";
import { getDeviceIcon } from "./utils";
import { SafariWarning } from "./SafariWarning";
import { RoomCodeSection } from "./RoomCodeSection";
import { TransferProgressDisplay } from "./TransferProgressDisplay";

interface SendViewProps {
  selectedFiles: File[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onRemoveFile: (index: number) => void;
  onSendTo: (receiverId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  transfer: UseLocalTransferReturn;
  receivers: LocalReceiver[];
  peerId: string | null;
  totalSelectedSize: number;
  showSafariWarning: boolean;
  onDismissSafari: () => void;
  showCancelConfirm: boolean;
  setShowCancelConfirm: (v: boolean) => void;
}

export function SendView({
  selectedFiles,
  onFileSelect,
  onDrop,
  onRemoveFile,
  onSendTo,
  fileInputRef,
  transfer,
  receivers,
  peerId,
  totalSelectedSize,
  showSafariWarning,
  onDismissSafari,
  showCancelConfirm,
  setShowCancelConfirm,
}: SendViewProps) {
  return (
    <>
      <h2
        className="text-2xl sm:text-3xl font-normal text-center tracking-tight mb-2"
        style={{ color: LANDING_COLORS.textPrimary }}
      >
        Send files
      </h2>
      <p
        className="text-sm text-center mb-8"
        style={{ color: LANDING_COLORS.textSecondary }}
      >
        Select files and pick a nearby device
      </p>

      {/* Main card */}
      <div
        className="rounded-2xl border overflow-hidden backdrop-blur-xl"
        style={{
          backgroundColor: `${LANDING_COLORS.surface}B3`,
          borderColor: LANDING_COLORS.border,
        }}
      >
        <div className="p-6 sm:p-8">
          {/* File drop zone / file list */}
          {selectedFiles.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all hover:border-violet-500/40"
              style={{ borderColor: `${LANDING_COLORS.border}80` }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
              >
                <Upload className="w-7 h-7 text-violet-400" />
              </div>
              <p className="text-sm font-medium" style={{ color: LANDING_COLORS.textSecondary }}>
                Drop files here or{" "}
                <span className="text-violet-400 underline underline-offset-2">browse</span>
              </p>
              <p className="text-xs mt-1.5" style={{ color: LANDING_COLORS.textMuted }}>
                Any file type, any size — up to 100 files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFileSelect}
              />
            </div>
          ) : (
            <div>
              {/* File list */}
              <div
                className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl border p-2"
                style={{
                  borderColor: `${LANDING_COLORS.accent}25`,
                  backgroundColor: `${LANDING_COLORS.accent}05`,
                }}
              >
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ backgroundColor: `${LANDING_COLORS.bg}40` }}
                  >
                    <FileIcon className="w-4 h-4 text-violet-400 shrink-0" />
                    <span
                      className="text-sm truncate flex-1"
                      style={{ color: LANDING_COLORS.textPrimary }}
                    >
                      {file.name}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: LANDING_COLORS.textMuted }}>
                      {formatBytes(file.size)}
                    </span>
                    {transfer.state === "idle" && (
                      <button
                        onClick={() => onRemoveFile(idx)}
                        className="p-0.5 rounded hover:bg-white/10 cursor-pointer"
                        style={{ color: LANDING_COLORS.textMuted }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Summary bar */}
              <div className="flex items-center justify-between mt-2.5 px-1">
                <span className="text-xs font-medium" style={{ color: LANDING_COLORS.textMuted }}>
                  {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} — {formatBytes(totalSelectedSize)}
                </span>
                {transfer.state === "idle" && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                  >
                    + Add more
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFileSelect}
              />
            </div>
          )}

          {/* Safari >2GB warning */}
          {showSafariWarning && (
            <SafariWarning onDismiss={onDismissSafari} />
          )}

          {/* Receiver list — always visible in send mode */}
          {transfer.state === "idle" && (
            <div className="mt-6">
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: LANDING_COLORS.textMuted }}
              >
                Nearby devices ({receivers.length})
              </h3>
              {receivers.length === 0 ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-violet-400" />
                  <p className="text-sm" style={{ color: LANDING_COLORS.textMuted }}>
                    Waiting for a device to enter <span className="text-emerald-400">Receive</span> mode...
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {receivers.map((r) => {
                    const DeviceIcon = getDeviceIcon(r.osName);
                    return (
                      <button
                        key={r.peerId}
                        onClick={() => onSendTo(r.peerId)}
                        disabled={selectedFiles.length === 0}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all hover:border-violet-500/40 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: LANDING_COLORS.border,
                          backgroundColor: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${LANDING_COLORS.accent}05`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
                        >
                          <DeviceIcon className="w-4 h-4 text-violet-400" />
                        </div>
                        <span className="font-medium text-sm flex-1 text-left" style={{ color: LANDING_COLORS.textPrimary }}>
                          {r.displayName}
                        </span>
                        <ArrowRight className="w-4 h-4 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Room code section */}
              <RoomCodeSection peerId={peerId} />
            </div>
          )}

          {/* Transfer progress (sender) */}
          {transfer.state !== "idle" && (
            <div className="mt-6">
              <TransferProgressDisplay
                transfer={transfer}
                role="send"
                showCancelConfirm={showCancelConfirm}
                setShowCancelConfirm={setShowCancelConfirm}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
