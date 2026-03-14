/**
 * ResponsivePage - Automatically selects mobile or desktop page
 * 
 * Renders mobile-v2 pages on mobile devices, desktop pages otherwise.
 */

import { useIsMobile } from "@/hooks/useMobile";
import { ComponentType, ReactNode } from "react";

interface ResponsivePageProps {
    /** Mobile version of the page */
    MobileComponent: ComponentType;
    /** Desktop version of the page (children) */
    children: ReactNode;
}

export function ResponsivePage({ MobileComponent, children }: ResponsivePageProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <MobileComponent />;
    }

    return <>{children}</>;
}

export default ResponsivePage;
