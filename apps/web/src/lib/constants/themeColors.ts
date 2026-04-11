/**
 * UI Theme Color Constants
 * Obsidian + Electric Indigo palette used across public pages and auth UI.
 * Extracted from landing-v3 for continued use after landing migration to Next.js.
 */

export const LANDING_COLORS = {
    // Backgrounds
    bg: '#020617',           // Obsidian
    surface: '#0F172A',      // Deep Slate
    surfaceHover: '#1E293B', // Slate 800

    // Text
    textPrimary: '#F8FAFC',   // Slate 50
    textSecondary: '#94A3B8', // Slate 400
    textMuted: '#728496',     // Slate 500 adjusted — 5.2:1 on #020617 (WCAG AA)

    // Borders
    border: '#1E293B',        // Slate 800
    borderHover: '#334155',   // Slate 700

    // Accent (Electric Indigo)
    accent: '#6366F1',
    accentHover: '#818CF8',
    accentGlow: 'rgba(99, 102, 241, 0.2)',
    accentSubtle: 'rgba(99, 102, 241, 0.1)',
    accentOpacity05: 'rgba(99, 102, 241, 0.05)',

    // Semantic
    success: '#10B981',       // Emerald
    warning: '#F59E0B',       // Amber
    danger: '#EF4444',        // Red

    // Glassmorphism
    glassBg: 'rgba(15, 23, 42, 0.6)',
    glassBorder: 'rgba(99, 102, 241, 0.1)',
    glassBorderHover: 'rgba(99, 102, 241, 0.25)',
    accentDeep: '#4338CA',        // Indigo-700
    accentVivid: '#A78BFA',       // Violet-400
    prismFace1: 'rgba(99, 102, 241, 0.12)',
    prismFace2: 'rgba(167, 139, 250, 0.08)',
    prismFace3: 'rgba(129, 140, 248, 0.15)',
    networkGreen: '#22C55E',      // Green-500
    networkGreenGlow: 'rgba(34, 197, 94, 0.4)',

    // Pipeline colors (encryption flow)
    pipelineSource: '#818CF8',       // Indigo-400
    pipelineEncrypt: '#6366F1',      // Indigo-500
    pipelineStore: '#4338CA',        // Indigo-700
    pipelineDecrypt: '#10B981',      // Emerald-500

    // Threat colors
    threatRed: '#EF4444',
    threatRedGlow: 'rgba(239, 68, 68, 0.25)',
    threatRedMuted: 'rgba(239, 68, 68, 0.08)',
} as const;

export type LandingColorKey = keyof typeof LANDING_COLORS;

export function getLandingColor(key: LandingColorKey): string {
    return LANDING_COLORS[key];
}

export const VIS_COLORS = {
    insecure: '#EF4444',
    insecureMuted: '#7F1D1D',
    insecureGlow: 'rgba(239, 68, 68, 0.3)',
    insecureBorder: 'rgba(239, 68, 68, 0.2)',
    insecureBg: 'rgba(239, 68, 68, 0.05)',
    secure: '#10B981',
    secureMuted: '#064E3B',
    secureGlow: 'rgba(16, 185, 129, 0.3)',
    secureBorder: 'rgba(16, 185, 129, 0.2)',
    secureBg: 'rgba(16, 185, 129, 0.05)',
    particlePrimary: '#818CF8',
    particleSecondary: '#6366F1',
    particleAccent: '#A78BFA',
    particleTrail: 'rgba(129, 140, 248, 0.4)',
    nodeActive: '#6366F1',
    nodeComplete: '#10B981',
    nodeInactive: '#334155',
    nodeBorder: 'rgba(99, 102, 241, 0.3)',
    latticeIntact: '#10B981',
    latticeBroken: '#EF4444',
    latticeNode: '#818CF8',
} as const;

export type VisColorKey = keyof typeof VIS_COLORS;

export default LANDING_COLORS;
