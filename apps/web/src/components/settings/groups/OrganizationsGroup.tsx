/**
 * OrganizationsGroup — workspace management (org-conditional).
 *
 * The sidebar entry only renders when the user has at least one membership;
 * inside, OrganizationSettings handles list view, detail view, and the
 * "Create organization" CTA on its own.
 */

import { OrganizationSettings } from '../OrganizationSettings';

export function OrganizationsGroup() {
    return <OrganizationSettings />;
}
