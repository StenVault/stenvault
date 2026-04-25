import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { ShimmerBar } from "@/components/ui/ShimmerBar";
import { Link } from "react-router-dom";
import { toast } from "@/lib/toast";
import type { RefObject } from "react";
import {
  Download,
  Check,
  AlertCircle,
  Loader2,
  ArrowRight,
  FolderDown,
} from "lucide-react";

interface DoneStateProps {
  fileName: string | null;
  fileType: string | null;
  isAuthenticated: boolean;
  decryptedBlobRef: RefObject<Blob | null>;
  canSave: boolean;
  saveState: string;
  saveToVault: (blob: Blob, name: string, mime: string) => Promise<boolean>;
  saveProgress: number;
  saveError: string | null;
  resetSave: () => void;
  handleDownload: () => void;
}

export function DoneState({
  fileName,
  fileType,
  isAuthenticated,
  decryptedBlobRef,
  canSave,
  saveState,
  saveToVault,
  saveProgress,
  saveError,
  resetSave,
  handleDownload,
}: DoneStateProps) {
  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-3">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: `${LANDING_COLORS.success}15` }}
        >
          <Check className="w-8 h-8" style={{ color: LANDING_COLORS.success }} />
        </div>
        <p className="font-semibold text-lg" style={{ color: LANDING_COLORS.textPrimary }}>
          File decrypted & saved
        </p>
        <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
          {fileName}
        </p>
      </div>

      {/* Save to Vault — authenticated users with captured blob */}
      {isAuthenticated && decryptedBlobRef.current && canSave && saveState === 'idle' && (
        <MagneticButton
          size="lg"
          variant="primary"
          className="w-full"
          onClick={async () => {
            const blob = decryptedBlobRef.current;
            if (!blob) return;
            const ok = await saveToVault(blob, fileName || "download", fileType || "application/octet-stream");
            if (ok) {
              toast.success("File saved to your vault");
              decryptedBlobRef.current = null;
            }
          }}
        >
          <FolderDown className="w-5 h-5" />
          Save to Vault
        </MagneticButton>
      )}

      {/* Save to Vault — too large (>100MB, blob not captured) */}
      {isAuthenticated && !decryptedBlobRef.current && canSave && saveState === 'idle' && (
        <div
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
          style={{ color: LANDING_COLORS.textMuted }}
          title="Files over 100 MB must be downloaded directly"
        >
          <FolderDown className="w-5 h-5 opacity-40" />
          <span className="opacity-60">Save to Vault</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded ml-1"
            style={{ backgroundColor: `${LANDING_COLORS.surface}`, color: LANDING_COLORS.textMuted }}
          >
            100 MB max
          </span>
        </div>
      )}

      {/* Save to Vault — progress */}
      {isAuthenticated && saveState !== 'idle' && saveState !== 'done' && saveState !== 'error' && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm font-medium" style={{ color: LANDING_COLORS.textPrimary }}>
            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            {saveState === 'encrypting' ? 'Encrypting for your vault...' : saveState === 'uploading' ? 'Uploading to vault...' : 'Confirming...'}
          </div>
          <ShimmerBar progress={saveProgress} size="sm" />
        </div>
      )}

      {/* Save to Vault — done */}
      {isAuthenticated && saveState === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium" style={{ color: LANDING_COLORS.success }}>
            <Check className="w-4 h-4" />
            Saved to your vault
          </div>
          <Link
            to="/drive"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors"
            style={{ borderColor: LANDING_COLORS.border, color: LANDING_COLORS.textSecondary, backgroundColor: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LANDING_COLORS.surface)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Save to Vault — error */}
      {isAuthenticated && saveState === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: `${LANDING_COLORS.danger}10`, color: LANDING_COLORS.danger }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {saveError || 'Failed to save'}
          </div>
          <button
            onClick={resetSave}
            className="w-full text-center text-xs font-medium cursor-pointer transition-colors hover:text-violet-400"
            style={{ color: LANDING_COLORS.textMuted }}
          >
            Try again
          </button>
        </div>
      )}

      <button
        onClick={handleDownload}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer"
        style={{ borderColor: LANDING_COLORS.border, color: LANDING_COLORS.textSecondary, backgroundColor: "transparent" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LANDING_COLORS.surface)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <Download className="w-4 h-4" />
        Download again
      </button>
    </div>
  );
}
