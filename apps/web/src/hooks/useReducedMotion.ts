/**
 * useReducedMotion - Accessibility hook for respecting user's motion preferences
 * 
 * Returns true if user prefers reduced motion (e.g., vestibular disorders, epilepsy)
 * Animations should be reduced or disabled when this returns true.
 * 
 * Usage:
 * const prefersReducedMotion = useReducedMotion();
 * if (prefersReducedMotion) gsap.set(element, { opacity: 1 }); // Snap, don't animate
 */
import { useState, useEffect } from 'react';

export function useReducedMotion(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
        // SSR-safe initial value
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        // Set initial value
        setPrefersReducedMotion(mediaQuery.matches);

        // Listen for changes (user can toggle in OS settings)
        const handleChange = (event: MediaQueryListEvent) => {
            setPrefersReducedMotion(event.matches);
        };

        // Modern browsers
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }

        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    return prefersReducedMotion;
}

/**
 * Get reduced motion preference (non-hook version for use in callbacks)
 * Use this when you need to check preference in event handlers or GSAP callbacks
 */
export function getReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default useReducedMotion;
