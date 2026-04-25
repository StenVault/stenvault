import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';
import { AuthEyebrow } from './AuthEyebrow';

interface AuthSidePanelProps {
    headline: string;
    eyebrow?: string;
    motif?: ReactNode;
    className?: string;
}

/**
 * Desktop-only companion panel sitting next to AuthCard at lg+ breakpoints.
 * Carries a single brand-voice sentence and an optional subtle motif. The
 * panel is decorative — AuthCard remains the authoritative surface, so this
 * is marked aria-hidden and never receives focus.
 */
export function AuthSidePanel({
    headline,
    eyebrow,
    motif,
    className,
}: AuthSidePanelProps) {
    const reducedMotion = useReducedMotion();

    const initial = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 };
    const animate = reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
    const transition = {
        duration: reducedMotion ? 0.01 : 0.4,
        delay: reducedMotion ? 0 : 0.24,
        ease: [0.16, 1, 0.3, 1] as const,
    };

    return (
        <motion.aside
            aria-hidden="true"
            initial={initial}
            animate={animate}
            transition={transition}
            className={cn(
                // Mirror the card's interior alignment: card content hugs the
                // LEFT of its column, panel content hugs the RIGHT of its own.
                // That splits the visual weight across the 960px track instead
                // of piling everything on the left half, and the panel no
                // longer leans into the card-gap as if magnetised to it.
                //
                // Always cluster at the top of the stretched column so the
                // headline sits on the same baseline as the card's title,
                // regardless of whether a motif is present. Centring on
                // headline-only pages looked balanced in isolation but read
                // as inconsistent next to pages that carry a motif, which is
                // the feedback that drove this back to a single rule.
                // Inner padding mirrors the card's p-10 (40px) so headline +
                // motif sit the same distance from the panel's right edge as
                // "Sign in" sits from the card's left edge. Without this the
                // panel content floats flush with the viewport edge and the
                // two columns read as asymmetric.
                'flex flex-col items-end justify-start gap-6 py-10 pl-2 pr-10 text-right w-full h-full',
                className
            )}
        >
            <div className="space-y-4 max-w-sm">
                {eyebrow && <AuthEyebrow>{eyebrow}</AuthEyebrow>}
                <h2 className="font-display text-2xl lg:text-3xl xl:text-[32px] leading-tight text-white/90 tracking-tight text-balance">
                    {headline}
                </h2>
            </div>

            {motif && (
                <div className="flex items-center justify-end w-full">
                    {motif}
                </div>
            )}
        </motion.aside>
    );
}

export default AuthSidePanel;
