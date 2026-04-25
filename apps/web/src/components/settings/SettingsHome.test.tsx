/**
 * SettingsHome — single-render contract test.
 *
 * SettingsHome has no internal <Routes>, only NavLinks, so a single render
 * inside MemoryRouter is safe (no Navigate-driven useEffect cycle). We
 * verify the three meta-group labels render, and that conditional rows
 * (Billing, Organizations) honour their props.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SubscriptionData, StorageStats } from '@/types/settings';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/_core/hooks/useAuth', () => ({
    useAuth: () => ({ user: { email: 'gefson@example.com' } }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        themeName: 'nocturne',
        isDark: true,
        availableThemes: [
            { name: 'nocturne', displayName: 'Nocturne', description: '' },
        ],
    }),
}));

vi.mock('@/contexts/OrganizationContext', () => ({
    useOrganizationContext: () => ({ organizations: [] }),
}));

vi.mock('@/lib/trpc', () => ({
    trpc: {
        mfa: {
            getStatus: { useQuery: () => ({ data: { enabled: true } }) },
        },
        shamirRecovery: {
            getStatus: { useQuery: () => ({ data: { isConfigured: false } }) },
        },
        hybridSignature: {
            hasKeyPair: { useQuery: () => ({ data: { hasKeyPair: false } }) },
        },
    },
}));

import { SettingsHome } from './SettingsHome';

const subscription: SubscriptionData = {
    plan: 'free',
    status: 'free',
    trialEndsAt: null,
    subscriptionEndsAt: null,
    hasActiveSubscription: false,
    isAdmin: false,
    limits: {
        storageQuota: 5_000_000_000,
        maxFileSize: 5_000_000_000,
        maxShares: 0,
        maxOrganizations: 0,
        maxMembersPerOrg: 0,
        orgStorageQuota: 0,
    },
    features: {
        sharePasswordProtection: false,
        shareCustomExpiry: false,
        shareDownloadLimits: false,
        p2pQuantumMesh: false,
        chatFileMaxSize: 0,
        publicSendMaxActive: 0,
        publicSendMaxFileSize: 0,
        shamirRecovery: false,
        hybridSignatures: false,
        orgAdminConsole: false,
        orgAuditLogs: false,
        orgSso: false,
        prioritySupport: false,
        versionHistoryDays: 0,
        trashRetentionDays: 30,
    },
    accessLevel: 'full',
    pastDueSince: null,
    overQuota: false,
    overQuotaSince: null,
};

const storageStats: StorageStats = {
    storageUsed: 1_100_000_000,
    storageQuota: 5_000_000_000,
    percentUsed: 22,
};

describe('SettingsHome', () => {
    it('renders the three meta-group labels', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <SettingsHome
                        showBilling={true}
                        showOrganizations={false}
                        subscription={subscription}
                        storageStats={storageStats}
                    />
                </MemoryRouter>,
            );
        });

        expect(screen.getByText('Account')).toBeInTheDocument();
        expect(screen.getByText('Security')).toBeInTheDocument();
        expect(screen.getByText('App')).toBeInTheDocument();
    });

    it('always renders Profile, Sign-in & recovery, Encryption, Preferences', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <SettingsHome
                        showBilling={false}
                        showOrganizations={false}
                        subscription={undefined}
                        storageStats={undefined}
                    />
                </MemoryRouter>,
            );
        });

        expect(screen.getByText('Profile')).toBeInTheDocument();
        expect(screen.getByText('Sign-in & recovery')).toBeInTheDocument();
        expect(screen.getByText('Encryption')).toBeInTheDocument();
        expect(screen.getByText('Preferences')).toBeInTheDocument();
    });

    it('hides the Billing row when Stripe is not active', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <SettingsHome
                        showBilling={false}
                        showOrganizations={false}
                        subscription={undefined}
                        storageStats={undefined}
                    />
                </MemoryRouter>,
            );
        });

        expect(screen.queryByText('Billing')).not.toBeInTheDocument();
    });

    it('hides the Organizations row when the user has no orgs', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <SettingsHome
                        showBilling={true}
                        showOrganizations={false}
                        subscription={subscription}
                        storageStats={storageStats}
                    />
                </MemoryRouter>,
            );
        });

        expect(screen.queryByText('Organizations')).not.toBeInTheDocument();
    });

    it('shows the user email as the Profile state line', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <SettingsHome
                        showBilling={false}
                        showOrganizations={false}
                        subscription={undefined}
                        storageStats={undefined}
                    />
                </MemoryRouter>,
            );
        });

        expect(screen.getByText('gefson@example.com')).toBeInTheDocument();
    });

    it('shows plan + percent used on the Billing row when present', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <SettingsHome
                        showBilling={true}
                        showOrganizations={false}
                        subscription={subscription}
                        storageStats={storageStats}
                    />
                </MemoryRouter>,
            );
        });

        // The state line composes plan label + tabular percent — assert the
        // pieces are present rather than matching the exact rendered string,
        // since the percent is in its own <span>.
        expect(screen.getByText(/Free plan/)).toBeInTheDocument();
        expect(screen.getByText('22%')).toBeInTheDocument();
        expect(screen.getByText(/used/)).toBeInTheDocument();
    });
});
