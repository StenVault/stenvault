import { LANDING_COLORS } from "@/lib/constants/themeColors";
import {
  Upload,
  Download,
  ArrowRight,
  Zap,
  ShieldCheck,
  Globe,
  Wifi,
  Lock,
  Shield,
} from "lucide-react";

interface IdleViewProps {
  onSelectMode: (mode: "send" | "receive") => void;
}

export function IdleView({ onSelectMode }: IdleViewProps) {
  return (
    <>
      {/* Trust Badge */}
      <div className="flex justify-center mb-4">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-sm"
          style={{
            borderColor: `${LANDING_COLORS.success}30`,
            backgroundColor: `${LANDING_COLORS.success}08`,
          }}
        >
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-300">
            End-to-end encrypted
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* Hero */}
      <h1
        className="text-3xl sm:text-4xl font-normal text-center tracking-tight leading-[1.1] mb-3"
        style={{ color: LANDING_COLORS.textPrimary }}
      >
        Transfer files{" "}
        <span className="text-violet-500">instantly</span>
      </h1>
      <p
        className="text-sm sm:text-base text-center mb-5 max-w-md mx-auto"
        style={{ color: LANDING_COLORS.textSecondary }}
      >
        Direct device-to-device on the same WiFi.
        Zero cloud. Zero cost. E2E encrypted.
      </p>

      {/* Mode selection card */}
      <div
        className="rounded-2xl border overflow-hidden backdrop-blur-xl"
        style={{
          backgroundColor: `${LANDING_COLORS.surface}B3`,
          borderColor: LANDING_COLORS.border,
        }}
      >
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4">
            {/* Send card */}
            <button
              onClick={() => onSelectMode("send")}
              className="group relative flex flex-col items-center gap-3 p-5 sm:p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer"
              style={{
                borderColor: `${LANDING_COLORS.accent}20`,
                backgroundColor: `${LANDING_COLORS.accent}05`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${LANDING_COLORS.accent}60`;
                e.currentTarget.style.backgroundColor = `${LANDING_COLORS.accent}10`;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${LANDING_COLORS.accent}20`;
                e.currentTarget.style.backgroundColor = `${LANDING_COLORS.accent}05`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
              >
                <Upload className="w-7 h-7 text-violet-400" />
              </div>
              <div className="text-center">
                <p
                  className="text-base font-bold mb-1"
                  style={{ color: LANDING_COLORS.textPrimary }}
                >
                  Send
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: LANDING_COLORS.textMuted }}
                >
                  Choose files and pick a nearby device
                </p>
              </div>
              <ArrowRight
                className="w-4 h-4 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4"
              />
            </button>

            {/* Receive card */}
            <button
              onClick={() => onSelectMode("receive")}
              className="group relative flex flex-col items-center gap-3 p-5 sm:p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer"
              style={{
                borderColor: `${LANDING_COLORS.success}20`,
                backgroundColor: `${LANDING_COLORS.success}05`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${LANDING_COLORS.success}60`;
                e.currentTarget.style.backgroundColor = `${LANDING_COLORS.success}10`;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${LANDING_COLORS.success}20`;
                e.currentTarget.style.backgroundColor = `${LANDING_COLORS.success}05`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${LANDING_COLORS.success}15` }}
              >
                <Download className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="text-center">
                <p
                  className="text-base font-bold mb-1"
                  style={{ color: LANDING_COLORS.textPrimary }}
                >
                  Receive
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: LANDING_COLORS.textMuted }}
                >
                  Make this device visible to senders
                </p>
              </div>
              <ArrowRight
                className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4"
              />
            </button>
          </div>
        </div>

        {/* Feature strip inside card */}
        <div
          className="border-t px-6 py-3"
          style={{ borderColor: LANDING_COLORS.border }}
        >
          <div className="flex items-center justify-center gap-6 sm:gap-8">
            {[
              { icon: Zap, label: "LAN speed", color: "text-amber-400" },
              { icon: ShieldCheck, label: "E2E encrypted", color: "text-emerald-400" },
              { icon: Globe, label: "Works everywhere", color: "text-violet-400" },
            ].map(({ icon: Icon, label, color }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: LANDING_COLORS.textMuted }}
              >
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Wifi, label: "Discovers devices on your WiFi" },
          { icon: Lock, label: "Unique encryption for every transfer" },
          { icon: Shield, label: "Data never leaves your network" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl"
            style={{ backgroundColor: `${LANDING_COLORS.surface}80` }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
            >
              <Icon className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: LANDING_COLORS.textMuted }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
