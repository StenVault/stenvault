/**
 * BottomNav - Mobile Navigation Bar (v2)
 * 
 * Clean bottom navigation with integrated FAB.
 * Fixed height with safe area support.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Drawer } from "vaul";
import { motion } from "framer-motion";
import {
    Home,
    HardDrive,
    Plus,
    MessageCircle,
    MoreHorizontal,
    Trash2,
    Share2,
    Star,
    Send,
    Settings,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { hapticTap, hapticMedium } from "@/lib/haptics";
import {
    BOTTOM_NAV_HEIGHT,
    FAB_SIZE
} from "./constants";

// Re-export for backward compatibility
export { BOTTOM_NAV_HEIGHT };

interface NavItem {
    id: string;
    icon: React.ElementType;
    label: string;
    path: string;
}

const navItems: NavItem[] = [
    { id: "home", icon: Home, label: "Home", path: "/home" },
    { id: "drive", icon: HardDrive, label: "Drive", path: "/drive" },
    { id: "fab", icon: Plus, label: "Add", path: "" }, // FAB - no path
    { id: "chat", icon: MessageCircle, label: "Chat", path: "/chat" },
    { id: "more", icon: MoreHorizontal, label: "More", path: "" }, // Opens drawer
];

interface MoreMenuItem {
    icon: React.ElementType;
    label: string;
    path: string;
}

const moreMenuItems: MoreMenuItem[] = [
    { icon: Star, label: "Favorites", path: "/favorites" },
    { icon: Trash2, label: "Trash", path: "/trash" },
    { icon: Share2, label: "Shares", path: "/shares" },
    { icon: Send, label: "Sent", path: "/sends" },
    { icon: Settings, label: "Settings", path: "/settings" },
];

interface BottomNavProps {
    onFabClick?: () => void;
}

export function BottomNav({ onFabClick }: BottomNavProps) {
    const [location, setLocation] = useLocation();
    const { theme } = useTheme();
    const [moreOpen, setMoreOpen] = useState(false);

    const handleNavClick = (item: NavItem) => {
        if (item.id === "fab") {
            hapticMedium();
            onFabClick?.();
        } else if (item.id === "more") {
            hapticTap();
            setMoreOpen(true);
        } else {
            hapticTap();
            setLocation(item.path);
        }
    };

    const handleMoreItemClick = (path: string) => {
        hapticTap();
        setMoreOpen(false);
        setLocation(path);
    };

    const isActive = (path: string) => {
        if (path === "/home") return location === "/" || location === "/home";
        return location.startsWith(path);
    };

    const isMoreActive =
        location.startsWith("/favorites") ||
        location.startsWith("/trash") ||
        location.startsWith("/shares") ||
        location.startsWith("/sends") ||
        location.startsWith("/settings");

    return (
        <>
        <Drawer.Root open={moreOpen} onOpenChange={setMoreOpen}>
            <Drawer.Portal>
                <Drawer.Overlay
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.4)",
                        zIndex: 100,
                    }}
                />
                <Drawer.Content
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="more-menu-title"
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "var(--background)",
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        zIndex: 100,
                        outline: "none",
                        paddingBottom: "env(safe-area-inset-bottom, 0px)",
                    }}
                >
                    {/* Drag Handle */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            paddingTop: 12,
                            paddingBottom: 8,
                        }}
                    >
                        <div
                            style={{
                                width: 36,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: "var(--muted-foreground)",
                                opacity: 0.3,
                            }}
                        />
                    </div>

                    <Drawer.Title
                        id="more-menu-title"
                        style={{
                            fontSize: 18,
                            fontWeight: 600,
                            padding: "4px 20px 16px",
                            margin: 0,
                            color: "var(--foreground)",
                        }}
                    >
                        More
                    </Drawer.Title>

                    <div
                        style={{
                            padding: "0 16px 24px",
                        }}
                    >
                        {moreMenuItems.map((item, index) => {
                            const Icon = item.icon;
                            const active = location.startsWith(item.path);
                            const isLast = index === moreMenuItems.length - 1;

                            return (
                                <motion.button
                                    key={item.path}
                                    onClick={() => handleMoreItemClick(item.path)}
                                    whileTap={{ scale: 0.98 }}
                                    aria-label={item.label}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 14,
                                        width: "100%",
                                        padding: "14px 8px",
                                        backgroundColor: "transparent",
                                        border: "none",
                                        borderBottom: isLast
                                            ? "none"
                                            : "1px solid var(--border)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: 40,
                                            height: 40,
                                            borderRadius: 12,
                                            backgroundColor: active
                                                ? `${theme.brand.primary}15`
                                                : "var(--muted)",
                                        }}
                                    >
                                        <Icon
                                            size={20}
                                            style={{
                                                color: active
                                                    ? theme.brand.primary
                                                    : "var(--foreground)",
                                            }}
                                        />
                                    </div>
                                    <p
                                        style={{
                                            fontSize: 15,
                                            fontWeight: active ? 600 : 500,
                                            color: active
                                                ? theme.brand.primary
                                                : "var(--foreground)",
                                            margin: 0,
                                        }}
                                    >
                                        {item.label}
                                    </p>
                                </motion.button>
                            );
                        })}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
        <nav
            style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                height: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                zIndex: 50,
                backgroundColor: "var(--background)",
                borderTop: "1px solid var(--border)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-around",
                    height: BOTTOM_NAV_HEIGHT,
                    paddingLeft: 8,
                    paddingRight: 8,
                }}
            >
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = item.id === "more"
                        ? isMoreActive
                        : item.id !== "fab" && isActive(item.path);
                    const isFab = item.id === "fab";

                    if (isFab) {
                        // FAB Button - elevated center button
                        return (
                            <motion.button
                                key={item.id}
                                onClick={() => handleNavClick(item)}
                                whileTap={{ scale: 0.9 }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: FAB_SIZE,
                                    height: FAB_SIZE,
                                    borderRadius: 16,
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: theme.brand.primary,
                                    color: "#FFFFFF",
                                    boxShadow: `0 4px 12px ${theme.brand.primary}40`,
                                    marginTop: -12, // Elevate above nav bar
                                }}
                                aria-label={item.label}
                            >
                                <Icon size={24} strokeWidth={2.5} />
                            </motion.button>
                        );
                    }

                    // Regular nav item
                    return (
                        <motion.button
                            key={item.id}
                            onClick={() => handleNavClick(item)}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                                width: 64,
                                height: 48,
                                borderRadius: 12,
                                border: "none",
                                cursor: "pointer",
                                backgroundColor: active ? `${theme.brand.primary}15` : "transparent",
                                color: active ? theme.brand.primary : "var(--muted-foreground)",
                                transition: "all 0.2s ease",
                            }}
                            aria-label={item.label}
                            aria-current={active ? "page" : undefined}
                        >
                            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: active ? 600 : 400,
                                    letterSpacing: "0.01em",
                                }}
                            >
                                {item.label}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </nav>
        </>
    );
}

export default BottomNav;
