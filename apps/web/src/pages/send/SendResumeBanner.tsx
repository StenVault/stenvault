/**
 * Banner shown when an interrupted upload is found in IndexedDB.
 * Replaces the old "re-select to try again" placeholder with a real
 * resume flow: a hidden file picker that dispatches to `onResume`
 * and a dismiss that forgets the record.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { RefreshCw, X } from "lucide-react";
import { formatBytes } from "@stenvault/shared";
import type { SendResumeRecord } from "@stenvault/send/client";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

interface SendResumeBannerProps {
  record: SendResumeRecord;
  onResume: (files: File[]) => Promise<void>;
  onDismiss: () => Promise<void>;
}

export function SendResumeBanner({ record, onResume, onDismiss }: SendResumeBannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    // Clear so re-selecting the same set also fires the change event.
    e.target.value = "";
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      await onResume(Array.from(list));
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    try {
      await onDismiss();
    } finally {
      setBusy(false);
    }
  };

  const isBundle = record.fileCount > 1;
  const totalParts = record.files.reduce((s, f) => s + f.totalParts, 0);
  const completedParts = record.files.reduce((s, f) => s + f.completedParts.length, 0);
  const progressLabel = `${completedParts} of ${totalParts} parts uploaded`;
  const fileLabel = isBundle
    ? `${record.fileCount} files · ${formatBytes(record.totalBytes, 1)}`
    : `${record.files[0]?.name ?? "file"} · ${formatBytes(record.totalBytes, 1)}`;
  const buttonLabel = isBundle ? "Select files to resume" : "Select file to resume";

  return (
    <div
      className="flex items-start gap-3 p-3.5 rounded-xl mb-4 border"
      style={{
        backgroundColor: `${LANDING_COLORS.accent}10`,
        borderColor: `${LANDING_COLORS.accent}30`,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={isBundle}
        onChange={handleSelect}
      />

      <RefreshCw className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: LANDING_COLORS.textPrimary }}>
          Resume interrupted upload?
        </p>
        <p className="text-xs mt-0.5 truncate" style={{ color: LANDING_COLORS.textSecondary }}>
          {fileLabel} · {progressLabel}
        </p>
        {isBundle && (
          <p className="text-[10px] mt-0.5" style={{ color: LANDING_COLORS.textMuted }}>
            Re-select the same files in the same order to continue.
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: LANDING_COLORS.accent,
              color: LANDING_COLORS.textPrimary,
            }}
          >
            {buttonLabel}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
            style={{ color: LANDING_COLORS.textMuted }}
          >
            <X className="w-3 h-3" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
