/**
 * ═══════════════════════════════════════════════════════════════
 * CLOUDVAULT - NOCTURNE THEME SYSTEM
 * ═══════════════════════════════════════════════════════════════
 *
 * Luxo digital. Ouro sobre veludo escuro.
 * Sistema de temas com paleta Nocturne - elegância atemporal.
 *
 * COMO USAR:
 * 1. Importar o tema desejado
 * 2. Usar o ThemeProvider para aplicar
 * 3. Os componentes usarão as CSS variables automaticamente
 *
 * ═══════════════════════════════════════════════════════════════
 */

export type ThemeMode = 'dark' | 'light';

export interface ThemePalette {
    name: string;
    displayName: string;
    description: string;
    mode: ThemeMode;

    // Core brand colors
    brand: {
        primary: string;
        primaryHover: string;
        primaryActive: string;
        secondary: string;
        accent: string;
        accentHover: string;
    };

    // Background layers
    background: {
        base: string;
        elevated: string;
        surface: string;
        muted: string;
        subtle: string;
    };

    // Foreground/text colors
    foreground: {
        primary: string;
        secondary: string;
        muted: string;
        subtle: string;
        disabled: string;
        onPrimary: string;
    };

    // Semantic colors
    semantic: {
        success: string;
        successMuted: string;
        warning: string;
        warningMuted: string;
        error: string;
        errorMuted: string;
        info: string;
        infoMuted: string;
    };

    // Borders
    border: {
        default: string;
        muted: string;
        strong: string;
        focus: string;
    };

    // Effects
    effects: {
        glow: string;
        glowStrong: string;
        gradient: string;
    };

    // Chart colors
    chart: {
        1: string;
        2: string;
        3: string;
        4: string;
        5: string;
    };
}

/**
 * ═══════════════════════════════════════════════════════════════
 * THEME: NOCTURNE (DEFAULT)
 * Luxo digital - azul-noite profundo com ouro refinado
 * ═══════════════════════════════════════════════════════════════
 */
export const nocturneTheme: ThemePalette = {
    name: 'nocturne',
    displayName: 'Nocturne',
    description: 'Digital luxury - midnight blue with golden accents',
    mode: 'dark',

    brand: {
        primary: '#D4AF37',        // Gold 500
        primaryHover: '#E5C158',   // Gold 400
        primaryActive: '#9A7F35',  // Gold 600
        secondary: '#1F2533',      // Nocturne 700
        accent: '#8B7355',         // Bronze 600
        accentHover: '#A38968',    // Bronze 500
    },

    background: {
        base: '#0D0F14',           // Nocturne 900
        elevated: '#161A23',       // Nocturne 800
        surface: '#1F2533',        // Nocturne 700
        muted: '#2A3245',          // Nocturne 600
        subtle: '#3D4A61',         // Nocturne 500
    },

    foreground: {
        primary: '#F4F6F9',        // Nocturne 50
        secondary: '#DDE3EC',      // Nocturne 100
        muted: '#8090AC',          // Nocturne 300
        subtle: '#5A6A87',         // Nocturne 400
        disabled: '#3D4A61',       // Nocturne 500
        onPrimary: '#0D0F14',      // Nocturne 900
    },

    semantic: {
        success: '#3D9970',        // Sage 600
        successMuted: '#0D2A1F',   // Sage 950
        warning: '#E09830',        // Amber 500
        warningMuted: '#422D0B',   // Amber 900
        error: '#C75050',          // Burgundy 500
        errorMuted: '#3D1F1F',     // Burgundy 900
        info: '#5B8BD4',           // Steel 500
        infoMuted: '#162138',      // Steel 900
    },

    border: {
        default: 'rgba(180, 192, 212, 0.08)',
        muted: 'rgba(180, 192, 212, 0.04)',
        strong: 'rgba(180, 192, 212, 0.15)',
        focus: '#D4AF37',
    },

    effects: {
        glow: 'rgba(212, 175, 55, 0.12)',
        glowStrong: 'rgba(212, 175, 55, 0.25)',
        gradient: 'linear-gradient(135deg, #D4AF37 0%, #9A7F35 100%)',
    },

    chart: {
        1: '#D4AF37',
        2: '#8B7355',
        3: '#5B8BD4',
        4: '#3D9970',
        5: '#C75050',
    },
};

/**
 * ═══════════════════════════════════════════════════════════════
 * THEME: NOCTURNE SLATE
 * Neutral elegance - deep slate with champagne
 * ═══════════════════════════════════════════════════════════════
 */
export const nocturneSlateTheme: ThemePalette = {
    name: 'nocturne-slate',
    displayName: 'Nocturne Slate',
    description: 'Neutral elegance with champagne tones',
    mode: 'dark',

    brand: {
        primary: '#C9B896',        // Champagne
        primaryHover: '#D9CBAB',   // Champagne lighter
        primaryActive: '#B5A27D',  // Champagne darker
        secondary: '#1E2330',      // Slate dark
        accent: '#9A8B70',         // Taupe
        accentHover: '#B0A085',    // Taupe lighter
    },

    background: {
        base: '#111827',           // Slate 900
        elevated: '#1A2236',       // Slate elevated
        surface: '#232D42',        // Slate surface
        muted: '#2D3A52',          // Slate muted
        subtle: '#3D4D68',         // Slate subtle
    },

    foreground: {
        primary: '#F1F5F9',        // Slate 100
        secondary: '#E2E8F0',      // Slate 200
        muted: '#94A3B8',          // Slate 400
        subtle: '#64748B',         // Slate 500
        disabled: '#475569',       // Slate 600
        onPrimary: '#111827',      // Slate 900
    },

    semantic: {
        success: '#3D9970',
        successMuted: '#0D2A1F',
        warning: '#E09830',
        warningMuted: '#422D0B',
        error: '#C75050',
        errorMuted: '#3D1F1F',
        info: '#5B8BD4',
        infoMuted: '#162138',
    },

    border: {
        default: 'rgba(148, 163, 184, 0.08)',
        muted: 'rgba(148, 163, 184, 0.04)',
        strong: 'rgba(148, 163, 184, 0.15)',
        focus: '#C9B896',
    },

    effects: {
        glow: 'rgba(201, 184, 150, 0.12)',
        glowStrong: 'rgba(201, 184, 150, 0.25)',
        gradient: 'linear-gradient(135deg, #C9B896 0%, #B5A27D 100%)',
    },

    chart: {
        1: '#C9B896',
        2: '#9A8B70',
        3: '#5B8BD4',
        4: '#3D9970',
        5: '#C75050',
    },
};

/**
 * ═══════════════════════════════════════════════════════════════
 * THEME: NOCTURNE VELVET
 * Luxo quente - preto aveludado com bronze rico
 * ═══════════════════════════════════════════════════════════════
 */
export const nocturneVelvetTheme: ThemePalette = {
    name: 'nocturne-velvet',
    displayName: 'Nocturne Velvet',
    description: 'Warm luxury with bronze and earthy tones',
    mode: 'dark',

    brand: {
        primary: '#CD9B6D',        // Bronze quente
        primaryHover: '#DEAF85',   // Bronze lighter
        primaryActive: '#B58756',  // Bronze darker
        secondary: '#1A1614',      // Warm black
        accent: '#A67C52',         // Cobre
        accentHover: '#BC9268',    // Cobre lighter
    },

    background: {
        base: '#0F0D0B',           // Warm black
        elevated: '#1A1614',       // Warm elevated
        surface: '#242019',        // Warm surface
        muted: '#302A22',          // Warm muted
        subtle: '#3E362C',         // Warm subtle
    },

    foreground: {
        primary: '#FAF8F5',        // Warm white
        secondary: '#EDE8E0',      // Warm off-white
        muted: '#A69F94',          // Warm gray
        subtle: '#7A7368',         // Warm gray darker
        disabled: '#524C44',       // Warm gray disabled
        onPrimary: '#0F0D0B',      // Warm black
    },

    semantic: {
        success: '#5AA469',        // Warm green
        successMuted: '#1A2E1F',
        warning: '#E09830',
        warningMuted: '#422D0B',
        error: '#C75050',
        errorMuted: '#3D1F1F',
        info: '#6B9AC4',           // Warm blue
        infoMuted: '#1A2838',
    },

    border: {
        default: 'rgba(166, 159, 148, 0.08)',
        muted: 'rgba(166, 159, 148, 0.04)',
        strong: 'rgba(166, 159, 148, 0.15)',
        focus: '#CD9B6D',
    },

    effects: {
        glow: 'rgba(205, 155, 109, 0.12)',
        glowStrong: 'rgba(205, 155, 109, 0.25)',
        gradient: 'linear-gradient(135deg, #CD9B6D 0%, #B58756 100%)',
    },

    chart: {
        1: '#CD9B6D',
        2: '#A67C52',
        3: '#6B9AC4',
        4: '#5AA469',
        5: '#C75050',
    },
};

/**
 * ═══════════════════════════════════════════════════════════════
 * THEME: NOCTURNE DAY (LIGHT MODE)
 * Luminosidade elegante - off-white quente com ouro
 * ═══════════════════════════════════════════════════════════════
 */
export const nocturneDayTheme: ThemePalette = {
    name: 'nocturne-day',
    displayName: 'Nocturne Day',
    description: 'Elegant light mode with golden touches',
    mode: 'light',

    brand: {
        primary: '#9A7F35',        // Gold 600 (darker for light mode)
        primaryHover: '#D4AF37',   // Gold 500
        primaryActive: '#7A6428',  // Gold 700
        secondary: '#F4F2EE',      // Warm off-white
        accent: '#7A5E42',         // Bronze 700
        accentHover: '#8B7355',    // Bronze 600
    },

    background: {
        base: '#FAFAF8',           // Warm white
        elevated: '#FFFFFF',       // Pure white
        surface: '#F4F2EE',        // Warm surface
        muted: '#E8E5DE',          // Warm muted
        subtle: '#D4CFC4',         // Warm subtle
    },

    foreground: {
        primary: '#0D0F14',        // Nocturne 900
        secondary: '#1F2533',      // Nocturne 700
        muted: '#3D4A61',          // Nocturne 500
        subtle: '#5A6A87',         // Nocturne 400
        disabled: '#8090AC',       // Nocturne 300
        onPrimary: '#FFFFFF',      // White on buttons
    },

    semantic: {
        success: '#2A8560',        // Sage 700
        successMuted: '#E0F5E9',   // Sage 100
        warning: '#B8781E',        // Amber 600
        warningMuted: '#FCEFD4',   // Amber 100
        error: '#A84848',          // Burgundy 600
        errorMuted: '#F8E0E0',     // Burgundy 100
        info: '#3D5E94',           // Steel 600
        infoMuted: '#E5EDF9',      // Steel 100
    },

    border: {
        default: 'rgba(0, 0, 0, 0.1)',
        muted: 'rgba(0, 0, 0, 0.05)',
        strong: 'rgba(0, 0, 0, 0.15)',
        focus: '#9A7F35',
    },

    effects: {
        glow: 'rgba(154, 127, 53, 0.1)',
        glowStrong: 'rgba(154, 127, 53, 0.2)',
        gradient: 'linear-gradient(135deg, #9A7F35 0%, #7A6428 100%)',
    },

    chart: {
        1: '#9A7F35',
        2: '#7A5E42',
        3: '#3D5E94',
        4: '#2A8560',
        5: '#A84848',
    },
};

/**
 * ═══════════════════════════════════════════════════════════════
 * THEME: NOCTURNE CLOUD (SOFT LIGHT MODE)
 * Suavidade premium - creme com bronze subtil
 * ═══════════════════════════════════════════════════════════════
 */
export const nocturneCloudTheme: ThemePalette = {
    name: 'nocturne-cloud',
    displayName: 'Nocturne Cloud',
    description: 'Soft light mode with cream tones',
    mode: 'light',

    brand: {
        primary: '#8B7355',        // Bronze 600
        primaryHover: '#A38968',   // Bronze 500
        primaryActive: '#7A5E42',  // Bronze 700
        secondary: '#F5F3EF',      // Cream
        accent: '#9A7F35',         // Gold 600
        accentHover: '#D4AF37',    // Gold 500
    },

    background: {
        base: '#F8F6F2',           // Cream base
        elevated: '#FDFCFA',       // Near white
        surface: '#F0EDE6',        // Cream surface
        muted: '#E4E0D6',          // Cream muted
        subtle: '#D4CFC2',         // Cream subtle
    },

    foreground: {
        primary: '#1A1614',        // Warm black
        secondary: '#302A22',      // Warm dark
        muted: '#524C44',          // Warm gray
        subtle: '#7A7368',         // Warm gray light
        disabled: '#A69F94',       // Warm gray lighter
        onPrimary: '#FFFFFF',      // White
    },

    semantic: {
        success: '#2A8560',
        successMuted: '#E0F5E9',
        warning: '#B8781E',
        warningMuted: '#FCEFD4',
        error: '#A84848',
        errorMuted: '#F8E0E0',
        info: '#3D5E94',
        infoMuted: '#E5EDF9',
    },

    border: {
        default: 'rgba(0, 0, 0, 0.08)',
        muted: 'rgba(0, 0, 0, 0.04)',
        strong: 'rgba(0, 0, 0, 0.12)',
        focus: '#8B7355',
    },

    effects: {
        glow: 'rgba(139, 115, 85, 0.1)',
        glowStrong: 'rgba(139, 115, 85, 0.2)',
        gradient: 'linear-gradient(135deg, #8B7355 0%, #7A5E42 100%)',
    },

    chart: {
        1: '#8B7355',
        2: '#9A7F35',
        3: '#3D5E94',
        4: '#2A8560',
        5: '#A84848',
    },
};

/**
 * All available themes
 */
export const themes = {
    nocturne: nocturneTheme,
    'nocturne-slate': nocturneSlateTheme,
    'nocturne-velvet': nocturneVelvetTheme,
    'nocturne-day': nocturneDayTheme,
    'nocturne-cloud': nocturneCloudTheme,
} as const;

export type ThemeName = keyof typeof themes;

/**
 * Get theme by name (with fallback to nocturne)
 */
export function getTheme(name: string): ThemePalette {
    return themes[name as ThemeName] ?? nocturneTheme;
}

/**
 * Get all available theme names
 */
export function getAvailableThemes(): Array<{ name: ThemeName; displayName: string; description: string }> {
    return Object.values(themes).map(theme => ({
        name: theme.name as ThemeName,
        displayName: theme.displayName,
        description: theme.description,
    }));
}

/**
 * Generate CSS variables from a theme palette
 */
export function themeToCssVariables(theme: ThemePalette): Record<string, string> {
    return {
        // Brand
        '--theme-primary': theme.brand.primary,
        '--theme-primary-hover': theme.brand.primaryHover,
        '--theme-primary-active': theme.brand.primaryActive,
        '--theme-secondary': theme.brand.secondary,
        '--theme-accent': theme.brand.accent,
        '--theme-accent-hover': theme.brand.accentHover,

        // Backgrounds
        '--theme-bg-base': theme.background.base,
        '--theme-bg-elevated': theme.background.elevated,
        '--theme-bg-surface': theme.background.surface,
        '--theme-bg-muted': theme.background.muted,
        '--theme-bg-subtle': theme.background.subtle,

        // Foregrounds
        '--theme-fg-primary': theme.foreground.primary,
        '--theme-fg-secondary': theme.foreground.secondary,
        '--theme-fg-muted': theme.foreground.muted,
        '--theme-fg-subtle': theme.foreground.subtle,
        '--theme-fg-disabled': theme.foreground.disabled,
        '--theme-fg-on-primary': theme.foreground.onPrimary,

        // Semantic
        '--theme-success': theme.semantic.success,
        '--theme-success-muted': theme.semantic.successMuted,
        '--theme-warning': theme.semantic.warning,
        '--theme-warning-muted': theme.semantic.warningMuted,
        '--theme-error': theme.semantic.error,
        '--theme-error-muted': theme.semantic.errorMuted,
        '--theme-info': theme.semantic.info,
        '--theme-info-muted': theme.semantic.infoMuted,

        // Borders
        '--theme-border': theme.border.default,
        '--theme-border-muted': theme.border.muted,
        '--theme-border-strong': theme.border.strong,
        '--theme-border-focus': theme.border.focus,

        // Effects
        '--theme-glow': theme.effects.glow,
        '--theme-glow-strong': theme.effects.glowStrong,
        '--theme-gradient': theme.effects.gradient,

        // Charts
        '--theme-chart-1': theme.chart[1],
        '--theme-chart-2': theme.chart[2],
        '--theme-chart-3': theme.chart[3],
        '--theme-chart-4': theme.chart[4],
        '--theme-chart-5': theme.chart[5],
    };
}

export default themes;
