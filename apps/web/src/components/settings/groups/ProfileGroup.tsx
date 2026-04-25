/**
 * ProfileGroup — identity, account-level controls, and data export.
 *
 * ProfileSettings carries name/email/language and the Danger Zone. The
 * DataExportSection sits below it because export is a data-ownership
 * action — it belongs next to the identity it's tied to, not under
 * Billing where it used to live by accident of being inside
 * StorageSettings.
 *
 * Phase 4 keeps ProfileSettings intact; the visual restyling of its
 * inline "Danger Zone" surface to the sunken DangerZone primitive is a
 * Phase 10 concern (visual-debt sweep). The DeleteAccountDialog flow
 * stays as-is — it carries OPAQUE password proof + pre-delete blockers
 * + data-export prompt, all of which the bare DangerZone primitive
 * would discard.
 */

import { ProfileSettings } from '../ProfileSettings';
import { DataExportSection } from '../DataExportSection';

export function ProfileGroup() {
    return (
        <div className="space-y-6">
            <ProfileSettings />
            <DataExportSection />
        </div>
    );
}
