/**
 * Type definitions for Settings components
 * Centralizes all types to avoid 'any' usage and improve type safety
 */

export interface PlanLimits {
    storageQuota: number;
    maxFileSize: number;
    maxShares: number;
}

export interface PlanFeatures {
    sharePasswordProtection: boolean;
    shareCustomExpiry: boolean;
    shareDownloadLimits: boolean;
    publicSendMaxActive: number;
    publicSendMaxFileSize: number;
    shamirRecovery: boolean;
    hybridSignatures: boolean;
    prioritySupport: boolean;
    versionHistoryDays: number;
    trashRetentionDays: number;
}

export type PlanType = 'free' | 'pro' | 'admin';
export type SubscriptionStatus = 'free' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' | 'incomplete';
export type AccessLevel = 'full' | 'read_only' | 'suspended' | 'none';

export interface SubscriptionData {
    plan: PlanType;
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    subscriptionEndsAt: Date | null;
    hasActiveSubscription: boolean;
    isAdmin: boolean;
    limits: PlanLimits;
    features: PlanFeatures;
    accessLevel: AccessLevel;
    pastDueSince: Date | null;
    overQuota: boolean;
    overQuotaSince: Date | null;
    cancelAtPeriodEnd?: boolean;
}

export interface StorageStats {
    storageUsed: number;
    storageQuota: number;
    percentUsed: number;
    fileCount?: number;
}

export interface StripeConfigStatus {
    configured: boolean;
    enabled: boolean;
    active: boolean;
}
