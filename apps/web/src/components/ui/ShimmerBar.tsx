import { LANDING_COLORS } from "@/lib/constants/themeColors";

interface ShimmerBarProps {
  progress: number;
  /** Show shimmer sweep during active progress */
  active?: boolean;
  /** Green fill when complete */
  variant?: "accent" | "success";
  /** Bar thickness */
  size?: "sm" | "md";
}

/**
 * Premium progress bar with animated shimmer sweep.
 * Uses solid color (no gradient compression artifacts).
 */
export function ShimmerBar({
  progress,
  active = true,
  variant = "accent",
  size = "md",
}: ShimmerBarProps) {
  const color =
    variant === "success" ? LANDING_COLORS.success : LANDING_COLORS.accent;
  const p = Math.max(0, Math.min(100, progress));
  const h = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div
      className={`w-full ${h}`}
      style={{
        backgroundColor: `${LANDING_COLORS.accent}12`,
        clipPath: "inset(0 round 9999px)",
      }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out relative overflow-hidden"
        style={{
          width: `${p}%`,
          backgroundColor: color,
        }}
      >
        {active && p > 0 && p < 100 && (
          <div className="absolute inset-0 shimmer-bar-sweep" />
        )}
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes shimmer-bar-sweep-anim {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          .shimmer-bar-sweep {
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(255, 255, 255, 0.13) 45%,
              rgba(255, 255, 255, 0.22) 50%,
              rgba(255, 255, 255, 0.13) 55%,
              transparent 100%
            );
            animation: shimmer-bar-sweep-anim 2s ease-in-out infinite;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .shimmer-bar-sweep { display: none; }
        }
      `}</style>
    </div>
  );
}
