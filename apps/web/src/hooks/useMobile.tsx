import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Hook to detect if the current viewport is mobile-sized.
 * 
 * IMPORTANT: Initializes with actual window width to prevent FOUC
 * (Flash of Unstyled Content) where desktop layout briefly shows on mobile.
 * 
 * @returns boolean - true if viewport width < 768px
 */
export function useIsMobile(): boolean {
  // Initialize with actual value to prevent flash of wrong content
  // Uses function initializer for SSR safety
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    // SSR: default to false (desktop-first for SEO)
    if (typeof window === "undefined") return false;
    // Client: use actual value immediately
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    mql.addEventListener("change", onChange);
    // Sync state in case hydration value differs
    onChange();

    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
