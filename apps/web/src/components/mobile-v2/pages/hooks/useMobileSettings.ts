/**
 * useMobileSettings - Custom hook for MobileSettings state and logic
 *
 * Extracts state management and handlers from MobileSettings component
 * for consistency with useMobileDrive pattern and improved testability.
 */

import { useCallback, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
    User,
    Palette,
    Shield,
    Key,
    Info,
    LogOut,
    Moon,
    Sun,
    Trash2,
    Mail,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap, hapticMedium } from "@/lib/haptics";
import { trpc } from "@/lib/trpc";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface SettingsItem {
    id: string;
    icon: React.ElementType;
    label: string;
    description?: string;
    path?: string;
    action?: () => void;
    toggle?: {
        value: boolean;
        onChange: (value: boolean) => void;
    };
    danger?: boolean;
}

export interface SettingsGroup {
    title: string;
    items: SettingsItem[];
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

export function useMobileSettings() {
    const [, setLocation] = useLocation();
    const { user, logout } = useAuth();
    const { theme, isDark, toggleMode } = useTheme();

    // Dialog states for profile management
    const [changeEmailOpen, setChangeEmailOpen] = useState(false);
    const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

    // Fetch storage stats
    const { data: storageStats, isLoading: storageLoading } = trpc.files.getStorageStats.useQuery();

    // ─────────────────────────────────────────────────────────
    // HANDLERS
    // ─────────────────────────────────────────────────────────

    const handleLogout = useCallback(() => {
        hapticMedium();
        logout();
        setLocation("/auth/login");
    }, [logout, setLocation]);

    const handleNavigate = useCallback((path: string) => {
        hapticTap();
        setLocation(path);
    }, [setLocation]);

    const toggleDarkMode = useCallback(() => {
        hapticTap();
        toggleMode();
    }, [toggleMode]);

    // ─────────────────────────────────────────────────────────
    // SETTINGS GROUPS
    // ─────────────────────────────────────────────────────────

    const settingsGroups = useMemo<SettingsGroup[]>(() => [
        {
            title: "Account",
            items: [
                {
                    id: "profile",
                    icon: User,
                    label: "Edit Profile",
                    description: "Name and email",
                    path: "/settings?tab=profile",
                },
                {
                    id: "change-email",
                    icon: Mail,
                    label: "Change Email",
                    description: user?.email || "Update your email address",
                    action: () => { hapticTap(); setChangeEmailOpen(true); },
                },
                {
                    id: "security",
                    icon: Shield,
                    label: "Security",
                    description: "Password and authentication",
                    path: "/settings?tab=security",
                },
                {
                    id: "encryption",
                    icon: Key,
                    label: "Encryption",
                    description: "Manage E2E keys",
                    path: "/settings?tab=security",
                },
            ],
        },
        {
            title: "Preferences",
            items: [
                {
                    id: "theme",
                    icon: isDark ? Moon : Sun,
                    label: "Dark Mode",
                    description: isDark ? "Active" : "Inactive",
                    action: toggleDarkMode,
                },
                {
                    id: "appearance",
                    icon: Palette,
                    label: "Appearance",
                    description: "Theme and colors",
                    path: "/settings?tab=interface",
                },
            ],
        },
        {
            title: "About",
            items: [
                {
                    id: "about",
                    icon: Info,
                    label: "About StenVault",
                    description: "Version 2.0.0",
                },
            ],
        },
        {
            title: "", // Empty title for danger/logout group
            items: [
                {
                    id: "delete-account",
                    icon: Trash2,
                    label: "Delete Account",
                    description: "Permanently delete your account",
                    action: () => { hapticMedium(); setDeleteAccountOpen(true); },
                    danger: true,
                },
                {
                    id: "logout",
                    icon: LogOut,
                    label: "Sign Out",
                    action: handleLogout,
                    danger: true,
                },
            ],
        },
    ], [user?.email, isDark, toggleDarkMode, handleLogout, setChangeEmailOpen, setDeleteAccountOpen]);

    return {
        // User data
        user,

        // Storage
        storageStats,
        storageLoading,

        // Theme
        theme,
        isDark,

        // Settings structure
        settingsGroups,

        // Dialog states
        changeEmailOpen,
        setChangeEmailOpen,
        deleteAccountOpen,
        setDeleteAccountOpen,

        // Handlers
        handleNavigate,
        handleLogout,
        toggleDarkMode,
    };
}

export default useMobileSettings;
