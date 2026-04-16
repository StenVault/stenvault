import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export function ReceiveFooter() {
  return (
    <footer className="py-8 px-6 border-t" style={{ borderColor: LANDING_COLORS.border }}>
      <div className="container mx-auto space-y-4">
        {/* Powered by badge */}
        <div className="flex justify-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border"
            style={{ borderColor: LANDING_COLORS.border, backgroundColor: `${LANDING_COLORS.surface}60` }}
          >
            <Shield className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-medium" style={{ color: LANDING_COLORS.textSecondary }}>
              Powered by <span className="text-violet-400 font-semibold">StenVault</span> — Zero-Knowledge Encrypted
            </span>
          </div>
        </div>
        {/* Links */}
        <div className="flex items-center justify-center gap-6">
          <Link to="/send?ref=send" className="text-xs transition-colors hover:text-violet-400" style={{ color: LANDING_COLORS.textMuted }}>
            Send a file
          </Link>
          <Link to="/send/local" className="text-xs transition-colors hover:text-emerald-400" style={{ color: LANDING_COLORS.textMuted }}>
            LAN Transfer
          </Link>
          <Link to="/auth/register?ref=send" className="text-xs transition-colors hover:text-violet-400" style={{ color: LANDING_COLORS.textMuted }}>
            Sign up
          </Link>
          <span className="text-xs" style={{ color: LANDING_COLORS.textMuted }}>
            &copy; {new Date().getFullYear()} StenVault
          </span>
        </div>
      </div>
    </footer>
  );
}
