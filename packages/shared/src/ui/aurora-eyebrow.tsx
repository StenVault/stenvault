/**
 * AuroraEyebrow
 *
 * Sentence-case small label used above sections, KPI captions,
 * and trust-signal sub-headings. Replaces the UPPERCASE tracking-wide
 * eyebrow pattern (P6.3, section 4.13 — no UPPERCASE eyebrows).
 *
 * Role | Inter 12px / 500 / tracking-normal / sentence case
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../utils/cn";

const auroraEyebrowVariants = cva(
  [
    "text-xs font-medium tracking-normal",
    "leading-4",
    "inline-flex items-center gap-1.5",
  ],
  {
    variants: {
      tone: {
        default: "text-foreground-secondary",
        muted: "text-foreground-muted",
        verified: "text-[var(--theme-success)]",
        warning: "text-[var(--theme-warning)]",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export interface AuroraEyebrowProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof auroraEyebrowVariants> {}

const AuroraEyebrow = React.forwardRef<HTMLSpanElement, AuroraEyebrowProps>(
  ({ className, tone, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        data-slot="aurora-eyebrow"
        className={cn(auroraEyebrowVariants({ tone }), className)}
        {...props}
      >
        {children}
      </span>
    );
  },
);

AuroraEyebrow.displayName = "AuroraEyebrow";

export { AuroraEyebrow, auroraEyebrowVariants };
