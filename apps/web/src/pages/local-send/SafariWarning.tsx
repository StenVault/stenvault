import { AlertTriangle, X } from "lucide-react";
import { LANDING_COLORS } from "@/components/landing-v3/constants";

export interface SafariWarningProps {
  onDismiss?: () => void;
  className?: string;
}

/**
 * Safari >2GB warning banner.
 */
export function SafariWarning({ onDismiss, className = "" }: SafariWarningProps) {
  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded-xl mt-3 ${className}`}
      style={{ backgroundColor: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)" }}
    >
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xs font-medium text-amber-300">
          Safari has limited support for large transfers. For files over 2 GB, use Chrome or Firefox.
        </p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-white/10 cursor-pointer"
          style={{ color: LANDING_COLORS.textMuted }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
