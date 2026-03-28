/**
 * Progress Component
 *
 * Design System: Obsidian Vault
 * Animated progress bars with multiple variants.
 */

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const progressVariants = cva(
  [
    "relative w-full overflow-hidden rounded-full",
    "bg-secondary",
  ],
  {
    variants: {
      size: {
        xs: "h-1",
        sm: "h-1.5",
        default: "h-2",
        lg: "h-3",
        xl: "h-4",
      },
      variant: {
        default: "",
        success: "",
        warning: "",
        destructive: "",
        premium: "",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
);

const indicatorVariants = cva(
  [
    "h-full w-full flex-1",
    "transition-all duration-500 ease-out",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary",
        success: "bg-emerald-500",
        warning: "bg-amber-500",
        destructive: "bg-destructive",
        premium: "bg-gradient-to-r from-amber-500 to-amber-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ProgressProps
  extends Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "value">,
  VariantProps<typeof progressVariants> {
  /**
   * Current progress value (0-100)
   */
  value?: number;
  /**
   * Whether to animate the progress bar on mount
   */
  animated?: boolean;
  /**
   * Whether to show a glow effect
   */
  glow?: boolean;
  /**
   * Whether to show an indeterminate loading state
   */
  indeterminate?: boolean;
}

function Progress({
  className,
  value = 0,
  size,
  variant = "default",
  animated = false,
  glow = false,
  indeterminate = false,
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const [displayValue, setDisplayValue] = React.useState(animated ? 0 : clampedValue);

  React.useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setDisplayValue(clampedValue);
      }, 100);
      return () => clearTimeout(timer);
    }

    setDisplayValue(clampedValue);
    // Explicit return for TS7030
    return undefined;
  }, [clampedValue, animated]);

  const glowColors = {
    default: "shadow-[0_0_10px_rgba(16,185,129,0.3)]",
    success: "shadow-[0_0_10px_rgba(16,185,129,0.3)]",
    warning: "shadow-[0_0_10px_rgba(245,158,11,0.3)]",
    destructive: "shadow-[0_0_10px_rgba(244,63,94,0.3)]",
    premium: "shadow-[0_0_10px_rgba(245,158,11,0.4)]",
  };

  if (indeterminate) {
    return (
      <ProgressPrimitive.Root
        data-slot="progress"
        className={cn(progressVariants({ size, variant }), className)}
        {...props}
      >
        <motion.div
          data-slot="progress-indicator"
          className={cn(
            indicatorVariants({ variant }),
            "absolute",
            glow && glowColors[variant || "default"]
          )}
          style={{ width: "30%" }}
          animate={{
            x: ["-100%", "400%"],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </ProgressPrimitive.Root>
    );
  }

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(progressVariants({ size, variant }), className)}
      value={displayValue}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          indicatorVariants({ variant }),
          glow && glowColors[variant || "default"]
        )}
        style={{ transform: `translateX(-${100 - (displayValue || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

/**
 * Circular Progress - Ring-style progress indicator
 */
interface CircularProgressProps {
  value?: number;
  size?: number;
  strokeWidth?: number;
  variant?: "default" | "success" | "warning" | "destructive" | "premium";
  showValue?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function CircularProgress({
  value = 0,
  size = 64,
  strokeWidth = 4,
  variant = "default",
  showValue = false,
  className,
  children,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  const strokeColors = {
    default: "stroke-primary",
    success: "stroke-emerald-500",
    warning: "stroke-amber-500",
    destructive: "stroke-destructive",
    premium: "stroke-amber-500",
  };

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
      >
        {/* Background circle */}
        <circle
          className="stroke-secondary"
          fill="none"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <motion.circle
          className={cn(strokeColors[variant], "transition-all duration-500")}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          style={{
            strokeDasharray: circumference,
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </svg>
      {/* Center content */}
      {(showValue || children) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children || (
            <span className="text-sm font-medium text-foreground">
              {Math.round(value)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Storage Progress - Specialized for storage usage display
 */
interface StorageProgressProps extends Omit<ProgressProps, "variant"> {
  used: number;
  total: number;
  showLabel?: boolean;
  formatSize?: (bytes: number) => string;
}

function StorageProgress({
  used,
  total,
  showLabel = true,
  formatSize,
  className,
  ...props
}: StorageProgressProps) {
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

  // Determine variant based on usage
  const variant: ProgressProps["variant"] =
    percentage >= 90 ? "destructive" :
      percentage >= 75 ? "warning" :
        "default";

  const defaultFormatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const format = formatSize || defaultFormatSize;

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground-muted">
            {format(used)} / {format(total)}
          </span>
          <span className={cn(
            "font-medium",
            percentage >= 90 && "text-destructive",
            percentage >= 75 && percentage < 90 && "text-amber-500",
            percentage < 75 && "text-foreground-muted"
          )}>
            {percentage}%
          </span>
        </div>
      )}
      <Progress
        value={percentage}
        variant={variant}
        animated
        glow={percentage >= 75}
        {...props}
      />
    </div>
  );
}

export { Progress, CircularProgress, StorageProgress, progressVariants };
