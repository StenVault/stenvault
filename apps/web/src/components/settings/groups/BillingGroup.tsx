/**
 * BillingGroup — Stripe-conditional. Plan, usage, payment history.
 *
 * Phase 4 keeps SubscriptionSettings as a single block (the disaggregation
 * into Current Plan / Payment / Invoices sub-sections is Phase 10/future).
 * StorageSettings rides along here because the storage quota visualisation
 * is the most actionable "billing" surface for free-tier users.
 */

import { SubscriptionSettings } from '../SubscriptionSettings';
import { StorageSettings } from '../StorageSettings';
import type { SubscriptionData, StorageStats } from '@/types/settings';

interface BillingGroupProps {
    isAdmin: boolean;
    subscription: SubscriptionData | undefined;
    isStripeActive: boolean;
    storageStats: StorageStats | undefined;
    refetchStorage: () => void;
}

export function BillingGroup({
    isAdmin,
    subscription,
    isStripeActive,
    storageStats,
    refetchStorage,
}: BillingGroupProps) {
    return (
        <div className="space-y-6">
            <SubscriptionSettings
                isAdmin={isAdmin}
                subscription={subscription}
                isStripeActive={isStripeActive}
            />
            <StorageSettings
                storageStats={storageStats}
                refetchStorage={refetchStorage}
            />
        </div>
    );
}
