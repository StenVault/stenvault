/**
 * EncryptUploadIcon — Mini canvas: document particles scatter/reform on hover
 */
import { useRef, useEffect, useState, useCallback } from 'react';

export function EncryptUploadIcon({ size = 48 }: { size?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hovered, setHovered] = useState(false);
    const particlesRef = useRef<{ x: number; y: number; tx: number; ty: number; ox: number; oy: number }[]>([]);
    const rafRef = useRef(0);

    useEffect(() => {
        const particles: typeof particlesRef.current = [];
        // Create a grid of particles forming a document shape
        const cols = 6;
        const rows = 8;
        const padX = size * 0.2;
        const padY = size * 0.1;
        const cellW = (size - padX * 2) / cols;
        const cellH = (size - padY * 2) / rows;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Skip top-right corner for fold
                if (r < 2 && c > cols - 3) continue;
                const x = padX + c * cellW + cellW / 2;
                const y = padY + r * cellH + cellH / 2;
                particles.push({ x, y, tx: x, ty: y, ox: x, oy: y });
            }
        }
        particlesRef.current = particles;
    }, [size]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);

        const particles = particlesRef.current;
        let needsUpdate = false;

        for (const p of particles) {
            if (hovered) {
                // Scatter targets
                p.tx = size * 0.1 + Math.random() * size * 0.8;
                p.ty = size * 0.1 + Math.random() * size * 0.8;
            } else {
                p.tx = p.ox;
                p.ty = p.oy;
            }

            // Lerp
            p.x += (p.tx - p.x) * 0.12;
            p.y += (p.ty - p.y) * 0.12;

            if (Math.abs(p.x - p.tx) > 0.3 || Math.abs(p.y - p.ty) > 0.3) {
                needsUpdate = true;
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = hovered
                ? 'rgba(99, 102, 241, 0.9)'
                : 'rgba(129, 140, 248, 0.7)';
            ctx.fill();
        }

        if (needsUpdate) {
            rafRef.current = requestAnimationFrame(draw);
        }
    }, [hovered, size]);

    useEffect(() => {
        // Set scatter targets once when hover changes
        const particles = particlesRef.current;
        if (hovered) {
            for (const p of particles) {
                p.tx = size * 0.1 + Math.random() * size * 0.8;
                p.ty = size * 0.1 + Math.random() * size * 0.8;
            }
        } else {
            for (const p of particles) {
                p.tx = p.ox;
                p.ty = p.oy;
            }
        }
        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [hovered, draw, size]);

    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="cursor-pointer"
            style={{ width: size, height: size }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        />
    );
}
