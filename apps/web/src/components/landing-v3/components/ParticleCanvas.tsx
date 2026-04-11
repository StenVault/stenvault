/**
 * ParticleCanvas — Reusable canvas wrapper with rAF loop
 *
 * Features:
 * - ResizeObserver for responsive sizing
 * - IntersectionObserver pause/resume (off-screen = no rAF)
 * - Mouse tracking (optional)
 * - DPR scaling capped at 2x
 * - prefers-reduced-motion: render single static frame
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { getReducedMotion } from '@/hooks/useReducedMotion';

interface ParticleCanvasProps {
    /** Called every animation frame. Return false to stop the loop. */
    onDraw: (
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        mouseX: number,
        mouseY: number,
        time: number,
    ) => void;
    /** Called on resize with new dimensions */
    onResize?: (width: number, height: number) => void;
    /** Enable mouse tracking */
    trackMouse?: boolean;
    /** Additional class names */
    className?: string;
    /** CSS z-index style */
    style?: React.CSSProperties;
}

export function ParticleCanvas({
    onDraw,
    onResize,
    trackMouse = false,
    className = '',
    style,
}: ParticleCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const mouseRef = useRef({ x: 0, y: 0, active: false });
    const visibleRef = useRef(true);
    const sizeRef = useRef({ w: 0, h: 0 });

    // Stable references
    const onDrawRef = useRef(onDraw);
    onDrawRef.current = onDraw;
    const onResizeRef = useRef(onResize);
    onResizeRef.current = onResize;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const reducedMotion = getReducedMotion();

        function resize() {
            const rect = canvas!.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;
            canvas!.width = w * dpr;
            canvas!.height = h * dpr;
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
            sizeRef.current = { w, h };
            onResizeRef.current?.(w, h);
        }

        resize();

        // ResizeObserver
        const ro = new ResizeObserver(() => resize());
        ro.observe(canvas);

        // IntersectionObserver — pause when off-screen
        const io = new IntersectionObserver(
            ([entry]) => {
                visibleRef.current = entry?.isIntersecting ?? true;
            },
            { threshold: 0 },
        );
        io.observe(canvas);

        // Mouse tracking
        function onMouseMove(e: MouseEvent) {
            if (!trackMouse) return;
            const rect = canvas!.getBoundingClientRect();
            mouseRef.current.x = e.clientX - rect.left;
            mouseRef.current.y = e.clientY - rect.top;
            mouseRef.current.active = true;
        }
        function onMouseLeave() {
            mouseRef.current.active = false;
        }

        if (trackMouse) {
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseleave', onMouseLeave);
        }

        if (reducedMotion) {
            // Single static frame
            requestAnimationFrame((time) => {
                onDrawRef.current(
                    ctx!,
                    sizeRef.current.w,
                    sizeRef.current.h,
                    0,
                    0,
                    time,
                );
            });
        } else {
            // Animation loop
            function loop(time: number) {
                if (visibleRef.current) {
                    onDrawRef.current(
                        ctx!,
                        sizeRef.current.w,
                        sizeRef.current.h,
                        mouseRef.current.x,
                        mouseRef.current.y,
                        time,
                    );
                }
                rafRef.current = requestAnimationFrame(loop);
            }
            rafRef.current = requestAnimationFrame(loop);
        }

        return () => {
            cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            io.disconnect();
            if (trackMouse) {
                canvas.removeEventListener('mousemove', onMouseMove);
                canvas.removeEventListener('mouseleave', onMouseLeave);
            }
        };
    }, [trackMouse]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            role="presentation"
            className={`absolute inset-0 w-full h-full ${trackMouse ? 'pointer-events-auto' : 'pointer-events-none'} ${className}`}
            style={style}
        />
    );
}
