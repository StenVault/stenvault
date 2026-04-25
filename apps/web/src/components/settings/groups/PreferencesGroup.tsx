/**
 * PreferencesGroup — interface, system status, keyboard shortcuts (I8).
 *
 * Theme switching lives here per I8 — it moved out of the sidebar footer
 * during Phase 2. System health surfaces service status (DB, Redis, R2,
 * email) so a user diagnosing weirdness has somewhere to look. Keyboard
 * shortcuts is a stub; Phase 9 fills it from useKeyboardShortcuts.
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
