import { Download } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

interface RadarScanProps {
  size?: number;
  color?: string;
  children?: React.ReactNode;
  className?: string;
}

export function RadarScan({
  size = 80,
  color = LANDING_COLORS.success,
  children,
  className,
}: RadarScanProps) {
  const center = size / 2;
  const radius = size / 2 - 2;
  const ring1R = radius * 0.33;
  const ring2R = radius * 0.66;
  const iconSize = Math.round(size * 0.35);

  // 90° sweep wedge path (pie slice from center)
  const sweepEndAngle = Math.PI / 2; // 90 degrees
  const ax = center + radius * Math.cos(0);
  const ay = center + radius * Math.sin(0);
  const bx = center + radius * Math.cos(-sweepEndAngle);
  const by = center + radius * Math.sin(-sweepEndAngle);
  const sweepPath = `M ${center} ${center} L ${ax} ${ay} A ${radius} ${radius} 0 0 0 ${bx} ${by} Z`;

  const sweepGradId = `rs-sweep-${size}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size}>
        <defs>
          <radialGradient id={sweepGradId} cx="50%" cy="50%" r="50%">
            <stop offset="30%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Guide rings */}
        <circle
          cx={center}
          cy={center}
          r={ring1R}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          strokeOpacity={0.06}
        />
        <circle
          cx={center}
          cy={center}
          r={ring2R}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          strokeOpacity={0.06}
        />

        {/* Sweep arc — rotates 360° */}
        <path
          className="radar-sweep"
          d={sweepPath}
          fill={`url(#${sweepGradId})`}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Pulse ring */}
        <circle
          className="radar-pulse"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={1}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Center dot */}
        <circle
          className="radar-dot"
          cx={center}
          cy={center}
          r={2}
          fill={color}
        />
      </svg>

      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? <Download size={iconSize} color={color} style={{ opacity: 0.8 }} />}
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes radar-sweep-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes radar-pulse-ring {
            0% { transform: scale(0.85); stroke-opacity: 0.2; }
            100% { transform: scale(1.05); stroke-opacity: 0; }
          }
          @keyframes radar-dot-ping {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.9; }
          }
          .radar-sweep {
            animation: radar-sweep-spin 3s linear infinite;
          }
          .radar-pulse {
            animation: radar-pulse-ring 2s ease-out infinite;
          }
          .radar-dot {
            animation: radar-dot-ping 1.5s ease-in-out infinite;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .radar-sweep { transform: rotate(0deg); }
          .radar-pulse { stroke-opacity: 0.1; }
          .radar-dot { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
