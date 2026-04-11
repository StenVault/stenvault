/**
 * Plan Tiers — Plan Data Single Source of Truth
 *
 * Canonical numeric and boolean values for every subscription plan
 * (free, pro, business). Every consumer that needs to know "how big
 * is the Pro storage quota?" or "does the free plan get password-
 * protected shares?" derives its answer from this file.
 *
 * Shape: nested { limits, features } per tier, mirroring the
 * PlanLimits / PlanFeatures distinction in
 * apps/api/src/_core/subscription/subscriptionTypes.ts.
 *
 * Consumers:
 * - apps/api/src/_core/subscription/planDefinitions.ts (getPlanLimits, getPlanFeatures)
 * - apps/web/src/components/settings/SubscriptionSettings.tsx (comparison table, upgrade cards)
 *
 * Two feature fields — publicSendMaxFileSize and publicSendMaxExpiryHours —
 * are derived here by reference from SEND_FILE_SIZE_TIERS and SEND_EXPIRY_PRESETS
 * rather than duplicated, so the existing contract tests for those modules
 * still protect them and no parallel source of truth is introduced.
 *
 * Not in scope: Stripe price IDs (dynamic via env), product-wide features
 * that every plan always has (E2E encryption, zero-knowledge, Public Send,
 * Private Chat — hardcoded in the comparison table because they structurally
 * cannot drift).
 *
 * @module @stenvault/shared/planTiers
 */

import { SEND_FILE_SIZE_TIERS } from "./sendFileSize";
import { SEND_EXPIRY_PRESETS } from "./sendExpiry";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Canonical plan data. Values here flow into `getPlanLimits` / `getPlanFeatures`
 * on the backend and into the "Compare plans" table on the frontend. Raising a
 * tier here propagates to every consumer automatically; parity tests in
 * `planDefinitions.test.ts` catch any drift between this file and the getters.
 */
export const PLAN_TIERS = {
    free: {
        limits: {
            storageQuota: 5 * GB,
            maxFileSize: 2 * GB,
            maxShares: 5,
            maxOrganizations: 0,
            maxMembersPerOrg: 0,
            orgStorageQuota: 0,
        },
        features: {
            sharePasswordProtection: false,
            shareCustomExpiry: false,
            shareDownloadLimits: false,
            p2pQuantumMesh: false,
            chatFileMaxSize: 100 * MB,
            publicSendMaxActive: 5,
            publicSendMaxFileSize: SEND_FILE_SIZE_TIERS.FREE.value,
            publicSendMaxExpiryHours: SEND_EXPIRY_PRESETS.SEVEN_DAYS.value,  // must be >= anonymous fallback
            shamirRecovery: false,
            hybridSignatures: false,
            folderUploadMaxFiles: 100,
            orgAdminConsole: false,
            orgAuditLogs: false,
            orgSso: false,
            prioritySupport: false,
            versionHistoryDays: 0,
            trashRetentionDays: 30,
        },
    },
    pro: {
        limits: {
            storageQuota: 200 * GB,
            maxFileSize: 10 * GB,
            maxShares: -1,             // unlimited
            maxOrganizations: 1,
            maxMembersPerOrg: 5,
            orgStorageQuota: 100 * GB,
        },
        features: {
            sharePasswordProtection: true,
            shareCustomExpiry: true,
            shareDownloadLimits: true,
            p2pQuantumMesh: true,
            chatFileMaxSize: 2 * GB,
            publicSendMaxActive: -1,    // unlimited
            publicSendMaxFileSize: SEND_FILE_SIZE_TIERS.PRO.value,
            publicSendMaxExpiryHours: SEND_EXPIRY_PRESETS.THIRTY_DAYS.value,
            shamirRecovery: true,
            hybridSignatures: true,
            folderUploadMaxFiles: 500,
            orgAdminConsole: true,
            orgAuditLogs: false,
            orgSso: false,
            prioritySupport: true,
            versionHistoryDays: 30,
            trashRetentionDays: 90,
        },
    },
    business: {
        limits: {
            storageQuota: 500 * GB,
            maxFileSize: 25 * GB,
            maxShares: -1,             // unlimited
            maxOrganizations: -1,      // unlimited
            maxMembersPerOrg: -1,      // unlimited
            orgStorageQuota: 200 * GB,
        },
        features: {
            sharePasswordProtection: true,
            shareCustomExpiry: true,
            shareDownloadLimits: true,
            p2pQuantumMesh: true,
            chatFileMaxSize: 5 * GB,
            publicSendMaxActive: -1,    // unlimited
            publicSendMaxFileSize: SEND_FILE_SIZE_TIERS.BUSINESS.value,
            publicSendMaxExpiryHours: SEND_EXPIRY_PRESETS.NINETY_DAYS.value,
            shamirRecovery: true,
            hybridSignatures: true,
            folderUploadMaxFiles: 500,
            orgAdminConsole: true,
            orgAuditLogs: true,
            orgSso: true,
            prioritySupport: true,
            versionHistoryDays: 90,
            trashRetentionDays: 180,
        },
    },
} as const;

export type PlanTierKey = keyof typeof PLAN_TIERS;
export type PlanTierData = (typeof PLAN_TIERS)[PlanTierKey];
