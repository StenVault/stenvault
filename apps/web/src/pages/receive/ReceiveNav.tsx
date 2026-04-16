import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { EXTERNAL_URLS } from "@/lib/constants/externalUrls";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { Shield, Upload } from "lucide-react";

interface ReceiveNavProps {
  isScrolled: boolean;
}

export function ReceiveNav({ isScrolled }: ReceiveNavProps) {
  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "py-3 border-b" : "py-5"
      }`}
      style={{
        backgroundColor: isScrolled ? `${LANDING_COLORS.bg}E6` : "transparent",
        borderColor: isScrolled ? `${LANDING_COLORS.border}40` : "transparent",
        backdropFilter: isScrolled ? "blur(16px)" : "none",
      }}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        <a href={EXTERNAL_URLS.home} className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-violet-500" />
          <span className="text-lg font-bold" style={{ color: LANDING_COLORS.textPrimary }}>
            Sten<span className="text-violet-500">Vault</span>
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: LANDING_COLORS.accentSubtle, color: LANDING_COLORS.accentHover }}
          >
            Send
          </span>
        </a>
        <MagneticButton as="a" href="/send?ref=send" size="sm" variant="ghost" className="sm:hidden !px-2.5 !py-2.5 !gap-0" aria-label="Send a file">
          <Upload className="w-4 h-4" />
        </MagneticButton>
        <MagneticButton as="a" href="/send?ref=send" size="sm" variant="ghost" className="hidden sm:inline-flex">
          <Upload className="w-4 h-4" />
          Send a file
        </MagneticButton>
      </div>
    </nav>
  );
}
