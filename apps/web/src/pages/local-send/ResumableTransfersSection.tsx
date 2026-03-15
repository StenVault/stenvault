import { LANDING_COLORS } from "@/components/landing-v3/constants";
import { formatBytes } from "@stenvault/shared";
import { FileIcon, X } from "lucide-react";
import type { ResumableTransfer } from "@/hooks/useLocalTransfer";

export interface ResumableTransfersSectionProps {
  transfers: ResumableTransfer[];
  onDiscard: (sessionId: string) => Promise<void>;
}

/**
 * Resumable transfers section -- shows partial transfers from IndexedDB.
 * Displayed in receive mode when idle.
 */
export function ResumableTransfersSection({
  transfers,
  onDiscard,
}: ResumableTransfersSectionProps) {
  if (transfers.length === 0) return null;

  return (
    <div className="mt-6 text-left">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: LANDING_COLORS.textMuted }}
      >
        Resumable transfers
      </h3>
      <p className="text-xs mb-3" style={{ color: LANDING_COLORS.textMuted }}>
        Ask the sender to retry — transfer will resume automatically.
      </p>
      <div className="space-y-2">
        {transfers.map((t) => (
          <div
            key={t.sessionId}
            className="flex items-center gap-3 p-3 rounded-xl border"
            style={{
              borderColor: `${LANDING_COLORS.accent}20`,
              backgroundColor: `${LANDING_COLORS.accent}05`,
            }}
          >
            <FileIcon className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate font-medium" style={{ color: LANDING_COLORS.textPrimary }}>
                {t.fileName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${t.progress}%`,
                      backgroundColor: LANDING_COLORS.accent,
                    }}
                  />
                </div>
                <span className="text-xs shrink-0" style={{ color: LANDING_COLORS.textMuted }}>
                  {t.progress}%
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: LANDING_COLORS.textMuted }}>
                {formatBytes(t.bytesTransferred)} / {formatBytes(t.totalBytes)}
              </p>
            </div>
            <button
              onClick={() => onDiscard(t.sessionId)}
              className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              style={{ color: LANDING_COLORS.textMuted }}
              title="Discard"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
