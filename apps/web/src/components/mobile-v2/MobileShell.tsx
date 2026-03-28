/**
 * MobileShell - Main Layout Wrapper (v2)
 * 
 * Single shell component that handles all mobile layout.
 * Uses fixed pixel values, not CSS variables.
 * Simple and robust.
 */

import { useState, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppBar, APP_BAR_HEIGHT } from "./AppBar";
import { BottomNav, BOTTOM_NAV_HEIGHT } from "./BottomNav";
import { ActionSheet } from "./ActionSheet";
import { CommandPalette } from "@/components/CommandPalette";
import { VaultUnlockModal } from "@/components/VaultUnlockModal";
import { useMasterKey } from "@/hooks/useMasterKey";
import { toast } from "sonner";

interface MobileShellProps {
    children: ReactNode;
    /** Page title shown in AppBar */
    title?: string;
    /** Hide the AppBar */
    hideAppBar?: boolean;
    /** Hide the BottomNav */
    hideBottomNav?: boolean;
    /** Show hamburger menu */
    showMenu?: boolean;
    /** Callback when upload is requested */
    onUpload?: () => void;
    /** Callback when new folder is requested */
    onNewFolder?: () => void;
}

export function MobileShell({
    children,
    title,
    hideAppBar = false,
    hideBottomNav = false,
    showMenu = false,
    onUpload,
    onNewFolder,
}: MobileShellProps) {
    const { pathname: location } = useLocation();
    const setLocation = useNavigate();
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [actionSheetOpen, setActionSheetOpen] = useState(false);
    const [unlockModalOpen, setUnlockModalOpen] = useState(false);
    const { isUnlocked: vaultUnlocked, clearCache: lockVault } = useMasterKey();

    // Calculate padding based on what's visible
    const topPadding = hideAppBar ? 0 : APP_BAR_HEIGHT;
    const bottomPadding = hideBottomNav ? 0 : BOTTOM_NAV_HEIGHT;

    // Handlers
    const handleSearchClick = () => {
        setCommandPaletteOpen(true);
    };

    const handleAvatarClick = () => {
        setLocation("/settings");
    };

    const handleFabClick = () => {
        setActionSheetOpen(true);
    };

    const handleUpload = () => {
        setActionSheetOpen(false);
        onUpload?.();
    };

    const handleNewFolder = () => {
        setActionSheetOpen(false);
        onNewFolder?.();
    };

    const handleVaultClick = () => {
        if (vaultUnlocked) {
            lockVault();
            toast.info('Vault locked', { description: 'Your encryption keys have been cleared from memory.' });
        } else {
            setUnlockModalOpen(true);
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                minHeight: "100dvh",
                width: "100%",
                backgroundColor: "var(--background)",
                overflow: "hidden",
            }}
        >
            {/* Command Palette - Global Search */}
            <CommandPalette
                open={commandPaletteOpen}
                onOpenChange={setCommandPaletteOpen}
                onUpload={handleUpload}
                onNewFolder={handleNewFolder}
            />

            {/* Action Sheet - FAB Menu */}
            <ActionSheet
                open={actionSheetOpen}
                onOpenChange={setActionSheetOpen}
                onUpload={handleUpload}
                onNewFolder={handleNewFolder}
            />

            {/* Vault Unlock Modal */}
            <VaultUnlockModal
                isOpen={unlockModalOpen}
                onUnlock={() => setUnlockModalOpen(false)}
                onClose={() => setUnlockModalOpen(false)}
            />

            {/* AppBar - Fixed Header */}
            {!hideAppBar && (
                <AppBar
                    title={title}
                    showMenu={showMenu}
                    onSearchClick={handleSearchClick}
                    onAvatarClick={handleAvatarClick}
                    onVaultClick={handleVaultClick}
                />
            )}

            {/* Main Content Area */}
            <main
                style={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    WebkitOverflowScrolling: "touch",
                    paddingTop: hideAppBar
                        ? "env(safe-area-inset-top, 0px)"
                        : `calc(${topPadding}px + env(safe-area-inset-top, 0px))`,
                    paddingBottom: hideBottomNav
                        ? "env(safe-area-inset-bottom, 0px)"
                        : `calc(${bottomPadding}px + env(safe-area-inset-bottom, 0px))`,
                }}
            >
                {children}
            </main>

            {/* BottomNav - Fixed Footer */}
            {!hideBottomNav && (
                <BottomNav onFabClick={handleFabClick} />
            )}
        </div>
    );
}

export default MobileShell;
