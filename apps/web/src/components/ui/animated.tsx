/**
 * ═══════════════════════════════════════════════════════════════
 * ANIMATED COMPONENTS
 * ═══════════════════════════════════════════════════════════════
 *
 * Reusable animation wrapper components using Framer Motion.
 * These components provide consistent animations across the app.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import * as React from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
  type Transition,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fadeVariants,
  slideUpVariants,
  slideDownVariants,
  fadeScaleVariants,
  pageVariants,
  staggerContainerVariants,
  listItemVariants,
  easings,
  durations,
  springs,
} from "@/lib/motion";

// ─────────────────────────────────────────────────────────────
// FADE IN COMPONENT
// ─────────────────────────────────────────────────────────────

interface FadeInProps extends HTMLMotionProps<"div"> {
  /**
   * Delay before animation starts (in seconds)
   */
  delay?: number;
  /**
   * Duration of the animation (in seconds)
   */
  duration?: number;
  /**
   * Direction the element fades in from
   */
  direction?: "up" | "down" | "left" | "right" | "none";
  /**
   * Distance to travel (in pixels)
   */
  distance?: number;
  /**
   * Only animate once (on initial mount)
   */
  once?: boolean;
}

/**
 * FadeIn Component
 *
 * Animates children with a fade effect, optionally with directional movement.
 *
 * @example
 * ```tsx
 * <FadeIn direction="up" delay={0.2}>
 *   <Card>Content</Card>
 * </FadeIn>
 * ```
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 0.4,
  direction = "up",
  distance = 20,
  once = true,
  className,
  ...props
}: FadeInProps) {
  const prefersReducedMotion = useReducedMotion();

  const directions = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
    none: {},
  };

  const variants: Variants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
      }
    : {
        initial: {
          opacity: 0,
          ...directions[direction],
        },
        animate: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: {
            duration,
            delay,
            ease: easings.vaultEnter,
          },
        },
      };

  return (
    <motion.div
      className={className}
      initial="initial"
      whileInView="animate"
      viewport={{ once }}
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// STAGGER CONTAINER COMPONENT
// ─────────────────────────────────────────────────────────────

interface StaggerContainerProps extends HTMLMotionProps<"div"> {
  /**
   * Delay between each child animation
   */
  staggerDelay?: number;
  /**
   * Initial delay before first child animates
   */
  delayChildren?: number;
}

/**
 * StaggerContainer Component
 *
 * Animates children with a staggered reveal effect.
 *
 * @example
 * ```tsx
 * <StaggerContainer>
 *   <StaggerItem>Item 1</StaggerItem>
 *   <StaggerItem>Item 2</StaggerItem>
 *   <StaggerItem>Item 3</StaggerItem>
 * </StaggerContainer>
 * ```
 */
export function StaggerContainer({
  children,
  staggerDelay = 0.05,
  delayChildren = 0,
  className,
  ...props
}: StaggerContainerProps) {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerItem Component
 *
 * Individual item within a StaggerContainer.
 */
export function StaggerItem({
  children,
  className,
  ...props
}: HTMLMotionProps<"div">) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={
        prefersReducedMotion
          ? {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
            }
          : listItemVariants
      }
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE TRANSITION COMPONENT
// ─────────────────────────────────────────────────────────────

interface PageTransitionProps extends HTMLMotionProps<"div"> {
  /**
   * Unique key for AnimatePresence (usually route path)
   */
  pageKey?: string;
}

/**
 * PageTransition Component
 *
 * Wraps page content with enter/exit animations.
 *
 * @example
 * ```tsx
 * <PageTransition pageKey={location.pathname}>
 *   <PageContent />
 * </PageTransition>
 * ```
 */
export function PageTransition({
  children,
  pageKey,
  className,
  ...props
}: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      key={pageKey}
      className={cn("w-full", className)}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={prefersReducedMotion ? fadeVariants : pageVariants}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCALE IN COMPONENT
// ─────────────────────────────────────────────────────────────

interface ScaleInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  duration?: number;
}

/**
 * ScaleIn Component
 *
 * Animates children with a scale + fade effect (good for modals, popovers).
 */
export function ScaleIn({
  children,
  delay = 0,
  duration = 0.2,
  className,
  ...props
}: ScaleInProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      animate={
        prefersReducedMotion
          ? { opacity: 1 }
          : {
              opacity: 1,
              scale: 1,
              transition: {
                duration,
                delay,
                ease: easings.vaultEnter,
              },
            }
      }
      exit={
        prefersReducedMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              scale: 0.95,
              transition: {
                duration: duration * 0.8,
                ease: easings.vaultExit,
              },
            }
      }
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// SLIDE COMPONENT
// ─────────────────────────────────────────────────────────────

interface SlideProps extends HTMLMotionProps<"div"> {
  direction: "up" | "down" | "left" | "right";
  delay?: number;
  duration?: number;
}

/**
 * Slide Component
 *
 * Slides content in from a specified direction.
 */
export function Slide({
  children,
  direction,
  delay = 0,
  duration = 0.3,
  className,
  ...props
}: SlideProps) {
  const prefersReducedMotion = useReducedMotion();

  const getInitialPosition = () => {
    switch (direction) {
      case "up":
        return { y: "100%" };
      case "down":
        return { y: "-100%" };
      case "left":
        return { x: "100%" };
      case "right":
        return { x: "-100%" };
    }
  };

  if (prefersReducedMotion) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ ...getInitialPosition(), opacity: 0 }}
      animate={{
        x: 0,
        y: 0,
        opacity: 1,
        transition: {
          duration,
          delay,
          ease: easings.drawer,
        },
      }}
      exit={{
        ...getInitialPosition(),
        opacity: 0,
        transition: {
          duration: duration * 0.8,
          ease: easings.vaultExit,
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// COLLAPSE COMPONENT
// ─────────────────────────────────────────────────────────────

interface CollapseProps extends Omit<HTMLMotionProps<"div">, "children"> {
  isOpen: boolean;
  children: React.ReactNode;
}

/**
 * Collapse Component
 *
 * Animates the height of content for expand/collapse effects.
 */
export function Collapse({
  isOpen,
  children,
  className,
  ...props
}: CollapseProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          className={cn("overflow-hidden", className)}
          initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={
            prefersReducedMotion
              ? { opacity: 1 }
              : {
                  height: "auto",
                  opacity: 1,
                  transition: {
                    height: { duration: 0.3, ease: easings.vaultEnter },
                    opacity: { duration: 0.2, delay: 0.05 },
                  },
                }
          }
          exit={
            prefersReducedMotion
              ? { opacity: 0 }
              : {
                  height: 0,
                  opacity: 0,
                  transition: {
                    height: { duration: 0.2, ease: easings.vaultExit },
                    opacity: { duration: 0.1 },
                  },
                }
          }
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// ANIMATED LIST COMPONENT
// ─────────────────────────────────────────────────────────────

interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  itemClassName?: string;
}

/**
 * AnimatedList Component
 *
 * Renders a list with enter/exit animations for each item.
 */
export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  className,
  itemClassName,
}: AnimatedListProps<T>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item, index)}
            className={itemClassName}
            layout={!prefersReducedMotion}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.2,
                      ease: easings.vaultEnter as [number, number, number, number],
                    },
                  }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: -10,
                    transition: {
                      duration: 0.15,
                      ease: easings.vaultExit as [number, number, number, number],
                    },
                  }
            }
          >
            {renderItem(item, index) as React.ReactNode}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRESENCE COMPONENT
// ─────────────────────────────────────────────────────────────

interface PresenceProps {
  show: boolean;
  children: React.ReactNode;
  mode?: "sync" | "wait" | "popLayout";
}

/**
 * Presence Component
 *
 * Simple wrapper around AnimatePresence for conditional rendering.
 */
export function Presence({ show, children, mode = "sync" }: PresenceProps) {
  return (
    <AnimatePresence mode={mode}>
      {show && children}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// SHIMMER / SKELETON LOADER
// ─────────────────────────────────────────────────────────────

interface ShimmerProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

/**
 * Shimmer Component
 *
 * Animated skeleton placeholder for loading states.
 */
export function Shimmer({
  className,
  width,
  height,
  rounded = "md",
}: ShimmerProps) {
  const radiusMap = {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--nocturne-800)]",
        radiusMap[rounded],
        className
      )}
      style={{ width, height }}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        animate={{
          x: ["-100%", "100%"],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PULSE COMPONENT
// ─────────────────────────────────────────────────────────────

interface PulseProps extends HTMLMotionProps<"div"> {
  /**
   * Pulse scale factor
   */
  scale?: number;
}

/**
 * Pulse Component
 *
 * Adds a subtle pulsing animation to children.
 */
export function Pulse({
  children,
  scale = 1.02,
  className,
  ...props
}: PulseProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children as React.ReactNode}</div>;
  }

  return (
    <motion.div
      className={className}
      animate={{
        scale: [1, scale, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      {...props}
    >
      {children as React.ReactNode}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// RE-EXPORT FRAMER MOTION UTILITIES
// ─────────────────────────────────────────────────────────────

export { AnimatePresence, motion, useReducedMotion };
