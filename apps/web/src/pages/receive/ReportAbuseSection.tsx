import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { ABUSE_REASON_LABELS } from "./constants";
import type { PageState } from "./types";
import { Flag, CheckCircle2, Loader2 } from "lucide-react";

interface ReportAbuseSectionProps {
  pageState: PageState;
  showReportModal: boolean;
  setShowReportModal: (v: boolean) => void;
  reportReason: string;
  setReportReason: (v: string) => void;
  reportDetails: string;
  setReportDetails: (v: string) => void;
  reportSubmitted: boolean;
  handleReportAbuse: () => void;
  isReporting: boolean;
}

export function ReportAbuseSection({
  pageState,
  showReportModal,
  setShowReportModal,
  reportReason,
  setReportReason,
  reportDetails,
  setReportDetails,
  reportSubmitted,
  handleReportAbuse,
  isReporting,
}: ReportAbuseSectionProps) {
  if (pageState === "loading") return null;

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: LANDING_COLORS.border }}>
      {!showReportModal ? (
        <button
          onClick={() => setShowReportModal(true)}
          className="flex items-center gap-1.5 text-xs transition-colors cursor-pointer hover:text-red-400"
          style={{ color: LANDING_COLORS.textMuted }}
        >
          <Flag className="w-3.5 h-3.5" />
          Report abuse
        </button>
      ) : reportSubmitted ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-sm font-medium text-emerald-400">Report submitted. Thank you.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium" style={{ color: LANDING_COLORS.textSecondary }}>
            Why are you reporting this file?
          </p>
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="w-full h-9 rounded-lg border px-3 text-sm outline-none cursor-pointer"
            style={{ backgroundColor: LANDING_COLORS.bg, borderColor: LANDING_COLORS.border, color: LANDING_COLORS.textPrimary }}
          >
            {Object.entries(ABUSE_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <textarea
            placeholder="Additional details (optional)"
            maxLength={500}
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            className="w-full h-20 rounded-lg border px-3 py-2 text-sm outline-none resize-none"
            style={{ backgroundColor: LANDING_COLORS.bg, borderColor: LANDING_COLORS.border, color: LANDING_COLORS.textPrimary }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleReportAbuse}
              disabled={isReporting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{ backgroundColor: `${LANDING_COLORS.danger}15`, color: LANDING_COLORS.danger }}
            >
              {isReporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
              Submit report
            </button>
            <button
              onClick={() => setShowReportModal(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{ color: LANDING_COLORS.textMuted, backgroundColor: "transparent" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
