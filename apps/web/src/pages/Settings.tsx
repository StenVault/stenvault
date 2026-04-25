/**
 * Settings Page
 *
 * Phase 4: path-based 5-group sub-sidebar shell. Each group lives at
 * /settings/{slug} and renders inside SettingsLayout. Legacy ?tab=X URLs
 * (CommandPalette, banner anchors, EncryptionSetup hand-off, Stripe
 * redirects already in the wild) are redirected to the new URLs on first
 * load — bookmarks and external links keep working.
 *
 * Mobile users get the dedicated MobileSettings page; this shell is
 * desktop-only.
 */

import { useEffect, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon } from 'lucide-react';
import { toast } from '@stenvault/shared/lib/toast';
import { AuroraCard, AuroraCardContent } from '@stenvault/shared/ui/aurora-card';
import { FadeIn } from '@stenvault/shared/ui/animated';
import { trpc } from '@/lib/trpc';
import { useIsMobile } from '@/hooks/useMobile';
import { useTheme } from '@/contexts/ThemeContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { MobileSettings } from '@/components/mobile-v2/pages/MobileSettings';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { ProfileGroup } from '@/components/settings/groups/ProfileGroup';
import { SignInAndRecoveryGroup } from '@/components/settings/groups/SignInAndRecoveryGroup';
import { EncryptionGroup } from '@/components/settings/groups/EncryptionGroup';
import { BillingGroup } from '@/components/settings/groups/BillingGroup';
import { PreferencesGroup } from '@/components/settings/groups/PreferencesGroup';
import { OrganizationsGroup } from '@/components/settings/groups/OrganizationsGroup';
import type { SubscriptionData } from '@/types/settings';

/**
 * Map of legacy `?tab=` values to new group slugs. Anything not listed
 * falls through to /settings/profile. Exported so the redirect contract
 * can be unit-tested without rendering the routing tree.
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
 * Resolve a legacy ?tab= value to the new path component.
 * Unknown values fall through to 'profile' (the default group).
 */
export function resolveLegacyTab(tab: string | null): string {
    if (!tab) return 'profile';
    return LEGACY_TAB_MAP[tab] ?? 'profile';
}

export default function Settings() {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <MobileSettings />;
    }

    return <DesktopSettings />;
}

function DesktopSettings() {
    const { theme } = useTheme();
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

    // Shared data for groups that need it (Preferences > System health, Billing > Storage).
    const { data: health } = trpc.settings.getSystemHealth.useQuery(undefined, { staleTime: 60_000 });
    const { data: storageStats, refetch: refetchStorage } = trpc.files.getStorageStats.useQuery();

    // Legacy ?tab= → path redirect. Runs ONCE per URL; preserves other params
    // (notably ?success=true / ?canceled=true from Stripe checkout return URLs).
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (!tab) return;
        const target = resolveLegacyTab(tab);
        const next = new URLSearchParams(searchParams);
        next.delete('tab');
        const qs = next.toString();
        navigate(`/settings/${target}${qs ? `?${qs}` : ''}`, { replace: true });
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

    // Bookmarks landing on /settings (no inner path) should default to Profile.
    // The Routes' index route handles this — but we also bail out early if
    // the user landed via a ?tab= URL that's still being redirected, to avoid
    // a "404 within Settings" flash.
    const hasLegacyTab = searchParams.get('tab') !== null;
    const isOnSettingsRoot = location.pathname === '/settings' || location.pathname === '/settings/';

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <FadeIn>
                <AuroraCard variant="glass" className="relative overflow-hidden">
                    <div
                        className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-15 pointer-events-none"
                        style={{ backgroundColor: theme.brand.primary }}
                    />
                    <AuroraCardContent className="p-5">
                        <div className="flex items-center gap-3">
                            <motion.div
                                className="p-2.5 rounded-xl"
                                style={{ backgroundColor: `${theme.brand.primary}15` }}
                                whileHover={{ scale: 1.05, rotate: 5 }}
                            >
                                <SettingsIcon
                                    className="h-5 w-5"
                                    style={{ color: theme.brand.primary }}
                                />
                            </motion.div>
                            <div>
                                <h1 className="font-display font-normal tracking-tight text-foreground text-[24px] md:text-[28px] leading-[1.2]">
                                    Settings
                                </h1>
                                <p className="text-muted-foreground mt-1">
                                    Tune your vault.
                                </p>
                            </div>
                        </div>
                    </AuroraCardContent>
                </AuroraCard>
            </FadeIn>

            <FadeIn delay={0.1}>
                <SettingsLayout showBilling={showBilling} showOrganizations={showOrganizations}>
                    {hasLegacyTab && isOnSettingsRoot ? null : (
                        <Routes>
                            <Route index element={<Navigate to="profile" replace />} />
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
                                when the user no longer qualifies) returns to Profile. */}
                            <Route path="*" element={<Navigate to="profile" replace />} />
                        </Routes>
                    )}
                </SettingsLayout>
            </FadeIn>
        </div>
    );
}
