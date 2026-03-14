/**
 * SocialRecoveryIcon — CSS avatar circles merging into Venn diagram
 */
export function SocialRecoveryIcon({ size = 48 }: { size?: number }) {
    const r = size * 0.2;
    const cx = size / 2;
    const cy = size / 2;

    return (
        <div
            className="relative flex items-center justify-center group/sr"
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Three overlapping circles */}
                <circle
                    cx={cx - r * 0.5}
                    cy={cy - r * 0.3}
                    r={r}
                    fill="rgba(99, 102, 241, 0.08)"
                    stroke="rgba(99, 102, 241, 0.4)"
                    strokeWidth="1"
                    className="transition-all duration-700 group-hover/sr:translate-x-[-2px] group-hover/sr:translate-y-[-1px]"
                />
                <circle
                    cx={cx + r * 0.5}
                    cy={cy - r * 0.3}
                    r={r}
                    fill="rgba(167, 139, 250, 0.08)"
                    stroke="rgba(167, 139, 250, 0.4)"
                    strokeWidth="1"
                    className="transition-all duration-700 group-hover/sr:translate-x-[2px] group-hover/sr:translate-y-[-1px]"
                />
                <circle
                    cx={cx}
                    cy={cy + r * 0.35}
                    r={r}
                    fill="rgba(129, 140, 248, 0.08)"
                    stroke="rgba(129, 140, 248, 0.4)"
                    strokeWidth="1"
                    className="transition-all duration-700 group-hover/sr:translate-y-[2px]"
                />
                {/* Center person icon */}
                <circle cx={cx} cy={cy - 1} r={2.5} fill="rgba(129, 140, 248, 0.6)" />
                <path
                    d={`M${cx - 4} ${cy + 4} Q${cx} ${cy + 1} ${cx + 4} ${cy + 4}`}
                    fill="rgba(129, 140, 248, 0.4)"
                />
            </svg>
        </div>
    );
}
