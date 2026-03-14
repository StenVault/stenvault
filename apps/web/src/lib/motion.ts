/**
 * ═══════════════════════════════════════════════════════════════
 * VAULT MOTION SYSTEM
 * ═══════════════════════════════════════════════════════════════
 *
 * Consistent, performant animations using Framer Motion
 * Designed for mobile-first with reduced motion support
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { type Variants, type Transition } from 'framer-motion';

// ─────────────────────────────────────────────────────────────
// EASING PRESETS
// ─────────────────────────────────────────────────────────────

export const easings = {
  // Standard easings
  linear: [0, 0, 1, 1] as const,
  easeIn: [0.4, 0, 1, 1] as const,
  easeOut: [0, 0, 0.2, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,

  // Vault custom easings
  vaultEnter: [0.16, 1, 0.3, 1] as const,
  vaultExit: [0.7, 0, 0.84, 0] as const,
  vaultBounce: [0.34, 1.56, 0.64, 1] as const,
  vaultSpring: [0.175, 0.885, 0.32, 1.1] as const,
  vaultSmooth: [0.25, 0.1, 0.25, 1] as const,

  // Specific use cases
  button: [0.2, 0.9, 0.3, 1] as const,
  modal: [0.32, 0.72, 0, 1] as const,
  drawer: [0.32, 0.72, 0, 1] as const,
  tooltip: [0.4, 0, 0.2, 1] as const,
} as const;

// ─────────────────────────────────────────────────────────────
// DURATION PRESETS (in seconds)
// ─────────────────────────────────────────────────────────────

export const durations = {
  instant: 0.05,
  fast: 0.1,
  normal: 0.2,
  slow: 0.3,
  slower: 0.5,
  slowest: 0.7,

  // Component-specific
  button: 0.15,
  modal: 0.25,
  drawer: 0.3,
  tooltip: 0.15,
  toast: 0.2,
  page: 0.4,
} as const;

// ─────────────────────────────────────────────────────────────
// SPRING PRESETS
// ─────────────────────────────────────────────────────────────

export const springs = {
  // Snappy - for buttons, toggles
  snappy: { type: 'spring', stiffness: 400, damping: 30 } as const,

  // Responsive - for modals, cards
  responsive: { type: 'spring', stiffness: 300, damping: 25 } as const,

  // Gentle - for large elements, page transitions
  gentle: { type: 'spring', stiffness: 200, damping: 20 } as const,

  // Bouncy - for playful interactions
  bouncy: { type: 'spring', stiffness: 350, damping: 15 } as const,

  // Stiff - for precise, quick movements
  stiff: { type: 'spring', stiffness: 500, damping: 35 } as const,

  // Soft - for slow, deliberate movements
  soft: { type: 'spring', stiffness: 150, damping: 20 } as const,
} as const;

// ─────────────────────────────────────────────────────────────
// TRANSITION PRESETS
// ─────────────────────────────────────────────────────────────

export const transitions = {
  // Default
  default: {
    duration: durations.normal,
    ease: easings.vaultSmooth,
  } as Transition,

  // Fast - for hover states, toggles
  fast: {
    duration: durations.fast,
    ease: easings.easeOut,
  } as Transition,

  // Slow - for page transitions
  slow: {
    duration: durations.slow,
    ease: easings.vaultEnter,
  } as Transition,

  // Modal enter
  modalEnter: {
    duration: durations.modal,
    ease: easings.modal,
  } as Transition,

  // Modal exit
  modalExit: {
    duration: durations.normal,
    ease: easings.vaultExit,
  } as Transition,

  // Stagger children
  stagger: {
    staggerChildren: 0.05,
    delayChildren: 0.05,
  } as Transition,

  // Stagger fast
  staggerFast: {
    staggerChildren: 0.03,
    delayChildren: 0.02,
  } as Transition,
} as const;

// ─────────────────────────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────────────────────────

/**
 * Fade animation variants
 */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Fade with scale (for modals, cards)
 */
export const fadeScaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: transitions.modalEnter,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: transitions.modalExit,
  },
};

/**
 * Slide up animation (for bottom sheets, toasts)
 */
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: transitions.fast,
  },
};

/**
 * Slide down animation (for dropdowns)
 */
export const slideDownVariants: Variants = {
  initial: { opacity: 0, y: -10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: transitions.fast,
  },
};

/**
 * List item stagger variants
 */
export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: transitions.fast,
  },
};

/**
 * Container for staggered children
 */
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: transitions.stagger,
  },
  exit: {},
};

/**
 * Page transition variants
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: durations.page,
      ease: easings.vaultEnter,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: durations.normal,
      ease: easings.vaultExit,
    },
  },
};

/**
 * Button press animation
 */
export const buttonVariants: Variants = {
  initial: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.97 },
};

// ─────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// PRESET CONFIGURATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Motion props for common elements
 */
export const motionPresets = {
  // For list items
  listItem: {
    variants: listItemVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
  },

  // For modals/dialogs
  modal: {
    variants: fadeScaleVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
  },

  // For dropdowns
  dropdown: {
    variants: slideDownVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
  },

  // For toasts
  toast: {
    variants: slideUpVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
  },

  // For page transitions
  page: {
    variants: pageVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
  },

  // For fade elements
  fade: {
    variants: fadeVariants,
    initial: 'initial',
    animate: 'animate',
    exit: 'exit',
  },

  // For buttons
  button: {
    variants: buttonVariants,
    initial: 'initial',
    whileHover: 'hover',
    whileTap: 'tap',
  },
} as const;

// ─────────────────────────────────────────────────────────────
// LAYOUT ANIMATION HELPERS
// ─────────────────────────────────────────────────────────────

export const layoutTransition = {
  type: 'spring',
  stiffness: 350,
  damping: 30,
} as const;

