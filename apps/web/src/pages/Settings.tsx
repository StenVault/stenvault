/**
 * Settings Page
 *
 * Path-based 5-group sub-sidebar shell. Each group lives at /settings/{slug}
 * and renders inside SettingsLayout. Legacy ?tab=X URLs (CommandPalette,
 * banner anchors, EncryptionSetup hand-off, Stripe redirects already in the
 * wild) are redirected to the new URLs on first load so bookmarks and
 * external links keep working.
 *
 * The /settings root renders SettingsHome — a directory listing the three
 * meta-groups (Account / Security / App) with one dynamic state line per row.
 *
 * Mobile uses the dedicated MobileSettings page; this shell is desktop-only.
 */

import { useEffect, useMemo } from 'react';
import { Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@stenvault/shared/lib/toast';
import { FadeIn } from '@stenvault/shared/ui/animated';
import { trpc } from '@/lib/trpc';
import { useIsMobile } from '@/hooks/useMobile';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { MobileSettings } from '@/components/mobile-v2/pages/MobileSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { SettingsHome } from '@/components/settings/SettingsHome';
import { ProfileGroup } from '@/components/settings/groups/ProfileGroup';
import { SignInAndRecoveryGroup } from '@/components/settings/groups/SignInAndRecoveryGroup';
import { EncryptionGroup } from '@/components/settings/groups/EncryptionGroup';
import { BillingGroup } from '@/components/settings/groups/BillingGroup';
import { PreferencesGroup } from '@/components/settings/groups/PreferencesGroup';
import { OrganizationsGroup } from '@/components/settings/groups/OrganizationsGroup';
import type { SubscriptionData, StorageStats } from '@/types/settings';

/**
 * Map of legacy `?tab=` values to new group slugs. Anything not listed
 * falls through to /settings (the new directory home). Exported so the
 * redirect contract can be unit-tested without rendering the routing tree.
 */
export const LEGACY_TAB_MAP: Record<string, string> = {
    profile: 'profile',
    security: 'sign-in-and-recovery',
    devices: 'sign-in-and-recovery',
    interface: 'preferences',
    system: 'preferences',
    storage: 'billing',
    subscription: 'billing',
    organizations: 'organizations',
};

/**
 * Resolve a legacy ?tab= value to a path component, or null if the caller
 * should land on the directory home (`/settings`). Unknown values resolve
 * to null so a stale bookmark with a junk tab no longer hijacks navigation
 * to Profile — instead it lands on the new directory.
 */
export function resolveLegacyTab(tab: string | null): string | null {
    if (!tab) return null;
    return LEGACY_TAB_MAP[tab] ?? null;
}

export default function Settings() {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <MobileSettings />;
    }

    return <DesktopSettings />;
}

function DesktopSettings() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    // Org membership decides whether the Organizations group renders.
    const { organizations } = useOrganizationContext();
    const showOrganizations = organizations.length > 0;

    // Stripe gates the Billing group AND the BillingGroup props.
    const { data: subscription } = trpc.stripe.getSubscription.useQuery();
    const { data: isStripeConfigured } = trpc.stripe.isConfigured.useQuery(undefined, {
        staleTime: 300_000,
    });
    const isStripeActive = isStripeConfigured?.active === true;
    const showBilling = isStripeActive;

    // Shared data for groups that need it (Preferences > System health,
    // Billing > Storage, SettingsHome > Billing/Storage rows).
    const { data: health } = trpc.settings.getSystemHealth.useQuery(undefined, { staleTime: 60_000 });
    const { data: storageStats, refetch: refetchStorage } = trpc.files.getStorageStats.useQuery();

    // Legacy ?tab= → path redirect. Runs ONCE per URL; preserves other params
    // (notably ?success=true / ?canceled=true from Stripe checkout return URLs).
    // Unknown / null tabs land on /settings (the directory home) — no more
    // silent fallback to Profile.
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (!tab) return;
        const target = resolveLegacyTab(tab);
        const next = new URLSearchParams(searchParams);
        next.delete('tab');
        const qs = next.toString();
        const path = target ? `/settings/${target}` : '/settings';
        navigate(`${path}${qs ? `?${qs}` : ''}`, { replace: true });
    }, [searchParams, navigate]);

    // Stripe checkout return toasts. Runs after the ?tab= redirect settles
    // (the second render once the URL no longer carries a `tab` param).
    useEffect(() => {
        if (searchParams.get('tab')) return;
        if (searchParams.get('success') === 'true') {
            toast.success('Subscription activated.');
            setSearchParams((prev) => {
                prev.delete('success');
                return prev;
            }, { replace: true });
        } else if (searchParams.get('canceled') === 'true') {
            toast.info('Checkout canceled — no charges were made.');
            setSearchParams((prev) => {
                prev.delete('canceled');
                return prev;
            }, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const billingProps = useMemo(
        () => ({
            isAdmin: subscription?.isAdmin || false,
            subscription: subscription as SubscriptionData | undefined,
            isStripeActive,
            storageStats,
            refetchStorage,
        }),
        [subscription, isStripeActive, storageStats, refetchStorage],
    );

    const homeProps = useMemo(
        () => ({
            showBilling,
            showOrganizations,
            subscription: subscription as SubscriptionData | undefined,
            storageStats: storageStats as StorageStats | undefined,
        }),
        [showBilling, showOrganizations, subscription, storageStats],
    );

    // While the legacy ?tab= redirect is in flight on this render, skip
    // the Routes tree to avoid a "404 within Settings" flash.
    const hasLegacyTab = searchParams.get('tab') !== null;
    const isOnSettingsRoot = location.pathname === '/settings' || location.pathname === '/settings/';

    return (
        // `absolute inset-0` makes the page fill <main>'s padding box. <main>
        // is `position: relative` and has bounded height (flex-1 + min-h-0 in
        // SidebarInset's flex column), so this gives Settings a determinate
        // height without depending on `h-full` resolving against a parent that
        // sizes via flex but not via the `height` property — which is exactly
        // why h-full was silently failing here.
        <div className="absolute inset-0 flex flex-col">
            <div className="flex flex-col max-w-5xl mx-auto w-full h-full px-4 py-4">
                <FadeIn>
                    <header className="px-1 pb-4 mb-6 border-b border-border/40 shrink-0">
                        <h1 className="font-display font-normal tracking-tight text-foreground text-[22px] md:text-[24px] leading-[1.2]">
                            Settings
                        </h1>
                    </header>
                </FadeIn>

                <SettingsLayout showBilling={showBilling} showOrganizations={showOrganizations}>
                    {hasLegacyTab && isOnSettingsRoot ? null : (
                        <Routes>
                            <Route index element={<SettingsHome {...homeProps} />} />
                            <Route path="profile" element={<ProfileGroup />} />
                            <Route path="sign-in-and-recovery" element={<SignInAndRecoveryGroup />} />
                            <Route path="encryption" element={<EncryptionGroup />} />
                            {showBilling && (
                                <Route path="billing" element={<BillingGroup {...billingProps} />} />
                            )}
                            <Route path="preferences" element={<PreferencesGroup health={health} />} />
                            {showOrganizations && (
                                <Route path="organizations" element={<OrganizationsGroup />} />
                            )}
                            {/* Anything else under /settings/* (including a Billing/Org URL
                                when the user no longer qualifies) returns to the directory. */}
                            <Route path="*" element={<SettingsHome {...homeProps} />} />
                        </Routes>
                    )}
                </SettingsLayout>
            </div>
        </div>
    );
}
