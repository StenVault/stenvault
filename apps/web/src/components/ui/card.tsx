import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { springs } from "@/lib/motion";

/**
 * Card Variants
 *
 * Design System: Nocturne
 * - Default: Standard elevated card with subtle border
 * - Glass: Premium glassmorphism with gold accents
 * - Elevated: Higher elevation with luxurious shadow
 * - Interactive: Hover effects with gold glow
 * - Ghost: Minimal, no background
 * - Premium: Gold-accented with shimmer effect
 */
const cardVariants = cva(
  [
    "flex flex-col",
    "rounded-xl",
    "text-card-foreground",
  ],
  {
    variants: {
      variant: {
        // Default - Standard card with refined border
        default: [
          "bg-card",
          "border border-border",
        ],

        // Glass - Premium glassmorphism with depth
        glass: [
          "bg-[rgba(22,26,35,0.7)]",
          "backdrop-blur-xl backdrop-saturate-[180%]",
          "border border-[rgba(180,192,212,0.08)]",
          "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
        ],

        // Glass Gold - Premium glass with gold accent
        "glass-gold": [
          "bg-[rgba(13,15,20,0.8)]",
          "backdrop-blur-xl backdrop-saturate-[180%]",
          "border border-[rgba(212,175,55,0.12)]",
          "shadow-[inset_0_0_0_1px_rgba(212,175,55,0.05),0_8px_32px_rgba(0,0,0,0.3)]",
          "hover:border-[rgba(212,175,55,0.25)]",
          "hover:shadow-[inset_0_0_0_1px_rgba(212,175,55,0.1),0_0_30px_rgba(212,175,55,0.1),0_8px_32px_rgba(0,0,0,0.4)]",
          "transition-all duration-300",
        ],

        // Elevated - Higher elevation with depth
        elevated: [
          "bg-card",
          "border border-border",
          "shadow-[0_8px_30px_-10px_rgba(0,0,0,0.5)]",
        ],

        // Interactive - For clickable cards with gold hover
        interactive: [
          "bg-card",
          "border border-border",
          "transition-all duration-300 ease-out",
          "hover:border-[rgba(212,175,55,0.2)]",
          "hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4),0_0_30px_rgba(212,175,55,0.08)]",
          "cursor-pointer",
        ],

        // Ghost - Minimal styling
        ghost: [
          "bg-transparent",
          "border-none",
        ],

        // Accent - With gold border accent
        accent: [
          "bg-card",
          "border border-[rgba(212,175,55,0.2)]",
          "shadow-[0_0_20px_rgba(212,175,55,0.05)]",
        ],

        // Premium - Luxurious with gold shimmer
        premium: [
          "relative overflow-hidden",
          "bg-gradient-to-br from-[var(--nocturne-800)] via-[var(--nocturne-800)] to-[var(--nocturne-900)]",
          "border border-[rgba(212,175,55,0.15)]",
          "shadow-[0_0_30px_rgba(212,175,55,0.1),0_10px_40px_-15px_rgba(0,0,0,0.5)]",
          "before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(212,175,55,0.08),transparent_50%)]",
          "before:pointer-events-none",
        ],
      },
      padding: {
        none: "",
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "none",
    },
  }
);

// Motion configuration for interactive cards
const cardMotion = {
  whileHover: { y: -4, scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: springs.snappy,
};

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /**
   * If true, enables hover/tap animations
   */
  animated?: boolean;
  /**
   * If true, card will animate in when mounted
   */
  animateIn?: boolean;
}

/**
 * Card Component
 *
 * A flexible container component with multiple variants.
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *     <CardDescription>Description</CardDescription>
 *   </CardHeader>
 *   <CardContent>Content</CardContent>
 *   <CardFooter>Footer</CardFooter>
 * </Card>
 * ```
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant,
      padding,
      animated = false,
      animateIn = false,
      children,
      ...props
    },
    ref
  ) => {
    // Use motion.div when animated
    if (animated || animateIn) {
      const motionProps = animated ? cardMotion : {};
      const animateInProps = animateIn
        ? {
            initial: { opacity: 0, y: 10 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
          }
        : {};

      return (
        <motion.div
          ref={ref}
          data-slot="card"
          className={cn(cardVariants({ variant, padding, className }))}
          {...motionProps}
          {...animateInProps}
          {...(props as Omit<HTMLMotionProps<"div">, "transition">)}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="card"
        className={cn(cardVariants({ variant, padding, className }))}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

/**
 * Card Header
 */
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * If true, adds a border at the bottom
   */
  bordered?: boolean;
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, bordered = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-header"
        className={cn(
          "flex flex-col gap-1.5 p-6",
          bordered && "border-b border-border pb-6",
          className
        )}
        {...props}
      />
    );
  }
);

CardHeader.displayName = "CardHeader";

/**
 * Card Title
 */
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="card-title"
      className={cn(
        "font-display text-lg font-normal tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  );
});

CardTitle.displayName = "CardTitle";

/**
 * Card Description
 */
const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="card-description"
      className={cn("text-sm text-foreground-muted", className)}
      {...props}
    />
  );
});

CardDescription.displayName = "CardDescription";

/**
 * Card Action - For header actions (buttons, icons)
 */
const CardAction = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="card-action"
      className={cn("ml-auto flex items-center gap-2", className)}
      {...props}
    />
  );
});

CardAction.displayName = "CardAction";

/**
 * Card Content
 */
interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * If true, removes default padding
   */
  noPadding?: boolean;
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, noPadding = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-content"
        className={cn(noPadding ? "" : "p-6 pt-0", className)}
        {...props}
      />
    );
  }
);

CardContent.displayName = "CardContent";

/**
 * Card Footer
 */
interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * If true, adds a border at the top
   */
  bordered?: boolean;
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, bordered = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-footer"
        className={cn(
          "flex items-center p-6 pt-0",
          bordered && "border-t border-border mt-auto pt-6",
          className
        )}
        {...props}
      />
    );
  }
);

CardFooter.displayName = "CardFooter";

/**
 * Animated Card Grid
 *
 * A grid container that staggers card animations
 */
interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4;
}

const CardGrid = React.forwardRef<HTMLDivElement, CardGridProps>(
  ({ className, columns = 3, children, ...props }, ref) => {
    const gridCols = {
      1: "grid-cols-1",
      2: "grid-cols-1 md:grid-cols-2",
      3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    };

    return (
      <motion.div
        ref={ref}
        className={cn("grid gap-4 md:gap-6", gridCols[columns], className)}
        initial="initial"
        animate="animate"
        variants={{
          animate: {
            transition: {
              staggerChildren: 0.05,
            },
          },
        }}
        {...(props as HTMLMotionProps<"div">)}
      >
        {React.Children.map(children, (child, index) => (
          <motion.div
            key={index}
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                },
              },
            }}
          >
            {child}
          </motion.div>
        ))}
      </motion.div>
    );
  }
);

CardGrid.displayName = "CardGrid";

/**
 * Stat Card
 *
 * A pre-styled card for displaying statistics with Nocturne styling
 */
interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card variant="default" className={cn("relative overflow-hidden group", className)}>
      {/* Premium subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,175,55,0.02)] via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-muted font-medium">{title}</span>
          {icon && (
            <div className="text-foreground-subtle group-hover:text-primary transition-colors duration-300">{icon}</div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-display tracking-tight text-foreground">
            {value}
          </span>
          {trend && (
            <span
              className={cn(
                "text-sm font-medium",
                trend.isPositive ? "text-[var(--sage-500)]" : "text-[var(--burgundy-500)]"
              )}
            >
              {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-foreground-muted mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardGrid,
  StatCard,
  cardVariants,
};
