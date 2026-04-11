/**
 * Design Tokens — V4 Kinetic Editorial
 */

export const MOTION = {
    /** Expo-out easing for all entrance animations */
    easeOut: [0.16, 1, 0.3, 1] as const,
    /** Duration for section fade-ins */
    sectionDuration: 0.7,
    /** Stagger between children */
    staggerFast: 0.08,
    staggerMedium: 0.12,
    staggerSlow: 0.15,
    /** Viewport trigger threshold */
    viewportOnce: true,
    viewportAmount: 0.2,
} as const;

export const SPACING = {
    /** Section vertical padding */
    sectionY: 'py-24 md:py-32',
    /** Max content width */
    maxWidth: 'max-w-6xl',
    /** Editorial wide max width */
    maxWidthWide: 'max-w-7xl',
    /** Container padding */
    containerPx: 'px-6',
} as const;

export const TYPOGRAPHY = {
    /** Hero headline — editorial scale */
    heroHeadline: 'font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[9rem] leading-[0.92] tracking-tighter',
    /** Section headline — bold editorial */
    sectionHeadline: 'font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.0]',
    /** Section subheadline */
    sectionSub: 'text-lg text-slate-400 font-light leading-relaxed',
    /** Section label — uppercase mono */
    sectionLabel: 'font-mono text-xs tracking-[0.3em] uppercase',
    /** Card title */
    cardTitle: 'font-display text-2xl sm:text-3xl md:text-4xl leading-[1.1] tracking-tight',
    /** Body text */
    body: 'text-base text-slate-400 leading-relaxed',
    /** Mono / technical */
    mono: 'font-mono text-sm',
    /** Code block */
    codeBlock: 'font-mono text-[11px] sm:text-xs leading-relaxed',
    /** Ticker text */
    ticker: 'font-mono text-[10px] tracking-wide',
} as const;

export const GSAP_TIMINGS = {
    heroStagger: 0.15,
    prismOrbitDuration: 20,
    shieldFormationScrub: 1.2,
    parallaxSpeed: 0.7,
    tickerDuration: 40,
    sectionFadeIn: 0.8,
} as const;

export const CANVAS_SETTINGS = {
    hero: {
        particleCount: 50,
        particleCountMobile: 20,
        connectionDistance: 130,
        mouseRadius: 200,
        particleSpeed: 0.3,
        particleSize: { min: 1.5, max: 3 },
        connectionOpacity: 0.08,
    },
    cta: {
        particleCount: 60,
        particleCountMobile: 25,
        particleSize: { min: 1.5, max: 2.5 },
    },
    trust: {
        particleCount: 15,
        particleSpeed: 0.15,
        particleSize: { min: 1, max: 2 },
    },
    pipeline: {
        particleCount: 40,
        particleSpeed: 2,
        particleSize: 3,
        nodeRadius: 40,
    },
} as const;
