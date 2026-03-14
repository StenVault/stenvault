/**
 * DeviceHandshakeIcon — CSS device handshake line animation
 */
export function DeviceHandshakeIcon({ size = 48 }: { size?: number }) {
    return (
        <div
            className="relative flex items-center justify-center"
            style={{ width: size, height: size }}
        >
            {/* Left device */}
            <svg
                width={size * 0.3}
                height={size * 0.45}
                viewBox="0 0 12 18"
                fill="none"
                className="text-indigo-400"
            >
                <rect
                    x="1"
                    y="1"
                    width="10"
                    height="16"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                />
                <line x1="4" y1="15" x2="8" y2="15" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>

            {/* Connection line with traveling dot */}
            <div className="relative w-4 h-px mx-0.5">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/40 to-indigo-500/40" />
                <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-handshake-pulse"
                    style={{ boxShadow: '0 0 6px rgba(99, 102, 241, 0.6)' }}
                />
            </div>

            {/* Right device */}
            <svg
                width={size * 0.3}
                height={size * 0.45}
                viewBox="0 0 12 18"
                fill="none"
                className="text-indigo-400"
            >
                <rect
                    x="1"
                    y="1"
                    width="10"
                    height="16"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                />
                <line x1="4" y1="15" x2="8" y2="15" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes handshake-pulse {
                        0% { left: 0; opacity: 0; }
                        20% { opacity: 1; }
                        80% { opacity: 1; }
                        100% { left: calc(100% - 6px); opacity: 0; }
                    }
                    .animate-handshake-pulse {
                        animation: handshake-pulse 1.5s ease-in-out infinite;
                    }
                }
            `}</style>
        </div>
    );
}
