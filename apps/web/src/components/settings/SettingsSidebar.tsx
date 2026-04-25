/**
 * SettingsSidebar — left rail of the desktop Settings shell.
 *
 * Renders one NavLink per group. Active group gets a gold left-border stripe
 * and surface-elevated background (Phase 4 / I3 / I9).
 *
 * Conditional groups:
 * - Billing renders only when Stripe is configured + active.
 * - Organizations renders only when the user has at least one org membership.
 *
 * Mobile is handled separately by MobileSettings — this rail is desktop-only.
 */

import { NavLink } from 'react-router-dom';
import {
    Building2,
    CreditCard,
    KeyRound,
    Settings as SettingsIcon,
    ShieldCheck,
    User,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@stenvault/shared/utils';

export interface SettingsGroupItem {
    slug: string;
    label: string;
    icon: LucideIcon;
}

const ALWAYS_GROUPS: ReadonlyArray<SettingsGroupItem> = [
    { slug: 'profile', label: 'Profile', icon: User },
    { slug: 'sign-in-and-recovery', label: 'Sign-in & recovery', icon: ShieldCheck },
    { slug: 'encryption', label: 'Encryption', icon: KeyRound },
];

const BILLING_GROUP: SettingsGroupItem = { slug: 'billing', label: 'Billing', icon: CreditCard };
const PREFERENCES_GROUP: SettingsGroupItem = { slug: 'preferences', label: 'Preferences', icon: SettingsIcon };
const ORGANIZATIONS_GROUP: SettingsGroupItem = { slug: 'organizations', label: 'Organizations', icon: Building2 };

interface SettingsSidebarProps {
    showBilling: boolean;
    showOrganizations: boolean;
    className?: string;
}

export function SettingsSidebar({ showBilling, showOrganizations, className }: SettingsSidebarProps) {
    const groups: SettingsGroupItem[] = [
        ...ALWAYS_GROUPS,
        ...(showBilling ? [BILLING_GROUP] : []),
        PREFERENCES_GROUP,
        ...(showOrganizations ? [ORGANIZATIONS_GROUP] : []),
    ];

    return (
        <nav
            aria-label="Settings sections"
            className={cn('flex flex-col gap-0.5', className)}
        >
            {groups.map((group) => {
                const Icon = group.icon;
                return (
                    <NavLink
                        key={group.slug}
                        // Absolute path: NavLink's default is relative, and the
                        // Settings shell mounts its own nested <Routes>, so a
                        // relative `to="profile"` from `/settings/encryption`
                        // resolves to `/settings/encryption/profile` — the
                        // catch-all redirects back to `profile`, which then
                        // appends again, and the URL explodes.
                        to={`/settings/${group.slug}`}
                        end
                        className={({ isActive }) =>
                            cn(
                                // Base
                                'group relative flex items-center gap-2.5 px-3 py-2 rounded-md',
                                'text-sm transition-colors',
                                'border-l-2',
                                isActive
                                    // Active: gold left-border stripe + elevated surface + primary text
                                    ? 'border-l-[var(--theme-primary)] bg-[var(--theme-bg-surface)] text-[var(--theme-primary)] font-medium'
                                    // Inactive: transparent border-l (preserves layout), neutral hover
                                    : 'border-l-transparent text-foreground-secondary hover:text-foreground hover:bg-[var(--theme-bg-elevated)]',
                            )
                        }
                    >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{group.label}</span>
                    </NavLink>
                );
            })}
        </nav>
    );
}
