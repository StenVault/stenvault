import { useState, useEffect, useRef } from "react";
import { FileIcon, Copy, X, Clock, ChevronDown } from "lucide-react";
import { formatBytes } from "@stenvault/shared";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import type { SendHistoryEntry } from "@/lib/sendHistoryStorage";

interface SendHistoryCardsProps {
  history: SendHistoryEntry[];
  onDismiss: (sessionId: string) => void;
  onCopy: (shareUrl: string) => void;
}

const VISIBLE_DEFAULT = 5;

function formatCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 48) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function HistoryRow({
  entry,
  index,
  onDismiss,
  onCopy,
}: {
  entry: SendHistoryEntry;
  index: number;
  onDismiss: () => void;
  onCopy: () => void;
}) {
  const [countdown, setCountdown] = useState(() => formatCountdown(entry.expiresAt));
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCountdown(formatCountdown(entry.expiresAt));
    const id = setInterval(() => setCountdown(formatCountdown(entry.expiresAt)), 30_000);
    return () => clearInterval(id);
  }, [entry.expiresAt]);

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
  }, []);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const isExpired = countdown === "Expired";

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-300"
      style={{
        backgroundColor: LANDING_COLORS.surface,
        borderColor: LANDING_COLORS.border,
        opacity: isExpired ? 0.5 : 1,
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${LANDING_COLORS.accent}40`;
        e.currentTarget.style.boxShadow = `0 0 12px ${LANDING_COLORS.accentGlow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = LANDING_COLORS.border;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* File icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
      >
        <FileIcon className="w-4 h-4 text-violet-400" />
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium truncate leading-tight"
          style={{ color: LANDING_COLORS.textPrimary }}
        >
          {entry.fileName}
        </p>
        <p className="text-[10px] leading-tight mt-0.5" style={{ color: LANDING_COLORS.textMuted }}>
          {formatBytes(entry.fileSize)}
        </p>
      </div>

      {/* Countdown */}
      <span
        className="text-[10px] font-medium tabular-nums shrink-0 hidden sm:inline-flex items-center gap-1"
        style={{ color: isExpired ? LANDING_COLORS.danger : LANDING_COLORS.textMuted }}
      >
        <Clock className="w-3 h-3" />
        {countdown}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-md transition-colors cursor-pointer"
          style={{ color: copied ? LANDING_COLORS.success : LANDING_COLORS.textMuted }}
          onMouseEnter={(e) => {
            if (!copied) e.currentTarget.style.color = LANDING_COLORS.accent;
          }}
          onMouseLeave={(e) => {
            if (!copied) e.currentTarget.style.color = LANDING_COLORS.textMuted;
          }}
          aria-label="Copy link"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-md transition-colors cursor-pointer"
          style={{ color: LANDING_COLORS.textMuted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = LANDING_COLORS.danger)}
          onMouseLeave={(e) => (e.currentTarget.style.color = LANDING_COLORS.textMuted)}
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SendHistoryCards({ history, onDismiss, onCopy }: SendHistoryCardsProps) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) return null;

  const visible = expanded ? history : history.slice(0, VISIBLE_DEFAULT);
  const hasMore = history.length > VISIBLE_DEFAULT;

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: LANDING_COLORS.accent }}
        >
          Recent sends
        </span>
        <div className="h-px flex-1" style={{ backgroundColor: `${LANDING_COLORS.accent}15` }} />
      </div>

      {/* Cards */}
      <div className="space-y-1.5">
        {visible.map((entry, i) => (
          <HistoryRow
            key={entry.sessionId}
            entry={entry}
            index={i}
            onDismiss={() => onDismiss(entry.sessionId)}
            onCopy={() => onCopy(entry.shareUrl)}
          />
        ))}
      </div>

      {/* Expand toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 mx-auto text-[10px] font-medium transition-colors cursor-pointer"
          style={{ color: LANDING_COLORS.textMuted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = LANDING_COLORS.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.color = LANDING_COLORS.textMuted)}
        >
          {expanded ? "Show less" : `Show all (${history.length})`}
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
