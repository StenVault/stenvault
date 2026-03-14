/**
 * ThreatAccess — Concentric rings peeling away on scroll
 */
import { useRef, useEffect, useState } from 'react';

export function ThreatAccess() {
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

    const rings = [
        { r: 44, delay: '0s', color: 'rgba(239, 68, 68, 0.12)' },
        { r: 34, delay: '0.3s', color: 'rgba(239, 68, 68, 0.18)' },
        { r: 24, delay: '0.6s', color: 'rgba(239, 68, 68, 0.25)' },
    ];

    return (
        <div ref={ref} className="relative w-full h-32 flex items-center justify-center">
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
                {rings.map((ring, i) => (
                    <circle
                        key={i}
                        cx="48"
                        cy="48"
                        r={ring.r}
                        stroke={ring.color}
                        strokeWidth="1.5"
                        fill="none"
                        className="transition-all duration-1000"
                        style={{
                            transitionDelay: ring.delay,
                            opacity: inView ? 1 : 0,
                            transform: inView
                                ? `scale(${1 + i * 0.08}) translateX(${i * 3}px)`
                                : 'scale(1)',
                            transformOrigin: 'center',
                            strokeDasharray: inView ? `${ring.r * 0.8} ${ring.r * 0.4}` : `${ring.r * Math.PI * 2}`,
                        }}
                    />
                ))}
                {/* Center lock that "breaks" */}
                <rect
                    x="40"
                    y="40"
                    width="16"
                    height="14"
                    rx="2"
                    stroke="rgba(239, 68, 68, 0.4)"
                    strokeWidth="1.2"
                    fill="rgba(239, 68, 68, 0.06)"
                />
                <path
                    d="M44 40 V36 A4 4 0 0 1 52 36 V40"
                    stroke="rgba(239, 68, 68, 0.4)"
                    strokeWidth="1.2"
                    fill="none"
                    className="transition-all duration-700"
                    style={{
                        transitionDelay: '0.8s',
                        transform: inView ? 'rotate(15deg)' : 'rotate(0)',
                        transformOrigin: '52px 40px',
                    }}
                />
            </svg>
        </div>
    );
}
