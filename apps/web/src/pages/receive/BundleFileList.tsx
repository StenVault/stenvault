/**
 * Per-file list for Send V2 multi-file bundles.
 *
 * Shows every file in the bundle with its plaintext size and a per-file
 * download button. A prominent "Download all as ZIP" CTA sits at the
 * top — that button feeds the client-zip pipeline in `bundleDownload.ts`.
 *
 * Single-file sends bypass this list — PreviewState keeps its single
 * "Download & Decrypt" button for that case.
 */
import { Download, FileArchive, FileIcon } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { formatBytes } from "@stenvault/shared";
import { MagneticButton } from "@/components/ui/MagneticButton";
import type { ManifestEntry } from "./types";

interface BundleFileListProps {
  files: ReadonlyArray<ManifestEntry & { fileIndex: number }>;
  totalBytes: number;
  /** Triggered by "Download all as ZIP". */
  onDownloadAll: () => void;
  /** Triggered by per-file Download button. */
  onDownloadFile: (fileIndex: number) => void;
  /** Disables every button while a download is in progress. */
  disabled?: boolean;
}

export function BundleFileList({
  files,
  totalBytes,
  onDownloadAll,
  onDownloadFile,
  disabled,
}: BundleFileListProps) {
  return (
    <div className="space-y-4">
      <MagneticButton
        size="lg"
        variant="primary"
        className="w-full"
        onClick={onDownloadAll}
        disabled={disabled}
      >
        <FileArchive className="w-5 h-5" />
        Download all as ZIP ({formatBytes(totalBytes)})
      </MagneticButton>

      <div className="space-y-1">
        <p
          className="text-xs font-medium px-1"
          style={{ color: LANDING_COLORS.textMuted }}
        >
          {files.length} file{files.length === 1 ? "" : "s"} in bundle
        </p>
        <div
          className="rounded-lg border overflow-hidden divide-y"
          style={{
            borderColor: LANDING_COLORS.border,
          }}
        >
          {files.map((f) => (
            <div
              key={f.fileIndex}
              className="flex items-center gap-3 px-3 py-2.5"
              style={{ backgroundColor: `${LANDING_COLORS.bg}40` }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
              >
                <FileIcon className="w-4 h-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm truncate"
                  style={{ color: LANDING_COLORS.textPrimary }}
                >
                  {f.name}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: LANDING_COLORS.textMuted }}
                >
                  {formatBytes(f.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDownloadFile(f.fileIndex)}
                disabled={disabled}
                aria-label={`Download ${f.name}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 hover:brightness-110"
                style={{
                  backgroundColor: `${LANDING_COLORS.accent}15`,
                  color: LANDING_COLORS.textPrimary,
                }}
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
