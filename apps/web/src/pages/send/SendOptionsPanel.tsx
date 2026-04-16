import type { ReactNode } from "react";
import { Clock, Download, Check } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

interface SendOptionsPanelProps {
  expiresInHours: number;
  onExpiryChange: (hours: number) => void;
  expiryOptions: readonly { value: number; label: string }[];
  maxDownloads: string;
  onMaxDownloadsChange: (value: string) => void;
  savedField: string | null;
  passwordSlot?: ReactNode;
  notifySlot?: ReactNode;
}

function SavedBadge({ visible }: { visible: boolean }) {
  return (
    <span
      className="ml-auto text-emerald-400 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <Check className="w-3 h-3 inline -mt-px" /> Saved
    </span>
  );
}

export function SendOptionsPanel({
  expiresInHours,
  onExpiryChange,
  expiryOptions,
  maxDownloads,
  onMaxDownloadsChange,
  savedField,
  passwordSlot,
  notifySlot,
}: SendOptionsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Expiry */}
        <div className="space-y-2">
          <label
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: LANDING_COLORS.textSecondary }}
          >
            <Clock className="w-3.5 h-3.5" />
            Expires after
            <SavedBadge visible={savedField === "expiry"} />
          </label>
          <select
            value={expiresInHours}
            onChange={(e) => onExpiryChange(parseInt(e.target.value, 10))}
            className="w-full h-10 rounded-lg border px-3 text-sm outline-none transition-colors focus:ring-1 cursor-pointer"
            style={{
              backgroundColor: LANDING_COLORS.bg,
              borderColor: LANDING_COLORS.border,
              color: LANDING_COLORS.textPrimary,
            }}
          >
            {expiryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Download limit */}
        <div className="space-y-2">
          <label
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: LANDING_COLORS.textSecondary }}
          >
            <Download className="w-3.5 h-3.5" />
            Download limit
            <SavedBadge visible={savedField === "downloads"} />
          </label>
          <input
            type="number"
            placeholder="Unlimited"
            min={1}
            max={1000}
            value={maxDownloads}
            onChange={(e) => onMaxDownloadsChange(e.target.value)}
            className="w-full h-10 rounded-lg border px-3 text-sm outline-none transition-colors focus:ring-1"
            style={{
              backgroundColor: LANDING_COLORS.bg,
              borderColor: LANDING_COLORS.border,
              color: LANDING_COLORS.textPrimary,
            }}
          />
        </div>
      </div>

      {passwordSlot}
      {notifySlot}
    </div>
  );
}
