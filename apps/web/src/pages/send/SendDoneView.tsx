import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, QrCode, Share2, RefreshCw, Crown, ChevronDown, Settings2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { StatusSummary } from "./StatusSummary";

interface SendDoneViewProps {
  shareUrl: string;
  fileCount: number;
  copied: boolean;
  showQR: boolean;
  expiresInHours: number;
  maxDownloads: string;
  isPasswordProtected: boolean;
  isAuthenticated: boolean;
  optionsPanel: React.ReactNode;
  onCopy: () => void;
  onShare: () => void;
  onToggleQR: () => void;
  onReset: () => void;
}

export function SendDoneView({
  shareUrl,
  fileCount,
  copied,
  showQR,
  expiresInHours,
  maxDownloads,
  isPasswordProtected,
  isAuthenticated,
  optionsPanel,
  onCopy,
  onShare,
  onToggleQR,
  onReset,
}: SendDoneViewProps) {
  const isMulti = fileCount > 1;
  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <div className="space-y-5 py-2">
      <div className="text-center space-y-2">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: `${LANDING_COLORS.success}15` }}
        >
          <Check className="w-6 h-6" style={{ color: LANDING_COLORS.success }} />
        </div>
        <p className="font-semibold text-lg" style={{ color: LANDING_COLORS.textPrimary }}>
          {isMulti ? "Files encrypted & uploaded" : "File encrypted & uploaded"}
        </p>
        <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
          Share this link — only people with it can decrypt the {isMulti ? "files" : "file"}.
        </p>
      </div>

      {/* Share link */}
      <div className="space-y-3">
        <div
          className="flex items-center gap-2 rounded-xl border p-1"
          style={{
            backgroundColor: LANDING_COLORS.bg,
            borderColor: LANDING_COLORS.border,
          }}
        >
          <input
            readOnly
            value={shareUrl}
            className="flex-1 bg-transparent px-3 text-xs font-mono outline-none truncate"
            style={{ color: LANDING_COLORS.textPrimary }}
            onClick={onCopy}
          />
          <button
            onClick={onCopy}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
            style={{
              backgroundColor: copied ? `${LANDING_COLORS.success}15` : LANDING_COLORS.accent,
              color: copied ? LANDING_COLORS.success : "#fff",
            }}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Copy link
              </>
            )}
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onToggleQR}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer"
            style={{
              borderColor: LANDING_COLORS.border,
              color: showQR ? LANDING_COLORS.accent : LANDING_COLORS.textSecondary,
              backgroundColor: showQR ? `${LANDING_COLORS.accent}08` : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!showQR) e.currentTarget.style.backgroundColor = LANDING_COLORS.surface;
            }}
            onMouseLeave={(e) => {
              if (!showQR) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <QrCode className="w-4 h-4" />
            QR Code
          </button>
          {typeof navigator.share === "function" && (
            <button
              onClick={onShare}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer"
              style={{
                borderColor: LANDING_COLORS.border,
                color: LANDING_COLORS.textSecondary,
                backgroundColor: "transparent",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = LANDING_COLORS.surface)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          )}
        </div>

        {/* QR Code */}
        {showQR && (
          <div className="flex justify-center py-3">
            <div className="bg-white p-4 rounded-xl">
              <QRCodeSVG value={shareUrl} size={200} level="M" />
            </div>
          </div>
        )}

        {/* Status summary */}
        <StatusSummary
          expiresAt={new Date(Date.now() + expiresInHours * 3_600_000).toISOString()}
          maxDownloads={maxDownloads ? parseInt(maxDownloads, 10) || null : null}
          downloadCount={0}
          isPasswordProtected={isPasswordProtected}
        />

        {/* Collapsible options */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: LANDING_COLORS.border }}
        >
          <button
            type="button"
            onClick={() => setOptionsOpen(!optionsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium cursor-pointer transition-colors"
            style={{ color: LANDING_COLORS.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${LANDING_COLORS.surface}80`)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5" />
              Modify settings
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ${optionsOpen ? "rotate-180" : ""}`}
              style={{ color: LANDING_COLORS.textMuted }}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${optionsOpen ? "max-h-[500px] pb-4 px-4" : "max-h-0"}`}
          >
            {optionsPanel}
          </div>
        </div>

        {/* Auth CTA (for anonymous users) */}
        {!isAuthenticated && (
          <div
            className="flex items-center gap-3 p-3 rounded-xl text-sm"
            style={{
              backgroundColor: `${LANDING_COLORS.accent}08`,
              border: `1px solid ${LANDING_COLORS.accent}15`,
            }}
          >
            <Crown className="w-4 h-4 text-violet-400 shrink-0" />
            <span style={{ color: LANDING_COLORS.textSecondary }}>
              <Link
                to="/auth/register?ref=send"
                className="text-violet-400 font-medium hover:underline"
              >
                Sign up
              </Link>{" "}
              for free — keep your files truly private
            </span>
          </div>
        )}

        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer"
          style={{
            borderColor: LANDING_COLORS.border,
            color: LANDING_COLORS.textSecondary,
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LANDING_COLORS.surface)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <RefreshCw className="w-4 h-4" />
          Send another file
        </button>
      </div>
    </div>
  );
}
