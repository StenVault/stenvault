/**
 * ShieldOrbitIcon — CSS shield with orbiting dots
 */
export function ShieldOrbitIcon({ size = 48 }: { size?: number }) {
    return (
        <div
            className="relative flex items-center justify-center"
            style={{ width: size, height: size }}
        >
            {/* Shield */}
            <svg
                width={size * 0.45}
                height={size * 0.5}
                viewBox="0 0 20 24"
                fill="none"
                className="text-indigo-400 relative z-10"
            >
                <path
                    d="M10 1 L18 5 L18 12 C18 17 14 21 10 23 C6 21 2 17 2 12 L2 5 Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="rgba(99, 102, 241, 0.1)"
                />
                <path
                    d="M7 12 L9 14 L13 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>

            {/* Orbiting dots */}
            <div className="absolute inset-0 animate-orbit-1">
                <div
                    className="absolute w-1.5 h-1.5 rounded-full bg-indigo-400/80"
                    style={{
                        top: '10%',
                        left: '50%',
                        boxShadow: '0 0 6px rgba(99, 102, 241, 0.5)',
                    }}
                />
            </div>
            <div className="absolute inset-0 animate-orbit-2">
                <div
                    className="absolute w-1 h-1 rounded-full bg-violet-400/60"
                    style={{
                        bottom: '15%',
                        right: '15%',
                        boxShadow: '0 0 4px rgba(167, 139, 250, 0.4)',
                    }}
                />
            </div>
            <div className="absolute inset-0 animate-orbit-3">
                <div
                    className="absolute w-1 h-1 rounded-full bg-indigo-300/50"
                    style={{ top: '50%', left: '5%' }}
                />
            </div>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes orbit-1 {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    @keyframes orbit-2 {
                        from { transform: rotate(120deg); }
                        to { transform: rotate(480deg); }
                    }
                    @keyframes orbit-3 {
                        from { transform: rotate(240deg); }
                        to { transform: rotate(600deg); }
                    }
                    .animate-orbit-1 { animation: orbit-1 8s linear infinite; }
                    .animate-orbit-2 { animation: orbit-2 6s linear infinite; }
                    .animate-orbit-3 { animation: orbit-3 10s linear infinite; }
                }
            `}</style>
        </div>
    );
}
