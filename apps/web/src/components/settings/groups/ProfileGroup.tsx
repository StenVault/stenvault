/**
 * ProfileGroup — identity and account-level controls.
 *
 * Phase 4 keeps ProfileSettings intact; the visual restyling of its inline
 * "Danger Zone" surface to the sunken DangerZone primitive is a Phase 10
 * concern (visual-debt sweep). The DeleteAccountDialog flow stays as-is —
 * it carries OPAQUE password proof + pre-delete blockers + data-export
 * prompt, all of which the bare DangerZone primitive would discard.
 */

import { ProfileSettings } from '../ProfileSettings';

export function ProfileGroup() {
    return <ProfileSettings />;
}
