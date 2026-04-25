/**
 * PreferencesGroup — interface, system status, keyboard shortcuts.
 *
 * Theme switching lives here (it moved out of the sidebar footer). System
 * health surfaces service status (DB, Redis, R2, email) so a user
 * diagnosing weirdness has somewhere to look. Keyboard shortcuts is a
 * stub that will be wired to useKeyboardShortcuts.
 */

import { InterfaceSettings } from '../InterfaceSettings';
import { SystemSettings } from '../SystemSettings';
import { KeyboardShortcutsSection } from '../sections/KeyboardShortcutsSection';

interface PreferencesGroupProps {
    health?: {
        status?: string;
        services: {
            database?: boolean;
            redis?: boolean | null;
            r2Storage?: boolean | null;
            email?: boolean;
        };
    };
}

export function PreferencesGroup({ health }: PreferencesGroupProps) {
    return (
        <div className="space-y-6">
            <InterfaceSettings />
            <SystemSettings health={health} />
            <KeyboardShortcutsSection />
        </div>
    );
}
