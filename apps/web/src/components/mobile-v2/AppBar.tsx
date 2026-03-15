/**
 * AppBar - Mobile Header Component (v2)
 * 
 * Simple, reliable header with fixed height.
 * No CSS variables - uses inline styles for critical dimensions.
 */

import { Search, Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap } from "@/lib/haptics";
import { VaultStatusIndicator } from "@/components/VaultStatusIndicator";
import { APP_BAR_HEIGHT } from "./constants";

// Re-export for backward compatibility
export { APP_BAR_HEIGHT };

interface AppBarProps {
    title?: string;
    onSearchClick?: () => void;
    onMenuClick?: () => void;
    onAvatarClick?: () => void;
    onVaultClick?: () => void;
    showMenu?: boolean;
}

export function AppBar({
    title = "StenVault",
    onSearchClick,
    onMenuClick,
    onAvatarClick,
    onVaultClick,
    showMenu = false,
}: AppBarProps) {
    const { user } = useAuth();
    const { theme } = useTheme();

    const handleSearch = () => {
        hapticTap();
        onSearchClick?.();
    };

    const handleMenu = () => {
        hapticTap();
        onMenuClick?.();
    };

    const handleAvatar = () => {
        hapticTap();
        onAvatarClick?.();
    };

    return (
        <header
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: `calc(${APP_BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`,
                paddingTop: "env(safe-area-inset-top, 0px)",
                zIndex: 50,
                backgroundColor: "var(--background)",
                borderBottom: "1px solid var(--border)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: APP_BAR_HEIGHT,
                    paddingLeft: 16,
                    paddingRight: 16,
                }}
            >
                {/* Left Section */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {showMenu && (
                        <button
                            onClick={handleMenu}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 40,
                                height: 40,
                                marginLeft: -8,
                                borderRadius: 8,
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--foreground)",
                            }}
                            aria-label="Menu"
                        >
                            <Menu size={20} />
                        </button>
                    )}
                    <h1
                        style={{
                            fontSize: 18,
                            fontWeight: 600,
                            color: "var(--foreground)",
                            margin: 0,
                            letterSpacing: "-0.02em",
                        }}
                    >
                        {title}
                    </h1>
                </div>

                {/* Vault Status */}
                <VaultStatusIndicator size="sm" onClick={onVaultClick} />

                {/* Right Section */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Search Button */}
                    <button
                        onClick={handleSearch}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--muted-foreground)",
                        }}
                        aria-label="Search"
                    >
                        <Search size={20} />
                    </button>

                    {/* User Avatar */}
                    <button
                        onClick={handleAvatar}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                        }}
                        aria-label="Perfil"
                    >
                        <Avatar
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                            }}
                        >
                            <AvatarFallback
                                style={{
                                    fontSize: 12,
                                    fontWeight: 500,
                                    backgroundColor: `${theme.brand.primary}15`,
                                    color: theme.brand.primary,
                                    borderRadius: 8,
                                }}
                            >
                                {user?.name?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                        </Avatar>
                    </button>
                </div>
            </div>
        </header>
    );
}

export default AppBar;
