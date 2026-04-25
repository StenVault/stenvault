import { useState } from "react";
import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import { Button } from "@stenvault/shared/ui/button";
import { Label } from "@stenvault/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@stenvault/shared/ui/radio-group";
import { Badge } from "@stenvault/shared/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@stenvault/shared/ui/alert-dialog";
import {
    useInterface,
    DENSITY_LABELS,
    FONT_SIZE_LABELS,
    type InterfaceDensity,
    type FontSize,
} from "@/contexts/InterfaceContext";
import { useTheme } from "@/contexts/ThemeContext";
import { themes, type ThemeName } from "@/styles/themes";
import {
    Monitor,
    Moon,
    Sun,
    Palette,
    LayoutGrid,
    Type,
    RotateCcw,
    Minus,
    Square,
    Maximize2,
    Check,
} from "lucide-react";
import { motion } from "framer-motion";

/**
 * InterfaceSettings Component
 * 
 * Provides UI controls for customizing the application's visual appearance:
 * - Theme selector with visual previews
 * - Interface density (Compact/Comfortable/Spacious)
 * - Font size (Small/Medium/Large/Extra Large)
 * 
 * All preferences are persisted in localStorage and applied via CSS variables.
 */
export function InterfaceSettings() {
    const { themeName, setTheme, isDark, toggleMode, availableThemes } = useTheme();
    const { density, setDensity, fontSize, setFontSize, resetToDefaults } = useInterface();
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

    const densityOptions: InterfaceDensity[] = ["compact", "comfortable", "spacious"];
    const fontSizeOptions: FontSize[] = ["small", "medium", "large", "extra-large"];

    const getDensityIcon = (option: InterfaceDensity) => {
        switch (option) {
            case "compact": return <Minus className="w-4 h-4" />;
            case "comfortable": return <Square className="w-4 h-4" />;
            case "spacious": return <Maximize2 className="w-4 h-4" />;
        }
    };

    // Group themes by mode
    const darkThemes = availableThemes.filter(t => themes[t.name as ThemeName]?.mode === 'dark');
    const lightThemes = availableThemes.filter(t => themes[t.name as ThemeName]?.mode === 'light');

    // Get color preview for a theme
    const getThemeColors = (name: ThemeName) => {
        const theme = themes[name];
        if (!theme) return { bg: '#1a1a1a', primary: '#10b981', text: '#f4f4f5' };
        return {
            bg: theme.background.base,
            primary: theme.brand.primary,
            text: theme.foreground.primary,
            surface: theme.background.surface,
        };
    };

    const modeIconClass = isDark
        ? "w-5 h-5 text-[var(--theme-info)]"
        : "w-5 h-5 text-[var(--theme-primary)]";
    const modeChipClass = isDark
        ? "p-2 rounded-lg bg-[var(--theme-info)]/15 text-[var(--theme-info)]"
        : "p-2 rounded-lg bg-[var(--theme-primary)]/15 text-[var(--theme-primary)]";

    return (
        <div className="space-y-6">
            {/* Quick Toggle */}
            <AuroraCard variant="default">
                <div className="mb-4">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                        {isDark ? <Moon className={modeIconClass} /> : <Sun className={modeIconClass} />}
                        Appearance Mode
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">Quickly toggle between light and dark mode</p>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-3">
                        <div className={modeChipClass}>
                            {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        </div>
                        <div>
                            <p className="font-medium">
                                {isDark ? 'Dark' : 'Light'} Mode Active
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Current theme: {themes[themeName]?.displayName || themeName}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={toggleMode} className="gap-2">
                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        Switch to {isDark ? 'Light' : 'Dark'}
                    </Button>
                </div>
            </AuroraCard>

            {/* Theme Selector */}
            <AuroraCard variant="default">
                <div className="mb-4">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                        <Palette className="w-5 h-5" />
                        Choose Theme
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">Select a theme to customize the appearance</p>
                </div>
                <div className="space-y-6">
                    {/* Dark Themes */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Moon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Dark Themes</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {darkThemes.map((t) => {
                                const colors = getThemeColors(t.name as ThemeName);
                                const isSelected = themeName === t.name;

                                return (
                                    <motion.button
                                        key={t.name}
                                        onClick={() => setTheme(t.name as ThemeName)}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`relative p-4 rounded-lg border-2 transition-all text-left ${isSelected
                                                ? 'border-primary ring-2 ring-primary/20'
                                                : 'border-border hover:border-primary/50'
                                            }`}
                                        style={{ backgroundColor: colors.bg }}
                                    >
                                        {/* Selected indicator */}
                                        {isSelected && (
                                            <div
                                                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                                                style={{ backgroundColor: colors.primary }}
                                            >
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}

                                        {/* Color preview bars */}
                                        <div className="flex gap-1 mb-3">
                                            <div
                                                className="h-8 w-8 rounded-md"
                                                style={{ backgroundColor: colors.primary }}
                                            />
                                            <div
                                                className="h-8 flex-1 rounded-md"
                                                style={{ backgroundColor: colors.surface }}
                                            />
                                        </div>

                                        {/* Theme info */}
                                        <div>
                                            <p className="font-medium text-sm" style={{ color: colors.text }}>
                                                {t.displayName}
                                            </p>
                                            <p className="text-xs opacity-60" style={{ color: colors.text }}>
                                                {t.description}
                                            </p>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Light Themes */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Sun className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Light Themes</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {lightThemes.map((t) => {
                                const colors = getThemeColors(t.name as ThemeName);
                                const isSelected = themeName === t.name;

                                return (
                                    <motion.button
                                        key={t.name}
                                        onClick={() => setTheme(t.name as ThemeName)}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`relative p-4 rounded-lg border-2 transition-all text-left ${isSelected
                                                ? 'border-primary ring-2 ring-primary/20'
                                                : 'border-border hover:border-primary/50'
                                            }`}
                                        style={{ backgroundColor: colors.bg }}
                                    >
                                        {/* Selected indicator */}
                                        {isSelected && (
                                            <div
                                                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                                                style={{ backgroundColor: colors.primary }}
                                            >
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}

                                        {/* Color preview bars */}
                                        <div className="flex gap-1 mb-3">
                                            <div
                                                className="h-8 w-8 rounded-md"
                                                style={{ backgroundColor: colors.primary }}
                                            />
                                            <div
                                                className="h-8 flex-1 rounded-md border"
                                                style={{ backgroundColor: colors.surface }}
                                            />
                                        </div>

                                        {/* Theme info */}
                                        <div>
                                            <p className="font-medium text-sm" style={{ color: colors.text }}>
                                                {t.displayName}
                                            </p>
                                            <p className="text-xs opacity-60" style={{ color: colors.text }}>
                                                {t.description}
                                            </p>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </AuroraCard>

            {/* Density Card */}
            <AuroraCard variant="default">
                <div className="mb-4">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                        <LayoutGrid className="w-5 h-5" />
                        Interface Density
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Adjust the overall spacing of interface elements
                    </p>
                </div>
                <div>
                    <RadioGroup
                        value={density}
                        onValueChange={(value) => setDensity(value as InterfaceDensity)}
                        className="grid gap-3"
                    >
                        {densityOptions.map((option) => {
                            const { label, description } = DENSITY_LABELS[option];
                            const isSelected = density === option;
                            const isDefault = option === "comfortable";

                            return (
                                <Label
                                    key={option}
                                    htmlFor={`density-${option}`}
                                    className={`
                    flex items-center gap-4 p-4 rounded-sm border cursor-pointer transition-all
                    ${isSelected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                                        }
                  `}
                                >
                                    <RadioGroupItem value={option} id={`density-${option}`} />
                                    <div className={`
                    p-2 rounded-sm transition-colors
                    ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}
                  `}>
                                        {getDensityIcon(option)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{label}</span>
                                            {isDefault && (
                                                <Badge variant="secondary" className="text-xs">
                                                    Default
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{description}</p>
                                    </div>
                                    {/* Visual Preview */}
                                    <div className="hidden sm:flex items-center gap-1">
                                        {option === "compact" && (
                                            <div className="flex gap-0.5">
                                                <div className="w-1.5 h-3 bg-muted-foreground/30 rounded-sm" />
                                                <div className="w-1.5 h-3 bg-muted-foreground/30 rounded-sm" />
                                                <div className="w-1.5 h-3 bg-muted-foreground/30 rounded-sm" />
                                            </div>
                                        )}
                                        {option === "comfortable" && (
                                            <div className="flex gap-1">
                                                <div className="w-2 h-4 bg-muted-foreground/30 rounded-sm" />
                                                <div className="w-2 h-4 bg-muted-foreground/30 rounded-sm" />
                                                <div className="w-2 h-4 bg-muted-foreground/30 rounded-sm" />
                                            </div>
                                        )}
                                        {option === "spacious" && (
                                            <div className="flex gap-1.5">
                                                <div className="w-3 h-5 bg-muted-foreground/30 rounded-sm" />
                                                <div className="w-3 h-5 bg-muted-foreground/30 rounded-sm" />
                                                <div className="w-3 h-5 bg-muted-foreground/30 rounded-sm" />
                                            </div>
                                        )}
                                    </div>
                                </Label>
                            );
                        })}
                    </RadioGroup>
                </div>
            </AuroraCard>

            {/* Font Size Card */}
            <AuroraCard variant="default">
                <div className="mb-4">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                        <Type className="w-5 h-5" />
                        Font Size
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Adjust the base text size for better readability
                    </p>
                </div>
                <div>
                    <RadioGroup
                        value={fontSize}
                        onValueChange={(value) => setFontSize(value as FontSize)}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                    >
                        {fontSizeOptions.map((option) => {
                            const { label, description } = FONT_SIZE_LABELS[option];
                            const isSelected = fontSize === option;
                            const isDefault = option === "medium";

                            // Dynamic preview font size
                            const previewSize = {
                                small: "text-sm",
                                medium: "text-base",
                                large: "text-lg",
                                "extra-large": "text-xl",
                            }[option];

                            return (
                                <Label
                                    key={option}
                                    htmlFor={`font-${option}`}
                                    className={`
                    flex flex-col items-center gap-2 p-4 rounded-sm border cursor-pointer transition-all text-center
                    ${isSelected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                                        }
                  `}
                                >
                                    <RadioGroupItem value={option} id={`font-${option}`} className="sr-only" />

                                    {/* Font Preview */}
                                    <span className={`font-serif font-semibold ${previewSize} ${isSelected ? "text-primary" : "text-foreground"}`}>
                                        Aa
                                    </span>

                                    <div className="space-y-0.5">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <span className="font-medium text-sm">{label}</span>
                                            {isDefault && (
                                                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                                    Default
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                    </div>

                                    {/* Selection Indicator */}
                                    {isSelected && (
                                        <div className="w-2 h-2 rounded-full bg-primary" />
                                    )}
                                </Label>
                            );
                        })}
                    </RadioGroup>
                </div>
            </AuroraCard>

            {/* Reset Section */}
            <AuroraCard variant="default">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium">Reset Preferences</p>
                        <p className="text-sm text-muted-foreground">
                            Restore all interface settings to their defaults
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setResetConfirmOpen(true)}
                        className="gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                    </Button>
                </div>
            </AuroraCard>

            <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset interface preferences?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will restore theme, density, and font size to their default values.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { resetToDefaults(); setResetConfirmOpen(false); }}>
                            Reset
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Live Preview Info */}
            <div className="text-center text-sm text-muted-foreground">
                <p>Changes are applied instantly and saved automatically.</p>
            </div>
        </div>
    );
}
