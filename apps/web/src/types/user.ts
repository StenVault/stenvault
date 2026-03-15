/**
 * User Type Definitions
 * 
 * Re-exports user types from @stenvault/api-types for consistency.
 * Adds web-specific type guards that depend on runtime code.
 * 
 * @source @stenvault/api-types/auth
 * @updated 2026-01-13
 */

// ============ Re-export from shared package ============
// This ensures web, mobile, and API all use the same types

export type {
    SanitizedUser,
    User,
    BasicUserInfo,
    SubscriptionPlan,
    SubscriptionStatus,
    UserRole,
} from '@stenvault/api-types';

// Import types for use in type guards
import type { SanitizedUser } from '@stenvault/api-types';

// ============ Type Guards ============
// These are runtime utilities that can't go in api-types (type-only package)

/**
 * Check if a user has admin role
 */
export function isAdmin(user: SanitizedUser | null | undefined): boolean {
    return user?.role === 'admin';
}

/**
 * Check if user has verified email
 */
export function isEmailVerified(user: SanitizedUser | null | undefined): boolean {
    return user?.emailVerified !== null;
}

/**
 * Check if user has active paid subscription
 */
export function hasActiveSubscription(user: SanitizedUser | null | undefined): boolean {
    if (!user) return false;
    return ['active', 'trialing'].includes(user.subscriptionStatus);
}

/**
 * Check if user is on a paid plan (even if subscription is past_due)
 */
export function isPaidUser(user: SanitizedUser | null | undefined): boolean {
    if (!user) return false;
    return user.subscriptionPlan !== 'free';
}

/**
 * Get display name or email as fallback
 */
export function getDisplayName(user: SanitizedUser | null | undefined): string {
    if (!user) return 'User';
    return user.name || user.email.split('@')[0] || user.email;
}
