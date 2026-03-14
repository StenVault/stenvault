/**
 * KeyIcon — CSS rotating/glowing key animation
 */
export function KeyIcon({ size = 48 }: { size?: number }) {
    return (
        <div
            className="relative flex items-center justify-center"
            style={{ width: size, height: size }}
        >
            <div className="animate-key-float">
                <svg
                    width={size * 0.6}
                    height={size * 0.6}
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                >
                    <circle
                        cx="8"
                        cy="8"
                        r="5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                    />
                    <circle cx="8" cy="8" r="2" fill="currentColor" opacity={0.3} />
                    <line
                        x1="12"
                        y1="12"
                        x2="20"
                        y2="20"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                    <line
                        x1="17"
                        y1="17"
                        x2="19"
                        y2="15"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
            {/* Glow pulse */}
            <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-pulse-slow" />

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes key-float {
                        0%, 100% { transform: rotate(-5deg) translateY(0); }
                        50% { transform: rotate(5deg) translateY(-2px); }
                    }
                    .animate-key-float {
                        animation: key-float 3s ease-in-out infinite;
                    }
                    @keyframes pulse-slow {
                        0%, 100% { opacity: 0.3; transform: scale(0.8); }
                        50% { opacity: 0.6; transform: scale(1.1); }
                    }
                    .animate-pulse-slow {
                        animation: pulse-slow 2.5s ease-in-out infinite;
                    }
                }
            `}</style>
        </div>
    );
}
