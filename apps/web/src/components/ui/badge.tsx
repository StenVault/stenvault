/**
 * Badge Component
 *
 * Design System: Obsidian Vault
 * Small status indicators and labels.
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    // Base styles
    "inline-flex items-center justify-center",
    "gap-1.5",
    "whitespace-nowrap",
    "font-medium",
    "transition-colors",
    // Size
    "px-2.5 py-0.5",
    "text-xs",
    "rounded-md",
    // Border
    "border",
    // Icons
    "[&>svg]:size-3 [&>svg]:pointer-events-none [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Primary - Emerald
        default: [
          "bg-primary/10 text-primary border-primary/20",
          "hover:bg-primary/20",
        ],

        // Secondary - Subtle
        secondary: [
          "bg-secondary text-secondary-foreground border-border",
          "hover:bg-secondary/80",
        ],

        // Destructive - Rose
        destructive: [
          "bg-destructive/10 text-destructive border-destructive/20",
          "hover:bg-destructive/20",
        ],

        // Outline - Border only
        outline: [
          "bg-transparent text-foreground border-border",
          "hover:bg-secondary",
        ],

        // Success - Emerald solid
        success: [
          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          "hover:bg-emerald-500/20",
        ],

        // Warning - Amber
        warning: [
          "bg-amber-500/10 text-amber-400 border-amber-500/20",
          "hover:bg-amber-500/20",
        ],

        // Info - Sky
        info: [
          "bg-sky-500/10 text-sky-400 border-sky-500/20",
          "hover:bg-sky-500/20",
        ],

        // Premium - Amber gradient
        premium: [
          "bg-gradient-to-r from-amber-500/10 to-amber-600/10",
          "text-amber-400 border-amber-500/20",
          "hover:from-amber-500/20 hover:to-amber-600/20",
        ],
      },

      size: {
        sm: "px-2 py-0 text-[10px]",
        default: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /**
   * If true, renders as a Slot for composition
   */
  asChild?: boolean;
}

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

/**
 * Status Badge with dot indicator
 */
interface StatusBadgeProps extends Omit<BadgeProps, "children"> {
  status: "online" | "offline" | "busy" | "away";
  label?: string;
}

function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  const statusConfig = {
    online: {
      color: "bg-emerald-500",
      text: label || "Online",
      variant: "success" as const,
    },
    offline: {
      color: "bg-slate-500",
      text: label || "Offline",
      variant: "secondary" as const,
    },
    busy: {
      color: "bg-rose-500",
      text: label || "Busy",
      variant: "destructive" as const,
    },
    away: {
      color: "bg-amber-500",
      text: label || "Away",
      variant: "warning" as const,
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={className} {...props}>
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            config.color
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            config.color
          )}
        />
      </span>
      {config.text}
    </Badge>
  );
}

/**
 * Count Badge - For notification counts
 */
interface CountBadgeProps extends Omit<BadgeProps, "children"> {
  count: number;
  max?: number;
}

function CountBadge({ count, max = 99, className, ...props }: CountBadgeProps) {
  const displayCount = count > max ? `${max}+` : count;

  return (
    <Badge
      variant="destructive"
      size="sm"
      className={cn(
        "min-w-[1.25rem] h-5 px-1 rounded-full justify-center",
        className
      )}
      {...props}
    >
      {displayCount}
    </Badge>
  );
}

export { Badge, StatusBadge, CountBadge, badgeVariants };
