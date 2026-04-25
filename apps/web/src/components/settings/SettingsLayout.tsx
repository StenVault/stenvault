/**
 * SettingsLayout — two-column shell for Settings (desktop).
 *
 * Independent scroll panes pattern (Stripe / Vercel / Linear): the layout
 * fills its parent's height (which is bounded by DashboardLayout's <main>),
 * the left rail is a normal block that stays put, and the right pane has
 * its own `overflow-y-auto`. No `position: sticky` anywhere — the rail
 * doesn't move because the page doesn't scroll; only the right pane does.
 *
 * Why not sticky: our shell stacks two scroll containers (SidebarInset >
 * main > Settings), and `position: sticky` resolves against the nearest
 * scrolling ancestor in ways that proved fragile across our framer-motion
 * wrappers and grid. Independent panes side-step the whole class of issues.
 *
 * Mobile uses the dedicated MobileSettings page, so this layout is desktop-
 * focused. The right pane carries the VaultStatusFooter pinned to its
 * bottom edge, outside the scroll region.
 */

import type { ReactNode } from 'react';
import { SettingsSidebar } from './SettingsSidebar';
import { VaultStatusFooter } from './VaultStatusFooter';

interface SettingsLayoutProps {
    showBilling: boolean;
    showOrganizations: boolean;
    children: ReactNode;
}

export function SettingsLayout({ showBilling, showOrganizations, children }: SettingsLayoutProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 md:gap-8 flex-1 min-h-0">
            <aside className="md:pt-1">
                <SettingsSidebar
                    showBilling={showBilling}
                    showOrganizations={showOrganizations}
                />
            </aside>
            <section className="min-w-0 flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6">
                    {children}
                </div>
                <VaultStatusFooter />
            </section>
        </div>
    );
}
