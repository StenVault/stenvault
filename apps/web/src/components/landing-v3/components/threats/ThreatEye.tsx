/**
 * ThreatEye — Animated scanning eye with beam sweep
 */
import { useRef, useEffect, useState } from 'react';

export function ThreatEye() {
    const [inView, setInView] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => { if (entry?.isIntersecting) { setInView(true); io.disconnect(); } },
            { threshold: 0.3 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className="relative w-full h-32 flex items-center justify-center overflow-hidden"
        >
            {/* Eye */}
            <svg
                width="80"
                height="48"
                viewBox="0 0 80 48"
                fill="none"
                className={`transition-opacity duration-500 ${inView ? 'opacity-100' : 'opacity-0'}`}
            >
                {/* Eye outline */}
                <path
                    d="M4 24 C4 24 20 6 40 6 C60 6 76 24 76 24 C76 24 60 42 40 42 C20 42 4 24 4 24 Z"
                    stroke="rgba(239, 68, 68, 0.5)"
                    strokeWidth="1.5"
                    fill="rgba(239, 68, 68, 0.05)"
                />
                {/* Iris */}
                <circle cx="40" cy="24" r="10" stroke="rgba(239, 68, 68, 0.6)" strokeWidth="1.5" fill="rgba(239, 68, 68, 0.08)" />
                {/* Pupil */}
                <circle cx="40" cy="24" r="4" fill="rgba(239, 68, 68, 0.4)">
                    {inView && (
                        <animate attributeName="r" values="4;5;4" dur="2s" repeatCount="indefinite" />
                    )}
                </circle>
            </svg>

            {/* Scanning beam */}
            {inView && (
                <div
                    className="absolute top-0 h-full w-12 pointer-events-none animate-scan-sweep"
                    style={{
                        background: 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.08), transparent)',
                    }}
                />
            )}

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes scan-sweep {
                        0% { left: -48px; }
                        100% { left: calc(100% + 48px); }
                    }
                    .animate-scan-sweep {
                        animation: scan-sweep 3s ease-in-out infinite;
                    }
                }
            `}</style>
        </div>
    );
}
