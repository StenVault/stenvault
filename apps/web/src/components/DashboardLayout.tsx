/**
 * ═══════════════════════════════════════════════════════════════
 * DASHBOARD LAYOUT - NOCTURNE DESIGN SYSTEM
 * ═══════════════════════════════════════════════════════════════
 *
 * Premium responsive layout with mobile-first approach.
 * Features luxurious gold accents and refined micro-interactions.
 *
 * Renders different layouts based on device:
 * - Mobile: Uses MobileLayout with bottom navigation
 * - Desktop: Uses traditional sidebar layout with premium styling
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { LogOut, PanelLeft, Home, Settings, HardDrive, Shield, Send, Star, Share2, Trash2 } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuroraEyebrow } from "@stenvault/shared/ui/aurora-eyebrow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@stenvault/shared/ui/tooltip";
import { EmailVerificationProvider, EmailVerificationBanner, useEmailVerificationContext } from "./email-verification";
import { CommandPalette } from "./CommandPalette";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { BackgroundOperationsPanel } from "@/components/BackgroundOperationsPanel";
import { MobileShell } from "./mobile-v2";
import { useTheme } from "@/contexts/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@stenvault/shared/utils";
import { trpc } from "@/lib/trpc";
import { VaultStatusIndicator } from "@/components/VaultStatusIndicator";
import { VaultUnlockModal } from "@/components/VaultUnlockModal";
import { useMasterKey } from "@/hooks/useMasterKey";
import { toast } from "@stenvault/shared/lib/toast";
import { uiDescription } from "@stenvault/shared/lib/uiMessage";
import { AlertTriangle, CreditCard, Clock, Users } from "lucide-react";
import { formatBytes } from "@stenvault/shared";
import { useBeforeUnloadWarning } from "@/stores/operationStore";
import { prefetchRoute } from "@/lib/routePrefetch";
import { isItemActive } from "@/lib/sidebarActiveState";
import { EXTERNAL_URLS } from "@/lib/constants/externalUrls";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { InactivityWarningDialog } from "@/components/auth/InactivityWarningDialog";

// Menu items configuration.
// Favorites / Shared / Trash deep-link into Drive's filter chip system (I1) —
// they're sidebar shortcuts, not separate pages. The Drive page reads the
// filter from the URL and swaps in the matching panel (FavoritesPanel,
// SharedPanel, TrashPanel). Transfers is deprecated (I7).
type MenuItem = { icon: typeof Home; label: string; path: string };
type MenuGroup = { label: string; items: MenuItem[] };

const menuGroups: MenuGroup[] = [
  {
    label: "Personal vault",
    items: [
      { icon: Home, label: "Home", path: "/home" },
      { icon: HardDrive, label: "Drive", path: "/drive" },
      { icon: Star, label: "Favorites", path: "/drive?filter=favorites" },
      { icon: Trash2, label: "Trash", path: "/drive?filter=trash" },
    ],
  },
  {
    label: "Sharing",
    items: [
      { icon: Share2, label: "Shared", path: "/drive?filter=shared" },
      { icon: Send, label: "Sends", path: "/sends" },
    ],
  },
];

// Reachable from the user dropdown only — listed here so getPageTitle still resolves them.
const accountItems: MenuItem[] = [
  { icon: Settings, label: "Settings", path: "/settings" },
];

// Flat list for lookups (page title, etc.)
const baseMenuItems: MenuItem[] = [...menuGroups.flatMap(g => g.items), ...accountItems];

// Sidebar width configuration (I5 — Linear/Notion range)
const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 240;
const MAX_WIDTH = 320;

function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(Math.max(value, MIN_WIDTH), MAX_WIDTH);
}

// Banner styling — trust-color tokens (I15). Tailwind's arbitrary-value form with
// color-mix keeps the opacity scale on the /10 /20 /30 rhythm called out in section 10.3.
const BANNER_BASE = "px-4 py-2.5 flex items-center gap-2 text-sm border-b";
const BANNER_TONES = {
  info: "bg-[color-mix(in_srgb,var(--theme-info)_10%,transparent)] border-[color-mix(in_srgb,var(--theme-info)_20%,transparent)] text-[var(--theme-info)]",
  warning: "bg-[color-mix(in_srgb,var(--theme-warning)_10%,transparent)] border-[color-mix(in_srgb,var(--theme-warning)_20%,transparent)] text-[var(--theme-warning)]",
  critical: "bg-[color-mix(in_srgb,var(--theme-error)_10%,transparent)] border-[color-mix(in_srgb,var(--theme-error)_20%,transparent)] text-[var(--theme-error)]",
} as const;

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      aria-label="Dismiss"
    >
      &#x2715;
    </button>
  );
}

// Get page title from location
function getPageTitle(location: string): string {
  const menuItem = baseMenuItems.find(item => item.path === location);
  return menuItem?.label || "StenVault";
}

// Email verification notice component
function EmailVerificationNotice({ user }: { user: { email: string; emailVerified?: Date | null } | null }) {
  const { openModal } = useEmailVerificationContext();

  if (!user || user.emailVerified) {
    return null;
  }

  return (
    <EmailVerificationBanner
      email={user.email}
      onVerifyClick={openModal}
    />
  );
}

// Subscription status banner
function SubscriptionBanner() {
  const { data: subscription } = trpc.stripe.getSubscription.useQuery(undefined, {
    staleTime: 60000,
  });
  const { data: storageStats } = trpc.files.getStorageStats.useQuery(undefined, {
    staleTime: 60000,
  });
  const [quotaDismissed, setQuotaDismissed] = useState(false);

  if (!subscription || subscription.isAdmin) return null;

  // Trial ending soon (3 days or less) — info tone
  if (subscription.status === 'trialing' && subscription.trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil(
      (new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ));
    if (daysLeft <= 3) {
      return (
        <div className={cn(BANNER_BASE, BANNER_TONES.info)}>
          <Clock className="h-4 w-4 shrink-0" />
          <span>Your trial ends in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>. <a href="/settings/billing" className="underline hover:no-underline font-medium">Add a payment method</a> to keep your features.</span>
        </div>
      );
    }
  }

  // Payment failed — grace period, billing breakdown could still be restored
  if (subscription.accessLevel === 'full' && subscription.status === 'past_due') {
    return (
      <div className={cn(BANNER_BASE, BANNER_TONES.critical)}>
        <CreditCard className="h-4 w-4 shrink-0" />
        <span>Payment failed. <a href="/settings/billing" className="underline hover:no-underline font-medium">Update your billing info</a> to keep your features.</span>
      </div>
    );
  }

  // Read-only mode — uploads blocked, access degraded
  if (subscription.accessLevel === 'read_only') {
    return (
      <div className={cn(BANNER_BASE, BANNER_TONES.critical)}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Your account is in <strong>read-only mode</strong>. Uploads are blocked. <a href="/settings/billing" className="underline hover:no-underline font-medium">Update payment</a> to restore uploads.</span>
      </div>
    );
  }

  // Active dispute
  if (subscription.hasActiveDispute) {
    return (
      <div className={cn(BANNER_BASE, BANNER_TONES.critical)}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Your account has an active payment dispute. Contact support if you did not initiate this.</span>
      </div>
    );
  }

  // Suspended
  if (subscription.accessLevel === 'suspended') {
    return (
      <div className={cn(BANNER_BASE, BANNER_TONES.critical)}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Your account is <strong>suspended</strong>. <a href="/settings/billing" className="underline hover:no-underline font-medium">Update payment immediately</a> to restore access.</span>
      </div>
    );
  }

  // Proactive storage quota warning (80% / 90% amber, 95%+ burgundy)
  if (!quotaDismissed && storageStats && storageStats.storageQuota > 0 && !subscription.overQuota) {
    const pct = storageStats.storageUsed / storageStats.storageQuota;
    const used = formatBytes(storageStats.storageUsed);
    const total = formatBytes(storageStats.storageQuota);
    const pctLabel = Math.round(pct * 100);
    if (pct >= 0.95) {
      return (
        <div className={cn(BANNER_BASE, BANNER_TONES.critical)}>
          <HardDrive className="h-4 w-4 shrink-0" />
          <span className="flex-1">Storage almost full: <strong>{used} / {total} ({pctLabel}%)</strong> — <a href="/drive" className="underline hover:no-underline font-medium">delete files</a> or <a href={EXTERNAL_URLS.pricing} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline font-medium">upgrade immediately</a>.</span>
          <DismissButton onClick={() => setQuotaDismissed(true)} />
        </div>
      );
    }
    if (pct >= 0.9) {
      return (
        <div className={cn(BANNER_BASE, BANNER_TONES.warning)}>
          <HardDrive className="h-4 w-4 shrink-0" />
          <span className="flex-1">Storage: <strong>{used} / {total} ({pctLabel}%)</strong>. <a href={EXTERNAL_URLS.pricing} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline font-medium">Upgrade</a> to avoid upload failures.</span>
          <DismissButton onClick={() => setQuotaDismissed(true)} />
        </div>
      );
    }
    if (pct >= 0.8) {
      return (
        <div className={cn(BANNER_BASE, BANNER_TONES.warning)}>
          <HardDrive className="h-4 w-4 shrink-0" />
          <span className="flex-1">Storage: <strong>{used} / {total} ({pctLabel}%)</strong>. <a href={EXTERNAL_URLS.pricing} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline font-medium">Upgrade to Pro</a> for more space.</span>
          <DismissButton onClick={() => setQuotaDismissed(true)} />
        </div>
      );
    }
  }

  // Over quota — critical, uploads blocked
  if (subscription.overQuota) {
    const overUsed = storageStats ? formatBytes(storageStats.storageUsed) : '';
    const overTotal = storageStats ? formatBytes(storageStats.storageQuota) : '';
    const overLabel = storageStats && storageStats.storageQuota > 0
      ? ` (${overUsed} / ${overTotal})`
      : '';
    return (
      <div className={cn(BANNER_BASE, BANNER_TONES.critical)}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>You've exceeded your storage quota{overLabel}. <a href="/drive" className="underline hover:no-underline font-medium">Delete files</a> or <a href={EXTERNAL_URLS.pricing} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline font-medium">upgrade</a> to continue uploading.</span>
      </div>
    );
  }

  return null;
}

// Recovery request banner for trusted contacts
function RecoveryRequestBanner() {
  const { data } = trpc.shamirRecovery.getPendingRecoveryRequests.useQuery(undefined, {
    staleTime: 60000,
  });
  const setLocation = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const requests = data?.requests;
  const actionable = requests ? requests.filter((r: { canReleaseNow: boolean }) => r.canReleaseNow) : [];
  if (actionable.length === 0) return null;

  const first = actionable[0] as { ownerName: string | null; ownerEmail: string };
  const label = first.ownerName || first.ownerEmail;

  return (
    <div className={cn(BANNER_BASE, BANNER_TONES.warning)}>
      <Users className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <strong>{label}</strong> needs your recovery share{actionable.length > 1 ? ` (+${actionable.length - 1} more)` : ""}.{" "}
        <button onClick={() => setLocation("/settings/sign-in-and-recovery")} className="underline hover:no-underline font-medium">
          Go to Security
        </button>
      </span>
      <DismissButton onClick={() => setDismissed(true)} />
    </div>
  );
}

// Desktop layout content props
type DesktopLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

// Desktop sidebar layout content
function DesktopLayoutContent({
  children,
  setSidebarWidth,
}: DesktopLayoutContentProps) {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { pathname: location, search } = useLocation();
  const setLocation = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const { isUnlocked: vaultUnlocked, clearCache: lockVault } = useMasterKey();
  useBeforeUnloadWarning();

  const resolvedGroups: MenuGroup[] = menuGroups;

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: () => setCommandPaletteOpen(true),
    onEscape: () => setCommandPaletteOpen(false),
    onUpload: () => setLocation('/drive'),
  });

  // Surface-initiated opens (Home hint, future callsites) route through this
  // event so they don't need to reach into layout state directly.
  useEffect(() => {
    const handler = () => setCommandPaletteOpen(true);
    window.addEventListener('stenvault:open-command-palette', handler);
    return () => window.removeEventListener('stenvault:open-command-palette', handler);
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      {/* Command Palette - Ctrl+K */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[var(--theme-border-strong)]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-[var(--theme-border-strong)]">
            <div className="flex items-center gap-3 px-3 transition-all w-full group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
              {/* Sidebar toggle — neutral lift (gold reserved for brand + active state) */}
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors duration-200 focus:outline-none shrink-0 text-[var(--theme-fg-muted)] hover:text-[var(--theme-fg-primary)] hover:bg-[var(--theme-border-strong)]"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              {!isCollapsed ? (
                <button
                  onClick={() => setLocation("/home")}
                  className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                >
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-primary-active)] flex items-center justify-center shadow-[0_0_20px_var(--theme-glow-strong)]">
                    <Shield className="h-3.5 w-3.5 text-[var(--theme-bg-base)]" />
                  </div>
                  <span className="font-display font-semibold tracking-tight text-lg truncate bg-clip-text text-transparent bg-gradient-to-r from-[var(--theme-primary-hover)] via-[var(--theme-primary-hover)] to-[var(--theme-primary)]">
                    StenVault
                  </span>
                </button>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-3 py-2">
            <SidebarMenu>
              <AnimatePresence initial={false} mode="popLayout">
              {resolvedGroups.map((group, groupIndex) => (
                <div key={group.label} className={groupIndex > 0 ? "mt-3" : undefined}>
                  <AuroraEyebrow
                    tone="muted"
                    className="px-2 pb-1.5 group-data-[collapsible=icon]:hidden"
                  >
                    {group.label}
                  </AuroraEyebrow>
                  {group.items.map((item, itemIndex) => {
                    const isActive = isItemActive(item.path, location, search);
                    return (
                      <motion.div
                        key={item.path}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.2, delay: itemIndex * 0.03 }}
                        layout
                      >
                      <SidebarMenuItem className="mb-0.5">
                        <div className="relative">
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            onMouseEnter={() => prefetchRoute(item.path.split('?')[0] ?? item.path)}
                            tooltip={item.label}
                            className={cn(
                              "h-10 transition-all duration-200 font-medium rounded-lg relative z-20 overflow-hidden",
                              isActive
                                ? "hover:bg-transparent"
                                // Neutral lift on hover — gold is reserved for active state (I4 + I15).
                                : "text-[var(--theme-fg-secondary)] hover:text-[var(--theme-fg-primary)] hover:bg-[var(--theme-border-strong)]"
                            )}
                          >
                            <item.icon
                              aria-hidden="true"
                              className={cn(
                                "h-4 w-4 transition-colors duration-200 z-20 relative",
                                isActive ? "text-[var(--theme-primary)]" : "text-[var(--theme-fg-muted)]"
                              )}
                            />
                            <span className={cn(
                              "z-20 relative transition-colors duration-200",
                              isActive && "text-[var(--theme-primary)]"
                            )}>
                              {item.label}
                            </span>

                            {/* Active pill — gold is earned here (I4). */}
                            {isActive && (
                              <motion.div
                                layoutId="sidebar-active-pill"
                                className="absolute inset-0 z-10 rounded-lg overflow-hidden"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                              >
                                {/* Gold gradient background */}
                                <div className="absolute inset-0 bg-gradient-to-r from-[var(--theme-glow)] via-[var(--theme-primary-a08)] to-[var(--theme-glow)]" />
                                {/* Gold left indicator bar */}
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-gradient-to-b from-[var(--theme-primary-hover)] via-[var(--theme-primary)] to-[var(--theme-primary-hover)] rounded-full shadow-[0_0_8px_var(--theme-primary-a50)]" />
                                {/* Subtle inner border */}
                                <div className="absolute inset-0 border border-[var(--theme-primary-a15)] rounded-lg" />
                                {/* Ambient glow */}
                                <div className="absolute inset-0 shadow-[inset_0_0_20px_var(--theme-primary-a05)]" />
                              </motion.div>
                            )}
                          </SidebarMenuButton>
                        </div>
                      </SidebarMenuItem>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
              </AnimatePresence>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-[var(--theme-border-strong)]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary-a40)] hover:bg-[var(--theme-border-strong)] group/user"
                  aria-label={`Account menu for ${user?.name || user?.email || "current user"}`}
                >
                  <Avatar className="h-9 w-9 shrink-0 rounded-lg border border-[var(--theme-border-strong)] transition-colors duration-200">
                    <AvatarFallback className="text-xs font-semibold rounded-lg bg-gradient-to-br from-[var(--theme-bg-surface)] to-[var(--theme-bg-elevated)] text-[var(--theme-primary-hover)]">
                      {(user?.name || user?.email)?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {/* Full email lives inside the dropdown — keeps the always-visible
                      footer free of identifiers that would leak in screenshots. The
                      avatar shows a single initial, which is intentional fallback. */}
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-[var(--theme-fg-primary)] transition-colors duration-200">
                      {user?.name || "Account"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="right"
                sideOffset={8}
                className="w-64 rounded-lg border-[var(--theme-border-strong)] bg-[var(--theme-bg-base)] p-1.5"
              >
                <DropdownMenuLabel className="px-2 py-2 font-normal">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9 shrink-0 rounded-lg border border-[var(--theme-border-strong)]">
                      <AvatarFallback className="text-xs font-semibold rounded-lg bg-gradient-to-br from-[var(--theme-bg-surface)] to-[var(--theme-bg-elevated)] text-[var(--theme-primary-hover)]">
                        {(user?.name || user?.email)?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none text-[var(--theme-fg-primary)] truncate">
                        {user?.name || "Account"}
                      </p>
                      <p className="text-xs text-[var(--theme-fg-muted)] truncate mt-1.5">
                        {user?.email || "-"}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[var(--theme-border-strong)]" />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-[var(--theme-error)] focus:text-[var(--theme-error)] focus:bg-[color-mix(in_srgb,var(--theme-error)_10%,transparent)] rounded-md transition-colors"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Footer toolbar — Lock badge + Settings cog share a row when expanded
                (lock left, settings right). Collapsed mode stacks them: settings on top,
                lock on bottom. Discord/Slack-style compact bottom rail. */}
            <TooltipProvider delayDuration={150}>
              <div
                className={cn(
                  "mt-2 px-2 flex items-center justify-between gap-2",
                  "group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-1.5"
                )}
              >
                <VaultStatusIndicator
                  showLabel={!isCollapsed}
                  size="md"
                  // Collapsed mode: square the badge (rounded-lg h-9 w-9) so it lives
                  // in the same visual family as the avatar above and the cog beside it.
                  // Expanded mode: keep the labeled pill — it carries security-state colour.
                  className={isCollapsed ? "rounded-lg w-9 h-9 p-0 justify-center" : undefined}
                  onClick={() => {
                    if (vaultUnlocked) {
                      lockVault();
                      toast.info('Vault locked', { description: uiDescription('Your files are sealed. Unlock again whenever you need them.') });
                    } else {
                      setUnlockModalOpen(true);
                    }
                  }}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setLocation("/settings")}
                      onMouseEnter={() => prefetchRoute("/settings")}
                      aria-label="Settings"
                      aria-current={location.startsWith("/settings") ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-center transition-colors duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary-a40)]",
                        // Compact circle when paired with the labeled pill in expanded mode;
                        // grow to a rounded-lg square in collapsed so it matches the avatar/lock trio.
                        "h-7 w-7 rounded-full group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:rounded-lg",
                        location.startsWith("/settings")
                          ? "text-[var(--theme-primary)] bg-[var(--theme-primary-a08)]"
                          : "text-[var(--theme-fg-muted)] hover:text-[var(--theme-fg-primary)] hover:bg-[var(--theme-border-strong)]"
                      )}
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side={isCollapsed ? "right" : "top"}>
                    Settings
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </SidebarFooter>
        </Sidebar>
        {/* Resize handle — neutral lift on hover */}
        <div
          className={cn(
            "absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors duration-200",
            "hover:bg-[var(--theme-border-strong)]",
            isCollapsed && "hidden"
          )}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="min-h-0 overflow-hidden">
        {/* Email Verification Banner */}
        <EmailVerificationNotice user={user} />
        {/* Subscription Status Banner */}
        <SubscriptionBanner />
        {/* Recovery Request Banner for Trusted Contacts */}
        <RecoveryRequestBanner />

        <main className="flex-1 p-4 min-h-0 overflow-auto relative">{children}</main>
      </SidebarInset>

      <VaultUnlockModal
        isOpen={unlockModalOpen}
        onUnlock={() => setUnlockModalOpen(false)}
        onClose={() => setUnlockModalOpen(false)}
        onForgotPassword={() => {
          setUnlockModalOpen(false);
          setLocation('/auth/recovery-code-reset');
        }}
      />

    </>
  );
}

// Main DashboardLayout component
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!saved) return DEFAULT_WIDTH;
    return clampSidebarWidth(parseInt(saved, 10));
  });
  const { user } = useAuth();
  const { isUnlocked: vaultUnlocked } = useMasterKey();
  const isMobile = useIsMobile();
  const { pathname: location } = useLocation();
  const setLocation = useNavigate();

  // Controlled sidebar state — user preference is the single source of truth.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Handle FAB click - navigate to drive for upload
  const handleUpload = () => {
    setLocation('/drive?action=upload');
  };

  // Handle new folder click
  const handleNewFolder = () => {
    setLocation('/drive?action=new-folder');
  };

  // Vault inactivity timeout
  const { data: timeoutData } = trpc.userPreferences.getInactivityTimeout.useQuery(undefined, {
    staleTime: 300_000,
  });

  const effectiveTimeoutMs = (() => {
    if (!timeoutData) return 15 * 60 * 1000; // Loading — use default
    const minutes = timeoutData.userTimeoutMinutes ?? timeoutData.serverDefaultMinutes;
    if (minutes <= 0) return 0;
    return minutes * 60 * 1000;
  })();

  // Pause the inactivity timer while the vault is already locked — there's
  // nothing to lock, so running the warning dialog and timers would be pure
  // noise. The timer resumes the moment the user unlocks.
  const { state: inactivityState, extendSession, lockNow: inactivityLockNow } =
    useInactivityTimeout({ timeoutMs: effectiveTimeoutMs, enabled: vaultUnlocked });

  const inactivityDialog = effectiveTimeoutMs > 0 && vaultUnlocked ? (
    <InactivityWarningDialog
      open={inactivityState.showWarning}
      remainingSeconds={inactivityState.remainingSeconds}
      onExtend={extendSession}
      onLockNow={inactivityLockNow}
    />
  ) : null;

  // Mobile Layout - New V2 shell with simplified architecture
  if (isMobile) {
    return (
      <>
        <MobileShell
          title={getPageTitle(location)}
          onUpload={handleUpload}
          onNewFolder={handleNewFolder}
        >
          <EmailVerificationNotice user={user} />
          <SubscriptionBanner />
          <RecoveryRequestBanner />
          {children}
        </MobileShell>
        <BackgroundOperationsPanel />
        {inactivityDialog}
      </>
    );
  }

  // Desktop Layout - existing sidebar layout
  return (
    <>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <DesktopLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DesktopLayoutContent>
      </SidebarProvider>
      <BackgroundOperationsPanel />
      {inactivityDialog}
    </>
  );
}
