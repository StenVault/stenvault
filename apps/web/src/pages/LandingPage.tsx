/**
 * Landing Page - Route Component
 * This is the page component that wraps the GSAP landing page
 */
import { lazy, Suspense } from 'react';

// Lazy load the landing page for code splitting
const LandingPageComponent = lazy(() =>
    import('@/components/landing-v3').then(module => ({
        default: module.LandingPage
    }))
);

// Loading skeleton
function LandingPageSkeleton() {
    return (
        <div className="min-h-screen bg-[#030303] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                {/* Animated logo */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 flex items-center justify-center animate-pulse">
                    <svg
                        className="w-8 h-8 text-violet-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                    </svg>
                </div>

                {/* Loading text */}
                <div className="flex items-center gap-2 text-neutral-400">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
}

export default function LandingPage() {
    return (
        <Suspense fallback={<LandingPageSkeleton />}>
            <LandingPageComponent />
        </Suspense>
    );
}
