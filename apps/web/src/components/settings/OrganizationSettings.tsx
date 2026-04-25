/**
 * Organization Settings Component
 *
 * List view for user's organizations + creation modal.
 * Detail view delegated to OrgDetailView (Rule 5: <200 lines per component).
 */

import { useState } from "react";
import { Building2, Plus, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuroraCard, AuroraCardContent } from "@/components/ui/aurora-card";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { CreateOrgModal } from "@/components/organizations/CreateOrgModal";
import { OrgDetailView } from "@/components/organizations/OrgDetailView";
import { formatBytes } from "@stenvault/shared";
import { cn } from "@/lib/utils";

const roleLabels = { owner: "Owner", admin: "Admin", member: "Member" } as const;
const roleColors = { owner: "text-amber-500", admin: "text-blue-500", member: "text-muted-foreground" } as const;

export function OrganizationSettings() {
    const { user } = useAuth();
    const { organizations, isLoading, refreshOrganizations } = useOrganizationContext();

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

    const selectedOrg = selectedOrgId
        ? organizations.find(o => o.id === selectedOrgId) ?? null
        : null;

    const handleOrgCreated = (orgId: number) => {
        refreshOrganizations();
        setSelectedOrgId(orgId);
        toast.success("Organization created");
    };

    if (selectedOrg && user) {
        return (
            <OrgDetailView
                org={selectedOrg}
                userId={user.id}
                onBack={() => setSelectedOrgId(null)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <AuroraCard variant="glass">
                <AuroraCardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold">Organizations</h2>
                                <p className="text-sm text-muted-foreground">
                                    Manage your team workspaces
                                </p>
                            </div>
                        </div>
                        <Button onClick={() => setCreateModalOpen(true)} size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Create
                        </Button>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : organizations.length === 0 ? (
                        <div className="text-center py-12 space-y-3">
                            <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50" />
                            <div>
                                <p className="font-medium text-muted-foreground">No organizations yet</p>
                                <p className="text-sm text-muted-foreground/70">
                                    Create an organization to collaborate with your team.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => setCreateModalOpen(true)}
                                className="mt-2"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Create Organization
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {organizations.map(org => (
                                <button
                                    key={org.id}
                                    onClick={() => setSelectedOrgId(org.id)}
                                    className={cn(
                                        "w-full flex items-center gap-4 p-4 rounded-lg",
                                        "border border-border/50 hover:border-border",
                                        "hover:bg-accent/50 transition-colors text-left"
                                    )}
                                >
                                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                                        <Building2 className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">{org.name}</span>
                                            <Badge variant="outline" className="text-[10px] shrink-0">
                                                <span className={roleColors[org.role]}>
                                                    {roleLabels[org.role]}
                                                </span>
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate">
                                            /{org.slug}
                                        </p>
                                    </div>
                                    <div className="text-sm text-muted-foreground shrink-0">
                                        {formatBytes(org.storageUsed)} / {formatBytes(org.storageQuota)}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </AuroraCardContent>
            </AuroraCard>

            <CreateOrgModal
                open={createModalOpen}
                onOpenChange={setCreateModalOpen}
                onSuccess={handleOrgCreated}
            />
        </div>
    );
}
