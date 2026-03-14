/**
 * ZeroKnowledgeIcon — CSS split view (client clear / server blurred)
 */
export function ZeroKnowledgeIcon({ size = 48 }: { size?: number }) {
    return (
        <div
            className="relative flex items-center justify-center overflow-hidden rounded-lg"
            style={{ width: size, height: size }}
        >
            {/* Left half — clear (client side) */}
            <div className="absolute left-0 top-0 w-1/2 h-full flex flex-col items-center justify-center gap-0.5 bg-indigo-500/5">
                <div className="w-4 h-0.5 rounded bg-indigo-400/60" />
                <div className="w-3 h-0.5 rounded bg-indigo-400/40" />
                <div className="w-3.5 h-0.5 rounded bg-indigo-400/50" />
                <div className="mt-1 text-[6px] font-mono text-indigo-400/50">YOU</div>
            </div>

            {/* Divider */}
            <div className="absolute left-1/2 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-indigo-500/30 to-transparent" />

            {/* Right half — blurred (server side) */}
            <div className="absolute right-0 top-0 w-1/2 h-full flex flex-col items-center justify-center gap-0.5 bg-slate-800/30">
                <div className="w-4 h-0.5 rounded bg-slate-600/40 blur-[1px]" />
                <div className="w-3 h-0.5 rounded bg-slate-600/30 blur-[1px]" />
                <div className="w-3.5 h-0.5 rounded bg-slate-600/35 blur-[1px]" />
                <div className="mt-1 text-[6px] font-mono text-slate-600/50">
                    <span className="blur-[2px]">???</span>
                </div>
            </div>

            {/* Lock overlay on server side */}
            <div className="absolute right-[15%] bottom-[15%]">
                <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
                    <rect x="0.5" y="4" width="7" height="5.5" rx="1" stroke="rgba(100,116,139,0.4)" strokeWidth="0.8" />
                    <path d="M2.5 4 V2.5 A1.5 1.5 0 0 1 5.5 2.5 V4" stroke="rgba(100,116,139,0.4)" strokeWidth="0.8" fill="none" />
                </svg>
            </div>
        </div>
    );
}
