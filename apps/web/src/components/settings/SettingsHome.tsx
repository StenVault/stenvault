/**
 * SettingsHome — directory page rendered at /settings root.
 *
 * Stripe-style restraint: three meta-groups (Account / Security / App) as
 * serif labels, each with rows that link to a sub-section. Every row carries
 * a one-line dynamic state pulled from queries Settings.tsx already runs
 * (subscription, storageStats), plus three lightweight ones for the security
 * row (mfa.getStatus, shamirRecovery.getStatus, hybridSignature.hasKeyPair).
 *
 * No cards, no hero, no action queue. Rows separated by hairline dividers;
 * numbers use tabular-nums so percentages and counts align as instruments.
 */
import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@stenvault/shared/utils';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import type { ReactNode } from 'react';
import type { SubscriptionData, StorageStats } from '@/types/settings';

interface SettingsHomeProps {
    showBilling: boolean;
    showOrganizations: boolean;
    subscription?: SubscriptionData;
    storageStats?: StorageStats;
}

const PLAN_LABEL: Record<string, string> = {
    free: 'Free plan',
    pro: 'Pro plan',
    business: 'Business plan',
    admin: 'Admin',
};

export function SettingsHome({
    showBilling,
    showOrganizations,
    subscription,
    storageStats,
}: SettingsHomeProps) {
    const { user } = useAuth();
    const { themeName, isDark, availableThemes } = useTheme();
    const { organizations } = useOrganizationContext();

    // Cheap, cached status reads. Each is its own query so the directory
    // can render the moment auth resolves — slow rows just show their static
    // fallback until data arrives.
    const { data: mfaStatus } = trpc.mfa.getStatus.useQuery(undefined, {
        staleTime: 60_000,
    });
    const { data: shamirStatus } = trpc.shamirRecovery.getStatus.useQuery(undefined, {
        staleTime: 60_000,
        retry: false,
    });
    const { data: signatureStatus } = trpc.hybridSignature.hasKeyPair.useQuery(undefined, {
        staleTime: 60_000,
    });

    const planLabel = subscription ? PLAN_LABEL[subscription.plan] ?? 'Free plan' : 'Free plan';
    const percentUsed = storageStats?.percentUsed ?? 0;

    const themeDisplayName =
        availableThemes.find((t) => t.name === themeName)?.displayName ?? 'Nocturne';

    const twoFaPart = mfaStatus?.enabled ? '2FA on' : '2FA off';
    const trustedCirclePart = shamirStatus?.isConfigured
        ? 'Trusted Circle on'
        : 'Trusted Circle off';
    const fileVerificationPart = signatureStatus?.hasKeyPair
        ? 'File verification on'
        : 'File verification off';

    return (
        <div className="space-y-10">
            <Group label="Account">
                <DirectoryRow
                    to="/settings/profile"
                    title="Profile"
                    status={user?.email ?? 'Manage your identity'}
                />
                {showBilling && (
                    <DirectoryRow
                        to="/settings/billing"
                        title="Billing"
                        status={
                            <>
                                {planLabel} ·{' '}
                                <span className="tabular-nums">{percentUsed}%</span> used
                            </>
                        }
                    />
                )}
                {showOrganizations && (
                    <DirectoryRow
                        to="/settings/organizations"
                        title="Organizations"
                        status={
                            <>
                                <span className="tabular-nums">{organizations.length}</span>{' '}
                                {organizations.length === 1 ? 'organization' : 'organizations'}
                            </>
                        }
                    />
                )}
            </Group>

            <Group label="Security">
                <DirectoryRow
                    to="/settings/sign-in-and-recovery"
                    title="Sign-in & recovery"
                    status={`${twoFaPart} · Manage devices and codes`}
                    needsAttention={mfaStatus?.enabled === false}
                />
                <DirectoryRow
                    to="/settings/encryption"
                    title="Encryption"
                    status={`${trustedCirclePart} · ${fileVerificationPart}`}
                    needsAttention={shamirStatus?.isConfigured === false}
                />
            </Group>

            <Group label="App">
                <DirectoryRow
                    to="/settings/preferences"
                    title="Preferences"
                    status={`${themeDisplayName} · ${isDark ? 'Dark' : 'Light'} mode`}
                />
            </Group>
        </div>
    );
}

interface GroupProps {
    label: string;
    children: ReactNode;
}

function Group({ label, children }: GroupProps) {
    return (
        <section>
            <h2
                className="font-display font-normal text-foreground-secondary text-[15px] tracking-wide mb-2 px-1"
            >
                {label}
            </h2>
            <div
                className="rounded-lg border border-border/40 overflow-hidden bg-[var(--theme-bg-elevated)]/30"
            >
                {children}
            </div>
        </section>
    );
}

interface DirectoryRowProps {
    to: string;
    title: string;
    status: ReactNode;
    needsAttention?: boolean;
}

function DirectoryRow({ to, title, status, needsAttention }: DirectoryRowProps) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    'group flex items-center gap-4 px-4 py-3.5',
                    'transition-colors',
                    'border-b border-border/40 last:border-b-0',
                    'hover:bg-[var(--theme-bg-surface)]',
                    isActive && 'bg-[var(--theme-bg-surface)]',
                )
            }
        >
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{title}</div>
                <div className="mt-0.5 text-xs text-foreground-muted truncate flex items-center gap-2">
                    {needsAttention && (
                        <span
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--theme-warning)] shrink-0"
                        />
                    )}
                    <span className="truncate">{status}</span>
                </div>
            </div>
            <ChevronRight
                className="h-4 w-4 text-foreground-muted group-hover:text-foreground-secondary transition-colors shrink-0"
                aria-hidden="true"
            />
        </NavLink>
    );
}
