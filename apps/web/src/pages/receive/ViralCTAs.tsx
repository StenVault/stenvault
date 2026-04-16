import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Link } from "react-router-dom";
import { Upload, Zap, ArrowRight, Reply } from "lucide-react";

interface ViralCTAsProps {
  sessionId: string;
  isAuthenticated: boolean;
}

export function ViralCTAs({ sessionId, isAuthenticated }: ViralCTAsProps) {
  return (
    <div className="mt-8 space-y-4">
      {/* Reply with a file */}
      <a
        href={`/send?reply=${sessionId}`}
        className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.01]"
        style={{ borderColor: `${LANDING_COLORS.accent}30`, backgroundColor: `${LANDING_COLORS.accent}08` }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `${LANDING_COLORS.accent}60`;
          e.currentTarget.style.backgroundColor = `${LANDING_COLORS.accent}12`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = `${LANDING_COLORS.accent}30`;
          e.currentTarget.style.backgroundColor = `${LANDING_COLORS.accent}08`;
        }}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}>
          <Reply className="w-5 h-5 text-violet-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: LANDING_COLORS.textPrimary }}>Reply with a file</p>
          <p className="text-xs" style={{ color: LANDING_COLORS.textSecondary }}>Send an encrypted file back</p>
        </div>
        <ArrowRight className="w-4 h-4 ml-auto shrink-0 text-violet-400" />
      </a>

      {/* Transfer locally (LAN) */}
      <Link
        to="/send/local"
        className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.01] group"
        style={{ borderColor: `${LANDING_COLORS.success}25`, backgroundColor: `${LANDING_COLORS.success}06` }}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${LANDING_COLORS.success}12` }}>
          <Zap className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: LANDING_COLORS.textPrimary }}>
            On the same WiFi?{" "}
            <span className="text-emerald-400">Transfer directly</span>
          </p>
          <p className="text-xs" style={{ color: LANDING_COLORS.textSecondary }}>
            Device-to-device · LAN speed · Zero cloud
          </p>
        </div>
        <ArrowRight className="w-4 h-4 ml-auto shrink-0 text-emerald-400 transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Send your own files */}
      <SpotlightCard variant="glass" tilt spotlightColor={LANDING_COLORS.accent}>
        <div className="p-5 sm:p-6 space-y-4 text-center">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto" style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}>
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: LANDING_COLORS.textPrimary }}>
              Want to send your own files?
            </h3>
            <p className="text-xs mt-1" style={{ color: LANDING_COLORS.textSecondary }}>
              Free &middot; Encrypted &middot; No account required
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <MagneticButton as="a" href="/send?ref=receive" size="sm" variant="primary" className="flex-1">
              <Upload className="w-4 h-4" />
              Send Files Now
            </MagneticButton>
            {!isAuthenticated && (
              <MagneticButton as="a" href="/auth/register?ref=send" size="sm" variant="secondary" className="flex-1">
                <div className="text-center">
                  <div>Keep your files truly private</div>
                  <div className="text-[10px] opacity-70 font-normal">5 GB free, no credit card</div>
                </div>
              </MagneticButton>
            )}
          </div>
        </div>
      </SpotlightCard>
    </div>
  );
}
