/**
 * SettingsSidebar — left rail of the desktop Settings shell.
 *
 * Six items, three meta-groups. Group labels use Instrument Serif at a
 * smaller scale; items render as NavLinks underneath. Active item gets a
 * solid 3px gold strip on the left, a primary-tinted fill, medium weight,
 * and a chevron — confident enough to read in peripheral vision.
 *
 * Conditional groups: Billing renders only when Stripe is active.
 * Organizations renders only when the user is a member of at least one org.
 *
 * Mobile is handled separately by MobileSettings — this rail is desktop-only.
 */

import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@stenvault/shared/utils';

export interface SettingsGroupItem {
    slug: string;
    label: string;
}

interface SettingsGroup {
    label: string;
    items: SettingsGroupItem[];
}

interface SettingsSidebarProps {
    showBilling: boolean;
    showOrganizations: boolean;
    className?: string;
}

export function SettingsSidebar({ showBilling, showOrganizations, className }: SettingsSidebarProps) {
    const groups: SettingsGroup[] = [
        {
            label: 'Account',
            items: [
                { slug: 'profile', label: 'Profile' },
                ...(showBilling ? [{ slug: 'billing', label: 'Billing' }] : []),
                ...(showOrganizations
                    ? [{ slug: 'organizations', label: 'Organizations' }]
                    : []),
            ],
        },
        {
            label: 'Security',
            items: [
                { slug: 'sign-in-and-recovery', label: 'Sign-in & recovery' },
                { slug: 'encryption', label: 'Encryption' },
            ],
        },
        {
            label: 'App',
            items: [{ slug: 'preferences', label: 'Preferences' }],
        },
    ];

    return (
        <nav
            aria-label="Settings sections"
            className={cn('flex flex-col gap-6', className)}
        >
            {groups.map((group) => (
                <div key={group.label}>
                    <h3
                        className="font-display font-normal text-foreground-muted text-[13px] tracking-wide mb-2 px-3"
                    >
                        {group.label}
                    </h3>
                    <div className="flex flex-col gap-0.5">
                        {group.items.map((item) => (
                            <SidebarLink key={item.slug} slug={item.slug} label={item.label} />
                        ))}
                    </div>
                </div>
            ))}
        </nav>
    );
}

function SidebarLink({ slug, label }: { slug: string; label: string }) {
    return (
        <NavLink
            // Absolute path: NavLink default is relative, and the Settings shell
            // mounts its own nested <Routes>, so a relative `to="profile"` from
            // `/settings/encryption` resolves to `/settings/encryption/profile`.
            // The catch-all redirects back to `profile`, which then appends
            // again, and the URL explodes.
            to={`/settings/${slug}`}
            end
            className={({ isActive }) =>
                cn(
                    'group relative flex items-center gap-2 pr-2 py-2',
                    'pl-[14px]', // 3px strip + 11px text inset, balances active/inactive states
                    'text-sm transition-colors rounded-r-md',
                    isActive
                        ? // Active: 3px gold strip (drawn via inset shadow), tinted fill, foreground text, chevron visible.
                          'bg-[var(--theme-primary)]/10 text-foreground font-medium shadow-[inset_3px_0_0_0_var(--theme-primary)]'
                        : // Inactive: subtle hover, no strip.
                          'text-foreground-secondary hover:text-foreground hover:bg-[var(--theme-bg-elevated)]',
                )
            }
        >
            {({ isActive }) => (
                <>
                    <span className="truncate flex-1">{label}</span>
                    <ChevronRight
                        className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-opacity',
                            isActive
                                ? 'text-[var(--theme-primary)] opacity-80'
                                : 'opacity-0 group-hover:opacity-50',
                        )}
                        aria-hidden="true"
                    />
                </>
            )}
        </NavLink>
    );
}
