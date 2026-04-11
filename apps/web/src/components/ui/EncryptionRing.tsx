import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Lock, Upload, Shield, Check, X } from "lucide-react";
import { LANDING_COLORS } from "@/components/landing-v3/constants";

export type EncryptionRingState =
  | "idle"
  | "encrypting"
  | "uploading"
  | "completing"
  | "transferring"
  | "requesting"
  | "waiting_accept"
  | "connecting"
  | "done"
  | "completed"
  | "error";

interface EncryptionRingProps {
  progress: number;
  state: EncryptionRingState;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
  className?: string;
}

const GRADIENT_MAP: Record<string, [string, string]> = {
  encrypting: [LANDING_COLORS.pipelineSource, LANDING_COLORS.pipelineEncrypt],
  requesting: [LANDING_COLORS.pipelineSource, LANDING_COLORS.pipelineEncrypt],
  waiting_accept: [LANDING_COLORS.pipelineSource, LANDING_COLORS.pipelineEncrypt],
  connecting: [LANDING_COLORS.pipelineSource, LANDING_COLORS.pipelineEncrypt],
  uploading: [LANDING_COLORS.pipelineEncrypt, LANDING_COLORS.pipelineStore],
  transferring: [LANDING_COLORS.pipelineEncrypt, LANDING_COLORS.pipelineStore],
  completing: [LANDING_COLORS.pipelineStore, LANDING_COLORS.pipelineDecrypt],
  done: [LANDING_COLORS.success, LANDING_COLORS.success],
  completed: [LANDING_COLORS.success, LANDING_COLORS.success],
  error: [LANDING_COLORS.danger, LANDING_COLORS.danger],
};

function getIcon(state: EncryptionRingState) {
  switch (state) {
    case "idle":
    case "encrypting":
    case "requesting":
    case "waiting_accept":
      return { Icon: Lock, color: LANDING_COLORS.accent };
    case "uploading":
    case "transferring":
      return { Icon: Upload, color: LANDING_COLORS.accent };
    case "completing":
    case "connecting":
      return { Icon: Shield, color: LANDING_COLORS.accent };
    case "done":
    case "completed":
      return { Icon: Check, color: LANDING_COLORS.success };
    case "error":
      return { Icon: X, color: LANDING_COLORS.danger };
  }
}

// Pre-compute tick mark positions for 8 segments at 45° intervals
const TICK_ANGLES = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8 - Math.PI / 2);

export function EncryptionRing({
  progress,
  state,
  size = 64,
  strokeWidth = 3.5,
  children,
  className,
}: EncryptionRingProps) {
  const reducedMotion = useReducedMotion();
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 1; // -1 for orbital dot clearance
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  const showTicks = size >= 48;

  const [gradStart, gradEnd] = GRADIENT_MAP[state] ?? [LANDING_COLORS.accent, LANDING_COLORS.accent];
  const { Icon, color: iconColor } = getIcon(state);
  const iconSize = Math.round(size * 0.375);
  const gradientId = `er-grad-${size}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradStart} />
            <stop offset="100%" stopColor={gradEnd} />
          </linearGradient>
        </defs>

        {/* Layer 1 — Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={LANDING_COLORS.accent}
          strokeWidth={strokeWidth}
          strokeOpacity={0.08}
        />

        {/* Layer 2 — Tick marks (8 segments) */}
        {showTicks &&
          TICK_ANGLES.map((angle, i) => {
            const innerR = radius - 4;
            const outerR = radius + 4;
            return (
              <line
                key={i}
                x1={center + innerR * Math.cos(angle)}
                y1={center + innerR * Math.sin(angle)}
                x2={center + outerR * Math.cos(angle)}
                y2={center + outerR * Math.sin(angle)}
                stroke={LANDING_COLORS.accent}
                strokeWidth={0.8}
                strokeOpacity={0.15}
              />
            );
          })}

        {/* Layer 3 — Progress arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: reducedMotion ? 0.01 : 0.5,
            ease: [0.16, 1, 0.3, 1],
          }}
        />

        {/* Layer 4 — Glow pulse (indeterminate, when progress is 0) */}
        {progress === 0 && !reducedMotion && (
          <circle
            className="encryption-ring-glow"
            cx={center}
            cy={center}
            r={radius + 3}
            fill="none"
            stroke={gradStart}
            strokeWidth={1}
          />
        )}
      </svg>

      {/* Center — Icon with cross-fade */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? (
          <AnimatePresence mode="wait">
            <motion.div
              key={state}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Icon size={iconSize} color={iconColor} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes encryption-ring-glow-anim {
            0%, 100% { stroke-opacity: 0.06; }
            50% { stroke-opacity: 0.18; }
          }
          .encryption-ring-glow {
            animation: encryption-ring-glow-anim 2s ease-in-out infinite;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .encryption-ring-glow {
            stroke-opacity: 0.1;
          }
        }
      `}</style>
    </div>
  );
}
