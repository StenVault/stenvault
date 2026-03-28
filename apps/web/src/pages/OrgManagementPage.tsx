/**
 * Org Management Page
 *
 * Sidebar-accessible page that renders OrgDetailView for the current org context.
 * Redirects to /home when not in org context.
 */

import { Navigate } from "react-router-dom";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { OrgDetailView } from "@/components/organizations/OrgDetailView";

export default function OrgManagementPage() {
    const { currentOrg } = useOrganizationContext();
    const { user } = useAuth();

    if (!currentOrg || !user) {
        return <Navigate to="/home" replace />;
    }

    return (
        <div className="max-w-5xl mx-auto">
            <OrgDetailView org={currentOrg} userId={user.id} />
        </div>
    );
}
