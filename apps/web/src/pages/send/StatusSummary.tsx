import { useState, useEffect } from "react";
import { Clock, Download, Lock, Unlock } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

interface StatusSummaryProps {
  expiresAt: string;
  maxDownloads: number | null;
  downloadCount: number;
  isPasswordProtected: boolean;
}

function formatCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  if (hours >= 48) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function StatusSummary({
  expiresAt,
  maxDownloads,
  downloadCount,
  isPasswordProtected,
}: StatusSummaryProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(expiresAt));

  useEffect(() => {
    setCountdown(formatCountdown(expiresAt));
    const id = setInterval(() => setCountdown(formatCountdown(expiresAt)), 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const downloadsLabel =
    maxDownloads === null
      ? "Unlimited downloads"
      : `${maxDownloads - downloadCount} downloads left`;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs"
      style={{ color: LANDING_COLORS.textMuted }}
    >
      <span className="inline-flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Expires in {countdown}
      </span>
      <span aria-hidden="true">&middot;</span>
      <span className="inline-flex items-center gap-1">
        <Download className="w-3 h-3" />
        {downloadsLabel}
      </span>
      <span aria-hidden="true">&middot;</span>
      <span className="inline-flex items-center gap-1">
        {isPasswordProtected ? (
          <>
            <Lock className="w-3 h-3" style={{ color: LANDING_COLORS.success }} />
            <span style={{ color: LANDING_COLORS.success }}>Protected</span>
          </>
        ) : (
          <>
            <Unlock className="w-3 h-3" />
            No password
          </>
        )}
      </span>
    </div>
  );
}
