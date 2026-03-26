import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

export type InterfaceDensity = "compact" | "comfortable" | "spacious";
export type FontSize = "small" | "medium" | "large" | "extra-large";

interface InterfaceContextType {
    density: InterfaceDensity;
    setDensity: (density: InterfaceDensity) => void;
    fontSize: FontSize;
    setFontSize: (size: FontSize) => void;
    resetToDefaults: () => void;
}

const STORAGE_KEYS = {
    DENSITY: "stenvault-density",
    FONT_SIZE: "stenvault-font-size",
} as const;

const DEFAULTS = {
    DENSITY: "comfortable" as InterfaceDensity,
    FONT_SIZE: "medium" as FontSize,
} as const;

const DENSITY_CSS_VALUES = {
    compact: {
        "--spacing-base": "0.25rem",
        "--spacing-sm": "0.375rem",
        "--spacing-md": "0.5rem",
        "--spacing-lg": "0.75rem",
        "--spacing-xl": "1rem",
        "--component-padding": "0.375rem 0.625rem",
        "--card-padding": "0.75rem",
        "--icon-size": "0.875rem",
        "--button-height": "1.75rem",
        "--input-height": "1.75rem",
    },
    comfortable: {
        "--spacing-base": "0.5rem",
        "--spacing-sm": "0.625rem",
        "--spacing-md": "0.75rem",
        "--spacing-lg": "1rem",
        "--spacing-xl": "1.5rem",
        "--component-padding": "0.5rem 1rem",
        "--card-padding": "1rem",
        "--icon-size": "1rem",
        "--button-height": "2.25rem",
        "--input-height": "2.25rem",
    },
    spacious: {
        "--spacing-base": "0.75rem",
        "--spacing-sm": "1rem",
        "--spacing-md": "1.25rem",
        "--spacing-lg": "1.5rem",
        "--spacing-xl": "2rem",
        "--component-padding": "0.75rem 1.25rem",
        "--card-padding": "1.5rem",
        "--icon-size": "1.25rem",
        "--button-height": "2.75rem",
        "--input-height": "2.75rem",
    },
} as const;

const FONT_SIZE_CSS_VALUES = {
    small: {
        "--font-size-xs": "0.625rem",
        "--font-size-sm": "0.75rem",
        "--font-size-base": "0.8125rem",
        "--font-size-md": "0.875rem",
        "--font-size-lg": "1rem",
        "--font-size-xl": "1.125rem",
        "--font-size-2xl": "1.25rem",
        "--font-size-3xl": "1.5rem",
        "--line-height-base": "1.4",
    },
    medium: {
        "--font-size-xs": "0.75rem",
        "--font-size-sm": "0.875rem",
        "--font-size-base": "1rem",
        "--font-size-md": "1.0625rem",
        "--font-size-lg": "1.125rem",
        "--font-size-xl": "1.25rem",
        "--font-size-2xl": "1.5rem",
        "--font-size-3xl": "1.875rem",
        "--line-height-base": "1.5",
    },
    large: {
        "--font-size-xs": "0.875rem",
        "--font-size-sm": "1rem",
        "--font-size-base": "1.125rem",
        "--font-size-md": "1.1875rem",
        "--font-size-lg": "1.25rem",
        "--font-size-xl": "1.5rem",
        "--font-size-2xl": "1.75rem",
        "--font-size-3xl": "2rem",
        "--line-height-base": "1.6",
    },
    "extra-large": {
        "--font-size-xs": "1rem",
        "--font-size-sm": "1.125rem",
        "--font-size-base": "1.25rem",
        "--font-size-md": "1.375rem",
        "--font-size-lg": "1.5rem",
        "--font-size-xl": "1.75rem",
        "--font-size-2xl": "2rem",
        "--font-size-3xl": "2.25rem",
        "--line-height-base": "1.7",
    },
} as const;

const InterfaceContext = createContext<InterfaceContextType | undefined>(undefined);

function applyDensityCSSVariables(density: InterfaceDensity) {
    const root = document.documentElement;
    const values = DENSITY_CSS_VALUES[density];
    Object.entries(values).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    root.setAttribute("data-density", density);
}

// Root font-size in px — Tailwind uses rem, so changing this scales everything
const ROOT_FONT_SIZE: Record<FontSize, string> = {
    small: "14px",
    medium: "16px",
    large: "18px",
    "extra-large": "20px",
};

function applyFontSizeCSSVariables(fontSize: FontSize) {
    const root = document.documentElement;
    const values = FONT_SIZE_CSS_VALUES[fontSize];
    Object.entries(values).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    // Set root font-size so all rem-based Tailwind utilities scale proportionally
    root.style.fontSize = ROOT_FONT_SIZE[fontSize];
    root.setAttribute("data-font-size", fontSize);
}

function isValidDensity(value: string | null): value is InterfaceDensity {
    return value === "compact" || value === "comfortable" || value === "spacious";
}

function isValidFontSize(value: string | null): value is FontSize {
    return value === "small" || value === "medium" || value === "large" || value === "extra-large";
}

interface InterfaceProviderProps {
    children: React.ReactNode;
}

export function InterfaceProvider({ children }: InterfaceProviderProps) {
    const [density, setDensityState] = useState<InterfaceDensity>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.DENSITY);
        return isValidDensity(stored) ? stored : DEFAULTS.DENSITY;
    });

    const [fontSize, setFontSizeState] = useState<FontSize>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
        return isValidFontSize(stored) ? stored : DEFAULTS.FONT_SIZE;
    });

    useEffect(() => {
        applyDensityCSSVariables(density);
        localStorage.setItem(STORAGE_KEYS.DENSITY, density);
    }, [density]);

    useEffect(() => {
        applyFontSizeCSSVariables(fontSize);
        localStorage.setItem(STORAGE_KEYS.FONT_SIZE, fontSize);
    }, [fontSize]);

    const setDensity = useCallback((newDensity: InterfaceDensity) => {
        setDensityState(newDensity);
    }, []);

    const setFontSize = useCallback((newSize: FontSize) => {
        setFontSizeState(newSize);
    }, []);

    const resetToDefaults = useCallback(() => {
        setDensityState(DEFAULTS.DENSITY);
        setFontSizeState(DEFAULTS.FONT_SIZE);
    }, []);

    const value = useMemo<InterfaceContextType>(() => ({
        density,
        setDensity,
        fontSize,
        setFontSize,
        resetToDefaults,
    }), [density, setDensity, fontSize, setFontSize, resetToDefaults]);

    return (
        <InterfaceContext.Provider value={value}>
            {children}
        </InterfaceContext.Provider>
    );
}

export function useInterface() {
    const context = useContext(InterfaceContext);
    if (!context) {
        throw new Error("useInterface must be used within InterfaceProvider");
    }
    return context;
}

export const DENSITY_LABELS: Record<InterfaceDensity, { label: string; description: string }> = {
    compact: { label: "Compact", description: "Less spacing, more visible content" },
    comfortable: { label: "Comfortable", description: "Balanced spacing (default)" },
    spacious: { label: "Spacious", description: "More spacing, better readability" },
};

export const FONT_SIZE_LABELS: Record<FontSize, { label: string; description: string; preview: string }> = {
    small: { label: "Small", description: "Compact text", preview: "Aa" },
    medium: { label: "Medium", description: "Default", preview: "Aa" },
    large: { label: "Large", description: "Easier to read", preview: "Aa" },
    "extra-large": { label: "Extra Large", description: "Maximum readability", preview: "Aa" },
};
