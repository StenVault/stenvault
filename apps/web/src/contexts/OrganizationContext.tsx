/**
 * Organization Context
 * 
 * Global context for managing organization state and context switching.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { useOrganizationsList, useOrganizationMutations } from "../hooks/organizations/useOrganizations";


interface Organization {
    id: number;
    name: string;
    slug: string;
    role: "owner" | "admin" | "member";
    storageQuota: number;
    storageUsed: number;
}

interface OrganizationContextValue {
    // State
    organizations: Organization[];
    isLoading: boolean;
    currentOrgId: number | null;
    currentOrg: Organization | null;
    isPersonalContext: boolean;

    // Actions
    switchToOrg: (orgId: number) => Promise<void>;
    switchToPersonal: () => Promise<void>;
    refreshOrganizations: () => void;
}


const OrganizationContext = createContext<OrganizationContextValue | null>(null);


const ORG_CONTEXT_KEY = "cloudvault_org_context";

function getStoredOrgContext(): number | null {
    try {
        const stored = localStorage.getItem(ORG_CONTEXT_KEY);
        return stored ? parseInt(stored, 10) : null;
    } catch {
        return null;
    }
}

function setStoredOrgContext(orgId: number | null): void {
    try {
        if (orgId === null) {
            localStorage.removeItem(ORG_CONTEXT_KEY);
        } else {
            localStorage.setItem(ORG_CONTEXT_KEY, orgId.toString());
        }
    } catch {
        // Ignore storage errors
    }
}


interface OrganizationProviderProps {
    children: React.ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
    // State
    const [currentOrgId, setCurrentOrgId] = useState<number | null>(() => getStoredOrgContext());

    // Queries
    const { data: orgList, isLoading, refetch } = useOrganizationsList();
    const { switchContext } = useOrganizationMutations();

    // Derived state (useMemo prevents unstable ref when orgList is undefined during loading)
    const organizations = useMemo(() => (orgList ?? []) as Organization[], [orgList]);
    const currentOrg = useMemo(
        () => currentOrgId ? organizations.find(org => org.id === currentOrgId) ?? null : null,
        [currentOrgId, organizations]
    );
    const isPersonalContext = currentOrgId === null;

    // Validate stored context - reset if org no longer exists
    useEffect(() => {
        if (!isLoading && currentOrgId && !organizations.find(o => o.id === currentOrgId)) {
            setCurrentOrgId(null);
            setStoredOrgContext(null);
        }
    }, [isLoading, currentOrgId, organizations]);

    // Switch to organization context
    const switchToOrg = useCallback(async (orgId: number) => {
        try {
            await switchContext.mutateAsync({ organizationId: orgId });
            setCurrentOrgId(orgId);
            setStoredOrgContext(orgId);
        } catch (error) {
            console.error("Failed to switch organization context:", error);
            throw error;
        }
    }, [switchContext]);

    // Switch to personal context
    const switchToPersonal = useCallback(async () => {
        try {
            await switchContext.mutateAsync({ organizationId: null });
            setCurrentOrgId(null);
            setStoredOrgContext(null);
        } catch (error) {
            console.error("Failed to switch to personal context:", error);
            throw error;
        }
    }, [switchContext]);

    // Refresh organizations
    const refreshOrganizations = useCallback(() => {
        refetch();
    }, [refetch]);

    const value = useMemo<OrganizationContextValue>(() => ({
        organizations,
        isLoading,
        currentOrgId,
        currentOrg,
        isPersonalContext,
        switchToOrg,
        switchToPersonal,
        refreshOrganizations,
    }), [organizations, isLoading, currentOrgId, currentOrg, isPersonalContext, switchToOrg, switchToPersonal, refreshOrganizations]);

    return (
        <OrganizationContext.Provider value={value}>
            {children}
        </OrganizationContext.Provider>
    );
}


export function useOrganizationContext() {
    const context = useContext(OrganizationContext);
    if (!context) {
        throw new Error("useOrganizationContext must be used within OrganizationProvider");
    }
    return context;
}

/**
 * Hook to get current organization ID (for use in queries)
 */
export function useCurrentOrgId(): number | null {
    const context = useContext(OrganizationContext);
    return context?.currentOrgId ?? null;
}
