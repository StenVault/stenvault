/**
 * LocalTransferIcon — Two devices with Wi-Fi arc (P2P direct transfer)
 */
export function LocalTransferIcon({ size = 48 }: { size?: number }) {
    const cx = size / 2;
    const cy = size / 2;

    return (
        <div
            className="relative flex items-center justify-center group/lt"
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
                {/* Left device */}
                <rect
                    x={cx - 18}
                    y={cy - 6}
                    width={8}
                    height={13}
                    rx={1.5}
                    stroke="rgba(99, 102, 241, 0.6)"
                    strokeWidth="1.2"
                />
                <line
                    x1={cx - 16} y1={cy + 5}
                    x2={cx - 12} y2={cy + 5}
                    stroke="rgba(99, 102, 241, 0.4)"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                />

                {/* Right device */}
                <rect
                    x={cx + 10}
                    y={cy - 6}
                    width={8}
                    height={13}
                    rx={1.5}
                    stroke="rgba(99, 102, 241, 0.6)"
                    strokeWidth="1.2"
                />
                <line
                    x1={cx + 12} y1={cy + 5}
                    x2={cx + 16} y2={cy + 5}
                    stroke="rgba(99, 102, 241, 0.4)"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                />

                {/* Wi-Fi arcs */}
                <path
                    d={`M${cx - 4} ${cy + 2} Q${cx} ${cy - 5} ${cx + 4} ${cy + 2}`}
                    stroke="rgba(129, 140, 248, 0.5)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    fill="none"
                    className="transition-opacity duration-700 group-hover/lt:opacity-100 opacity-60"
                />
                <path
                    d={`M${cx - 6} ${cy + 4} Q${cx} ${cy - 9} ${cx + 6} ${cy + 4}`}
                    stroke="rgba(129, 140, 248, 0.35)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    fill="none"
                    className="transition-opacity duration-700 group-hover/lt:opacity-80 opacity-40"
                />
                <path
                    d={`M${cx - 8} ${cy + 6} Q${cx} ${cy - 13} ${cx + 8} ${cy + 6}`}
                    stroke="rgba(129, 140, 248, 0.2)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    fill="none"
                    className="transition-opacity duration-700 group-hover/lt:opacity-60 opacity-20"
                />

                {/* Center dot */}
                <circle
                    cx={cx}
                    cy={cy + 2}
                    r={1.5}
                    fill="rgba(129, 140, 248, 0.7)"
                    className="animate-lt-pulse"
                />
            </svg>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes lt-pulse {
                        0%, 100% { opacity: 0.5; }
                        50% { opacity: 1; }
                    }
                    .animate-lt-pulse {
                        animation: lt-pulse 2s ease-in-out infinite;
                    }
                }
            `}</style>
        </div>
    );
}
