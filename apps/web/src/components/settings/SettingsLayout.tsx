/**
 * SettingsLayout — two-column shell for Settings (desktop).
 *
 * Left: SettingsSidebar (sticky on tall pages).
 * Right: Outlet via children — the active group component.
 *
 * Mobile uses the dedicated MobileSettings page, so this layout is desktop-
 * focused. The container clamps content to a comfortable reading width.
 */

import type { ReactNode } from 'react';
import { SettingsSidebar } from './SettingsSidebar';

interface SettingsLayoutProps {
    showBilling: boolean;
    showOrganizations: boolean;
    children: ReactNode;
}

export function SettingsLayout({ showBilling, showOrganizations, children }: SettingsLayoutProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 md:gap-8">
            <aside className="md:sticky md:top-0 md:self-start">
                <SettingsSidebar
                    showBilling={showBilling}
                    showOrganizations={showOrganizations}
                />
            </aside>
            <section className="min-w-0 space-y-6">
                {children}
            </section>
        </div>
    );
}
