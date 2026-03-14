import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Button Variants
 *
 * Design System: Nocturne
 * - Primary: Gold accent with luxurious glow
 * - Secondary: Subtle, elevated background
 * - Ghost: Transparent with elegant hover
 * - Outline: Border only, refined look
 * - Destructive: Burgundy for dangerous actions
 * - Premium: Gold gradient for special actions
 */
const buttonVariants = cva(
  [
    // Base styles
    "inline-flex items-center justify-center gap-2",
    "whitespace-nowrap font-medium",
    "transition-all duration-200",
    // Focus styles - Gold ring
    "outline-none focus-visible:ring-2 focus-visible:ring-[rgba(212,175,55,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // Disabled styles
    "disabled:pointer-events-none disabled:opacity-50",
    // Icon handling
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
    // Accessibility
    "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  ],
  {
    variants: {
      variant: {
        // Primary - Gold with luxurious glow
        default: [
          "bg-primary text-primary-foreground font-semibold",
          "hover:bg-primary-hover",
          "active:bg-primary-active",
          "shadow-sm",
          "hover:shadow-[0_0_20px_rgba(212,175,55,0.25)]",
        ],

        // Destructive - Burgundy accent
        destructive: [
          "bg-destructive text-destructive-foreground",
          "hover:bg-destructive-hover",
          "shadow-sm hover:shadow-[0_0_15px_rgba(199,80,80,0.2)]",
        ],

        // Outline - Refined border with gold hover
        outline: [
          "border border-border bg-transparent",
          "hover:bg-secondary hover:border-[rgba(212,175,55,0.3)]",
          "hover:shadow-[0_0_15px_rgba(212,175,55,0.1)]",
          "text-foreground",
        ],

        // Secondary - Subtle elevated
        secondary: [
          "bg-secondary text-secondary-foreground",
          "hover:bg-secondary-hover",
          "border border-border",
          "hover:border-border-strong",
        ],

        // Ghost - Minimal with elegant hover
        ghost: [
          "bg-transparent",
          "hover:bg-secondary",
          "text-foreground-muted hover:text-foreground",
        ],

        // Link - Text only with underline
        link: [
          "text-primary underline-offset-4",
          "hover:underline hover:text-primary-hover",
          "p-0 h-auto",
        ],

        // Premium - Luxurious gold gradient with glow
        premium: [
          "relative overflow-hidden",
          "bg-gradient-to-r from-[var(--gold-500)] via-[var(--gold-400)] to-[var(--gold-500)]",
          "text-[var(--nocturne-950)] font-semibold",
          "shadow-[0_0_20px_rgba(212,175,55,0.3)]",
          "hover:shadow-[0_0_30px_rgba(212,175,55,0.4)]",
          "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
          "before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700",
        ],

        // Glass - Glassmorphism
        glass: [
          "bg-white/10 backdrop-blur-md",
          "border border-white/20",
          "text-foreground",
          "hover:bg-white/15",
          "active:bg-white/20",
        ],

        // Glow - Attention grabbing
        glow: [
          "bg-primary text-primary-foreground",
          "shadow-[0_0_20px_var(--theme-glow)]",
          "hover:shadow-[0_0_35px_var(--theme-glow-strong)]",
          "hover:-translate-y-0.5 active:translate-y-0",
        ],

        // Success - Sage green
        success: [
          "bg-success text-success-foreground",
          "hover:bg-[var(--sage-500)]",
          "shadow-sm hover:shadow-[0_0_15px_rgba(61,153,112,0.2)]",
        ],
      },

      size: {
        default: "h-10 px-4 py-2 text-sm rounded-lg",
        sm: "h-8 px-3 text-xs rounded-md gap-1.5",
        lg: "h-12 px-6 text-base rounded-lg",
        xl: "h-14 px-8 text-lg rounded-xl",
        icon: "size-10 rounded-lg",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-12 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

// Motion configuration for button animations
const buttonMotion = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: springs.snappy,
};

// Non-animated button motion (for reduced motion or asChild)
const noMotion = {
  whileHover: undefined,
  whileTap: undefined,
  transition: undefined,
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * If true, the button will render as a Slot (useful for wrapping links)
   */
  asChild?: boolean;
  /**
   * If true, disables hover/tap animations
   */
  disableAnimation?: boolean;
  /**
   * If true, shows a loading spinner
   */
  loading?: boolean;
}

/**
 * Button Component
 *
 * A versatile button with multiple variants, sizes, and built-in animations.
 * Supports the asChild pattern for composing with other components.
 *
 * @example
 * ```tsx
 * <Button>Click me</Button>
 * <Button variant="outline" size="lg">Large Outline</Button>
 * <Button asChild><a href="/link">Link Button</a></Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      disableAnimation = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // Use Slot when asChild is true (no animation in this case)
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    // Determine if we should animate
    const prefersReducedMotion = useReducedMotion();
    const shouldAnimate = !disableAnimation && !disabled && !loading && !prefersReducedMotion;
    const motionProps = shouldAnimate ? buttonMotion : noMotion;

    return (
      <motion.button
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...motionProps}
        {...(props as HTMLMotionProps<"button">)}
      >
        {loading ? (
          <>
            <LoadingSpinner className="size-4" />
            <span className="sr-only">Loading...</span>
            {children}
          </>
        ) : (
          children
        )}
      </motion.button>
    );
  }
);

Button.displayName = "Button";

/**
 * Loading Spinner for Button
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <motion.svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </motion.svg>
  );
}

/**
 * Button Group Component
 *
 * Groups buttons together with consistent spacing and optional connected styling.
 */
interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * If true, buttons will be visually connected
   */
  connected?: boolean;
  /**
   * Orientation of the button group
   */
  orientation?: "horizontal" | "vertical";
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  (
    { className, connected = false, orientation = "horizontal", ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        role="group"
        className={cn(
          "inline-flex",
          orientation === "vertical" ? "flex-col" : "flex-row",
          connected
            ? [
                "[&>button]:rounded-none",
                orientation === "horizontal"
                  ? "[&>button:first-child]:rounded-l-lg [&>button:last-child]:rounded-r-lg [&>button:not(:last-child)]:border-r-0"
                  : "[&>button:first-child]:rounded-t-lg [&>button:last-child]:rounded-b-lg [&>button:not(:last-child)]:border-b-0",
              ]
            : "gap-2",
          className
        )}
        {...props}
      />
    );
  }
);

ButtonGroup.displayName = "ButtonGroup";

export { Button, ButtonGroup, buttonVariants };
