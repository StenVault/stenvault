/**
 * ═══════════════════════════════════════════════════════════════
 * THEME SWITCHER COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *
 * A beautiful dropdown component for switching between themes.
 * Includes preview swatches and descriptions.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Palette, ChevronDown } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { themes, ThemeName } from '@/styles/themes';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeSwatchProps {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
}

function ThemeSwatch({ primary, secondary, accent, background }: ThemeSwatchProps) {
    return (
        <div
            className="flex gap-0.5 rounded-md overflow-hidden w-12 h-6 border border-white/10"
            style={{ backgroundColor: background }}
        >
            <div className="flex-1" style={{ backgroundColor: primary }} />
            <div className="flex-1" style={{ backgroundColor: secondary }} />
            <div className="flex-1" style={{ backgroundColor: accent }} />
        </div>
    );
}

interface ThemeSwitcherProps {
    variant?: 'default' | 'minimal' | 'icon';
    align?: 'start' | 'center' | 'end';
    className?: string;
}

export function ThemeSwitcher({
    variant = 'default',
    align = 'end',
    className
}: ThemeSwitcherProps) {
    const { theme, themeName, setTheme, availableThemes } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {variant === 'icon' ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("relative", className)}
                    >
                        <Palette className="h-4 w-4" />
                        <span className="sr-only">Change theme</span>
                    </Button>
                ) : variant === 'minimal' ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn("gap-2", className)}
                    >
                        <ThemeSwatch
                            primary={theme.brand.primary}
                            secondary={theme.background.surface}
                            accent={theme.brand.accent}
                            background={theme.background.base}
                        />
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        className={cn("gap-3 h-auto py-2 px-3", className)}
                    >
                        <ThemeSwatch
                            primary={theme.brand.primary}
                            secondary={theme.background.surface}
                            accent={theme.brand.accent}
                            background={theme.background.base}
                        />
                        <div className="flex flex-col items-start">
                            <span className="text-sm font-medium">{theme.displayName}</span>
                            <span className="text-xs text-muted-foreground">{theme.description}</span>
                        </div>
                        <ChevronDown className="h-4 w-4 opacity-50 ml-auto" />
                    </Button>
                )}
            </DropdownMenuTrigger>

            <DropdownMenuContent align={align} className="w-64">
                <DropdownMenuLabel className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Color Themes
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {availableThemes.map(({ name, displayName, description }) => {
                    const themeData = themes[name];
                    const isActive = name === themeName;

                    return (
                        <DropdownMenuItem
                            key={name}
                            onClick={() => setTheme(name)}
                            className={cn(
                                "flex items-center gap-3 py-3 cursor-pointer",
                                isActive && "bg-primary/10"
                            )}
                        >
                            <ThemeSwatch
                                primary={themeData.brand.primary}
                                secondary={themeData.background.surface}
                                accent={themeData.brand.accent}
                                background={themeData.background.base}
                            />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{displayName}</span>
                                    <AnimatePresence>
                                        {isActive && (
                                            <motion.span
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                exit={{ scale: 0 }}
                                            >
                                                <Check className="h-3.5 w-3.5 text-primary" />
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <span className="text-xs text-muted-foreground">{description}</span>
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * Floating Theme Picker - For quick access in the corner
 */
export function FloatingThemePicker() {
    const { theme, setTheme, availableThemes, themeName } = useTheme();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-4 right-4 z-50"
        >
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full",
                            "bg-background/80 backdrop-blur-lg border border-border",
                            "shadow-lg hover:shadow-xl transition-shadow"
                        )}
                    >
                        <motion.div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: theme.brand.primary }}
                            animate={{
                                boxShadow: [
                                    `0 0 0 0 ${theme.effects.glow}`,
                                    `0 0 0 4px ${theme.effects.glow}`,
                                    `0 0 0 0 ${theme.effects.glow}`,
                                ],
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                        <span className="text-sm font-medium">{theme.displayName}</span>
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </motion.button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" side="top" className="w-56 mb-2">
                    {availableThemes.map(({ name, displayName }) => {
                        const themeData = themes[name];
                        const isActive = name === themeName;

                        return (
                            <DropdownMenuItem
                                key={name}
                                onClick={() => setTheme(name)}
                                className="flex items-center gap-3 py-2"
                            >
                                <div className="flex gap-1">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: themeData.brand.primary }}
                                    />
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: themeData.brand.accent }}
                                    />
                                </div>
                                <span className="flex-1">{displayName}</span>
                                {isActive && <Check className="h-4 w-4 text-primary" />}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </motion.div>
    );
}

export default ThemeSwitcher;
