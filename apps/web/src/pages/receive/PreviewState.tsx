import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { formatBytes } from "@stenvault/shared";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { FilePreviewIcon } from "./FilePreviewIcon";
import type { ManifestEntry } from "./types";
import {
  Download,
  Shield,
  Clock,
  AlertCircle,
  FileText,
  Archive,
  ChevronDown,
} from "lucide-react";

interface PreviewStateProps {
  previewData: {
    fileSize: number;
    expiresAt: string;
    downloadsRemaining: number | null;
  };
  fileName: string | null;
  thumbnailUrl: string | null;
  snippetText: string | null;
  thumbnailFailed: boolean;
  isBundle: boolean;
  manifest: ManifestEntry[] | null;
  showManifest: boolean;
  setShowManifest: (v: boolean) => void;
  timeRemaining: string | null;
  isExpiringSoon: boolean;
  isExpiringSoonUrgent: boolean;
  isAuthenticated: boolean;
  handleDownload: () => void;
}

export function PreviewState({
  previewData,
  fileName,
  thumbnailUrl,
  snippetText,
  thumbnailFailed,
  isBundle,
  manifest,
  showManifest,
  setShowManifest,
  timeRemaining,
  isExpiringSoon,
  isExpiringSoonUrgent,
  isAuthenticated,
  handleDownload,
}: PreviewStateProps) {
  return (
    <div className="space-y-6">
      {/* File info */}
      <div className="flex items-center gap-4">
        <FilePreviewIcon thumbnailUrl={thumbnailUrl} thumbnailFailed={thumbnailFailed} isBundle={isBundle} />
        <div className="min-w-0">
          <p className="font-semibold truncate" style={{ color: LANDING_COLORS.textPrimary }}>
            {fileName || "Encrypted file"}
          </p>
          <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
            {formatBytes(previewData.fileSize)}
          </p>
        </div>
      </div>

      {/* Thumbnail preview (full-width) */}
      {thumbnailUrl && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: LANDING_COLORS.border }}>
          <img src={thumbnailUrl} alt="File preview" className="w-full max-h-48 object-cover" />
        </div>
      )}

      {/* Text snippet preview */}
      {snippetText && !thumbnailUrl && (
        <div
          className="rounded-xl p-4 border"
          style={{ backgroundColor: LANDING_COLORS.bg, borderColor: LANDING_COLORS.border }}
        >
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-medium" style={{ color: LANDING_COLORS.textMuted }}>Preview</span>
          </div>
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono"
            style={{ color: LANDING_COLORS.textSecondary }}
          >
            {snippetText}
          </pre>
        </div>
      )}

      {/* Bundle manifest */}
      {isBundle && manifest && manifest.length > 0 && (
        <div>
          <button
            onClick={() => setShowManifest(!showManifest)}
            className="flex items-center gap-2 text-xs font-medium cursor-pointer transition-colors hover:text-violet-300"
            style={{ color: LANDING_COLORS.textSecondary }}
          >
            <Archive className="w-3.5 h-3.5 text-violet-400" />
            ZIP archive · {manifest.length} files
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManifest ? "rotate-180" : ""}`} />
          </button>
          {showManifest && (
            <div className="mt-2 rounded-lg border overflow-hidden" style={{ borderColor: LANDING_COLORS.border }}>
              {manifest.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                  style={{ backgroundColor: i % 2 === 0 ? "transparent" : `${LANDING_COLORS.bg}40` }}
                >
                  <span className="truncate" style={{ color: LANDING_COLORS.textPrimary }}>{f.name}</span>
                  <span className="shrink-0 ml-2" style={{ color: LANDING_COLORS.textMuted }}>{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expiry warning */}
      {isExpiringSoonUrgent && (
        <div
          className="flex items-center gap-2.5 p-3 rounded-xl text-sm font-medium"
          style={{ backgroundColor: `${LANDING_COLORS.danger}10`, color: LANDING_COLORS.danger }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          This link expires soon — download now
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: isExpiringSoonUrgent
              ? `${LANDING_COLORS.danger}10`
              : isExpiringSoon ? '#78350f15' : `${LANDING_COLORS.accent}10`,
            color: isExpiringSoonUrgent
              ? LANDING_COLORS.danger
              : isExpiringSoon ? '#fbbf24' : LANDING_COLORS.textSecondary,
          }}
        >
          <Clock className="w-3.5 h-3.5" />
          {timeRemaining ? `Expires in ${timeRemaining}` : `Expires ${new Date(previewData.expiresAt).toLocaleDateString()}`}
        </span>
        {previewData.downloadsRemaining !== null && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: `${LANDING_COLORS.accent}10`, color: LANDING_COLORS.textSecondary }}
          >
            <Download className="w-3.5 h-3.5 text-violet-400" />
            {previewData.downloadsRemaining} downloads left
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: `${LANDING_COLORS.success}10`, color: LANDING_COLORS.success }}
        >
          <Shield className="w-3.5 h-3.5" />
          Encrypted
        </span>
      </div>

      <MagneticButton size="lg" variant="primary" className="w-full" onClick={handleDownload}>
        <Download className="w-5 h-5" />
        Download & Decrypt
      </MagneticButton>
      {isAuthenticated && previewData.fileSize > 100 * 1024 * 1024 && (
        <p className="text-xs text-center" style={{ color: LANDING_COLORS.textMuted }}>
          Files over 100 MB can be downloaded but not saved directly to your vault.
        </p>
      )}
    </div>
  );
}
