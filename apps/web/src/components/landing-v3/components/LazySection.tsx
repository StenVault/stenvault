/**
 * LazySection - Intersection Observer based lazy loading
 */
import { useState, useEffect, useRef, ReactNode, memo, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { LANDING_COLORS } from '../constants';
import { getReducedMotion } from '@/hooks/useReducedMotion';

interface LazySectionProps {
    children: ReactNode;
    fallback?: ReactNode;
    minHeight?: string;
    rootMargin?: string;
    threshold?: number;
    className?: string;
    id?: string;
}

function LazySectionPlaceholder({ minHeight = '400px' }: { minHeight?: string }) {
    const prefersReducedMotion = getReducedMotion();

    return (
        <div
            className="relative overflow-hidden rounded-lg"
            style={{
                minHeight,
                backgroundColor: `${LANDING_COLORS.surface}50`,
            }}
            role="status"
            aria-label="Loading section..."
        >
            {!prefersReducedMotion && (
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(
                            90deg,
                            transparent 0%,
                            ${LANDING_COLORS.surface}80 50%,
                            transparent 100%
                        )`,
                        animation: 'shimmer 1.5s infinite',
                    }}
                />
            )}

            <div className="p-8 space-y-6">
                <div
                    className="h-8 w-1/4 mx-auto rounded-full"
                    style={{ backgroundColor: `${LANDING_COLORS.border}30` }}
                />
                <div
                    className="h-12 w-2/3 mx-auto rounded"
                    style={{ backgroundColor: `${LANDING_COLORS.border}20` }}
                />
                <div
                    className="h-6 w-1/2 mx-auto rounded"
                    style={{ backgroundColor: `${LANDING_COLORS.border}15` }}
                />
            </div>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes shimmer {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                }
            `}</style>
        </div>
    );
}

function LazySectionComponent({
    children,
    fallback,
    minHeight = '400px',
    rootMargin = '200px',
    threshold = 0.1,
    className,
    id,
}: LazySectionProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [hasIntersected, setHasIntersected] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        if (hasIntersected) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry && entry.isIntersecting) {
                    setIsVisible(true);
                    setHasIntersected(true);
                    observer.disconnect();
                }
            },
            {
                rootMargin,
                threshold,
            }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, [rootMargin, threshold, hasIntersected]);

    return (
        <div
            ref={ref}
            id={id}
            className={cn('lazy-section', className)}
            style={{ minHeight: !isVisible ? minHeight : undefined }}
        >
            {isVisible ? (
                <Suspense fallback={fallback || <LazySectionPlaceholder minHeight={minHeight} />}>
                    {children}
                </Suspense>
            ) : (
                fallback || <LazySectionPlaceholder minHeight={minHeight} />
            )}
        </div>
    );
}

export const LazySection = memo(LazySectionComponent);
export default LazySection;
