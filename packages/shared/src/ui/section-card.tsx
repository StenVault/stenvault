/**
 * SectionCard — canonical settings/feature card primitive.
 *
 * Layout (Stripe / Vercel / Linear convention):
 *
 *   [icon] Title                    [optional badge / control]
 *   Body description spans the full width of the card.
 *   [Action button(s)]
 *   {children — nested lists, info boxes, stats blocks}
 *
 * Width-resilient by construction: the title and the action never share
 * the same horizontal lane, so card chrome stops fighting itself in
 * narrow viewports. Replaces the older [icon-left + title-middle +
 * action-right] flex pattern that broke once titles or buttons grew
 * past their share of the column.
 *
 * Use this component for every settings section, and for any "feature
 * card" with the same shape elsewhere in the app. Authors do not pick
 * a layout — they fill in slots — so the pattern can't drift back.
 */

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { type VariantProps } from "class-variance-authority";

import { AuroraCard, auroraCardVariants } from "./aurora-card";
import { cn } from "../utils/cn";

type AuroraCardVariant = VariantProps<typeof auroraCardVariants>["variant"];

export interface SectionCardProps {
    /** Inline 16px icon rendered to the left of the title. Optional. */
    icon?: LucideIcon;
    /** Tailwind class controlling the icon colour (e.g. "text-[var(--theme-info)]"). Defaults to muted. */
    iconClassName?: string;
    /** Inline style for icon colour — use when the colour comes from a runtime theme value. */
    iconStyle?: React.CSSProperties;
    /** Title text. Rendered as h3 at 16px sans semibold (body inherit). */
    title: React.ReactNode;
    /** Optional element pinned to the right of the title row (Badge, Switch, Select, count). */
    badge?: React.ReactNode;
    /** Body description. Plain string renders as muted <p>; ReactNode renders as-is. */
    description?: React.ReactNode;
    /** Action area at the bottom — typically a Button or button group. */
    action?: React.ReactNode;
    /** Extra content rendered below the action — nested device lists, fingerprint blocks, info boxes. */
    children?: React.ReactNode;
    /** AuroraCard variant pass-through. */
    variant?: AuroraCardVariant;
    /** Pass-through className on the card root. */
    className?: string;
}

export function SectionCard({
    icon: Icon,
    iconClassName,
    iconStyle,
    title,
    badge,
    description,
    action,
    children,
    variant = "default",
    className,
}: SectionCardProps) {
    return (
        <AuroraCard variant={variant} className={className}>
            <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {Icon ? (
                        <Icon
                            aria-hidden="true"
                            // Muted colour is the always-on default; iconClassName composes
                            // with it via twMerge so a consumer that only wants to swap the
                            // colour passes `text-[var(--theme-info)]`, while a consumer that
                            // wants additional non-colour classes still inherits the default.
                            className={cn(
                                "w-4 h-4 shrink-0 text-[var(--theme-fg-muted)]",
                                iconClassName
                            )}
                            style={iconStyle}
                        />
                    ) : null}
                    <h3 className="font-semibold text-base text-foreground">{title}</h3>
                    {badge ? <span className="ml-auto inline-flex items-center">{badge}</span> : null}
                </div>

                {description ? (
                    typeof description === "string" ? (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    ) : (
                        description
                    )
                ) : null}

                {action ? <div>{action}</div> : null}

                {children}
            </div>
        </AuroraCard>
    );
}
