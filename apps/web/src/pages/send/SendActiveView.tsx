import { ChevronDown } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { EncryptionRing } from "@/components/ui/EncryptionRing";
import { ShimmerBar } from "@/components/ui/ShimmerBar";
import { formatSpeed, formatEta } from "./utils";
import type { SendState } from "@/hooks/usePublicSend";

interface SendActiveViewProps {
  state: SendState;
  progress: number;
  speed: number;
  eta: number;
  fileDisplayName: string;
  fileDisplaySize: string;
  hasFiles: boolean;
  optionsPanel: React.ReactNode;
  mobileOptionsOpen: boolean;
  onToggleMobileOptions: () => void;
}

const STATE_LABELS: Record<string, string> = {
  encrypting: "Encrypting...",
  uploading: "Uploading...",
  completing: "Finalizing...",
};

export function SendActiveView({
  state,
  progress,
  speed,
  eta,
  fileDisplayName,
  fileDisplaySize,
  hasFiles,
  optionsPanel,
  mobileOptionsOpen,
  onToggleMobileOptions,
}: SendActiveViewProps) {
  return (
    <div className="py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: progress */}
        <div className="space-y-5">
          <div className="text-center md:text-left space-y-3">
            <div className="mx-auto md:mx-0 w-fit">
              <EncryptionRing progress={progress} state={state} size={64} />
            </div>
            <p className="font-semibold text-lg" style={{ color: LANDING_COLORS.textPrimary }}>
              {STATE_LABELS[state] ?? "Processing..."}
            </p>
            {hasFiles && (
              <p className="text-sm truncate" style={{ color: LANDING_COLORS.textSecondary }}>
                {fileDisplayName} &middot; {fileDisplaySize}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <ShimmerBar progress={progress} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: LANDING_COLORS.textSecondary }}>
                {progress}%
              </p>
              {state === "uploading" && speed > 0 && (
                <p className="text-xs" style={{ color: LANDING_COLORS.textMuted }}>
                  {formatSpeed(speed)}
                  {eta > 0 && ` · ${formatEta(eta)}`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: options (desktop) */}
        <div className="hidden md:block">
          {optionsPanel}
        </div>
      </div>

      {/* Mobile: collapsible options */}
      <div className="md:hidden mt-4">
        <button
          type="button"
          onClick={onToggleMobileOptions}
          className="w-full flex items-center justify-between py-3 text-sm font-medium cursor-pointer"
          style={{ color: LANDING_COLORS.textSecondary }}
        >
          Options
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-300 ${mobileOptionsOpen ? "rotate-180" : ""}`}
            style={{ color: LANDING_COLORS.textMuted }}
          />
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ${mobileOptionsOpen ? "max-h-[600px] pb-2" : "max-h-0"}`}
        >
          {optionsPanel}
        </div>
      </div>
    </div>
  );
}
