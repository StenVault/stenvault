/**
 * ThreatBreach — Grid of squares where some turn red and "leak" down
 */
import { useRef, useEffect, useState } from 'react';

const GRID_COLS = 8;
const GRID_ROWS = 4;

export function ThreatBreach() {
    const [inView, setInView] = useState(false);
    const [breached, setBreached] = useState<Set<number>>(new Set());
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

    useEffect(() => {
        if (!inView) return;

        const total = GRID_COLS * GRID_ROWS;
        const breachCount = Math.floor(total * 0.3);
        const indices = Array.from({ length: total }, (_, i) => i)
            .sort(() => Math.random() - 0.5)
            .slice(0, breachCount);

        const timeouts: number[] = [];
        indices.forEach((idx, i) => {
            timeouts.push(
                window.setTimeout(() => {
                    setBreached((prev) => new Set(prev).add(idx));
                }, 500 + i * 200),
            );
        });

        return () => timeouts.forEach(clearTimeout);
    }, [inView]);

    return (
        <div ref={ref} className="relative w-full h-32 flex items-center justify-center">
            <div
                className="grid gap-1.5"
                style={{
                    gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                    width: 'min(100%, 260px)',
                }}
            >
                {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
                    const isBreach = breached.has(i);
                    return (
                        <div
                            key={i}
                            className="aspect-square rounded-sm transition-all duration-500"
                            style={{
                                backgroundColor: isBreach
                                    ? 'rgba(239, 68, 68, 0.3)'
                                    : 'rgba(51, 65, 85, 0.3)',
                                boxShadow: isBreach
                                    ? '0 0 8px rgba(239, 68, 68, 0.2), 0 4px 8px rgba(239, 68, 68, 0.15)'
                                    : 'none',
                                transform: isBreach ? 'translateY(2px)' : 'none',
                                border: `1px solid ${isBreach ? 'rgba(239, 68, 68, 0.2)' : 'rgba(51, 65, 85, 0.2)'}`,
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
