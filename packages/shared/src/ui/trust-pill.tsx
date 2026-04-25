/**
 * TrustPill
 *
 * Small semantic chip used to surface a trust signal — encryption status
 * in the Encryption settings group, "end-to-end encrypted" eyebrow in the
 * chat header, verification badges on trusted contacts.
 *
 * Variants map to the trust-color contract (I15 / P12):
 *   encrypted → gold      (unlocked, ready, primary brand moment)
 *   verified  → sage      (verified, safe, success)
 *   locked    → slate     (locked, inactive)
 *   warning   → amber     (warning, irreversibility, quota approaching)
 *   critical  → burgundy  (critical, unrecoverable, destructive)
 *
 * When `onClick` is provided the pill renders as a `button` with a focus
 * ring, so callers can open a details modal or navigate to a help surface.
 * The pill does NOT own the modal — the caller controls what happens.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../utils/cn";

const trustPillVariants = cva(
  [
    "inline-flex items-center gap-1.5",
    "h-6 px-2.5",
    "rounded-full",
    "text-xs font-medium tracking-normal",
    "transition-colors duration-150",
    "[&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        encrypted: [
          "bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]",
          "text-[var(--theme-primary)]",
          "border border-[color-mix(in_srgb,var(--theme-primary)_20%,transparent)]",
        ],
        verified: [
          "bg-[color-mix(in_srgb,var(--theme-success)_10%,transparent)]",
          "text-[var(--theme-success)]",
          "border border-[color-mix(in_srgb,var(--theme-success)_20%,transparent)]",
        ],
        locked: [
          "bg-[var(--theme-bg-surface)]",
          "text-foreground-muted",
          "border border-[var(--theme-border-strong)]",
        ],
        warning: [
          "bg-[color-mix(in_srgb,var(--theme-warning)_10%,transparent)]",
          "text-[var(--theme-warning)]",
          "border border-[color-mix(in_srgb,var(--theme-warning)_20%,transparent)]",
        ],
        critical: [
          "bg-[color-mix(in_srgb,var(--theme-error)_10%,transparent)]",
          "text-[var(--theme-error)]",
          "border border-[color-mix(in_srgb,var(--theme-error)_20%,transparent)]",
        ],
      },
      interactive: {
        true: [
          "cursor-pointer",
          "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "focus-visible:ring-[var(--theme-primary-a50)]",
          "hover:brightness-110",
        ],
        false: "",
      },
    },
    defaultVariants: {
      variant: "encrypted",
      interactive: false,
    },
  },
);

type TrustPillVariant = NonNullable<VariantProps<typeof trustPillVariants>["variant"]>;

interface TrustPillBaseProps {
  variant?: TrustPillVariant;
  children: React.ReactNode;
  className?: string;
}

interface TrustPillStaticProps
  extends TrustPillBaseProps,
    Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "className"> {
  onClick?: never;
}

interface TrustPillButtonProps
  extends TrustPillBaseProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}

export type TrustPillProps = TrustPillStaticProps | TrustPillButtonProps;

const TrustPill = React.forwardRef<HTMLElement, TrustPillProps>(
  ({ variant, className, children, ...props }, ref) => {
    if ("onClick" in props && props.onClick) {
      const buttonProps = props as TrustPillButtonProps;
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          data-slot="trust-pill"
          className={cn(
            trustPillVariants({ variant, interactive: true }),
            className,
          )}
          {...buttonProps}
        >
          {children}
        </button>
      );
    }

    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        data-slot="trust-pill"
        className={cn(trustPillVariants({ variant }), className)}
        {...(props as React.HTMLAttributes<HTMLSpanElement>)}
      >
        {children}
      </span>
    );
  },
);

TrustPill.displayName = "TrustPill";

export { TrustPill, trustPillVariants };
