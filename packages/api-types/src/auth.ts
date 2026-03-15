/**
 * Authentication Types
 * 
 * Types for user authentication and account management.
 * Re-exported from: apps/api/src/routers.ts (auth namespace)
 * 
 * @generated 2026-01-08
 */

// ============ Subscription Types ============

export type SubscriptionPlan = 'free' | 'pro' | 'business';
export type SubscriptionStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type UserRole = 'user' | 'admin';

// ============ User Types ============

/**
 * SanitizedUser - The user object returned from auth.me
 * 
 * This matches what the backend returns after sanitizeUser() removes:
 * - password
 * - mfaSecret  
 * - backupCodes
 * 
 * @source apps/api/src/db/schema/users.ts
 * @source apps/api/src/routers.ts (sanitizeUser function)
 */
export interface SanitizedUser {
    id: number;
    openId?: string | null;
    name: string | null;
    email: string;
    loginMethod?: string | null;
    role: UserRole;
    emailVerified: Date | null;

    // Storage
    storageUsed: number;
    storageQuota: number;
    maxFileSize: number;
    maxShares: number;
    sharesUsed: number;

    // Stripe subscription
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    subscriptionStatus: SubscriptionStatus;
    subscriptionPlan: SubscriptionPlan;
    trialEndsAt?: Date | null;
    subscriptionEndsAt?: Date | null;
    hasCustomQuotas: boolean;

    // MFA (only the enabled flag, secrets are stripped)
    mfaEnabled: boolean;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    lastSignedIn: Date;
}

/**
 * @deprecated Use SanitizedUser instead. This alias is kept for backward compatibility.
 */
export type User = SanitizedUser;

/**
 * BasicUserInfo - Minimal user info for display components
 * Use when you only need name/email for UI display
 */
export interface BasicUserInfo {
    id: number;
    name: string | null;
    email: string;
    role?: UserRole;
}

// ============ Input Types ============

export interface LoginInput {
    email: string;
    password: string;
}

export interface RegisterInput {
    email: string;
    password: string;
    name?: string;
    inviteCode?: string;
    emailAlreadyVerified?: boolean;
    googleIdToken?: string;
}

export interface GoogleLoginInput {
    idToken: string;
}

export interface SendVerificationEmailInput {
    email: string;
}

export interface VerifyEmailTokenInput {
    token: string;
}

export interface VerifyEmailOTPInput {
    email: string;
    otp: string;
}

export interface SendMagicLinkInput {
    email: string;
}

export interface VerifyMagicLinkInput {
    token: string;
}

export interface VerifyOTPInput {
    email: string;
    otp: string;
}

export interface SendPasswordResetInput {
    email: string;
}

export interface ResetPasswordInput {
    token: string;
    newPassword: string;
}

export interface ChangePasswordInput {
    currentPassword: string;
    newPassword: string;
}

export interface ValidateInviteCodeInput {
    code: string;
}

// ============ Result Types ============

export interface AuthResult {
    success: boolean;
    user: User;
    accessToken?: string;
}

export interface RegistrationStatus {
    allowPublicRegistration: boolean;
    requireInviteCode: boolean;
    registrationClosedMessage: string | null;
    isOpen: boolean;
}

export interface InviteCodeValidation {
    valid: boolean;
    message?: string;
    remainingUses?: number;
}

export interface SendEmailResult {
    success: boolean;
    message?: string;
}

export interface PasswordChangeResult {
    success: boolean;
}

// ============ MFA Types ============

export interface MFASetupResult {
    success: boolean;
    secret: string;
    qrCodeUrl: string;
    recoveryCodes: string[];
}

export interface MFAVerifyResult {
    success: boolean;
    backupCodes: string[];
}

export interface MFAStatus {
    enabled: boolean;
}

export interface MFALoginInput {
    email: string;
    password: string;
    mfaCode: string;
}

export interface MFASetupInput {
    password: string;
}

export interface MFAVerifyInput {
    code: string;
}

export interface MFADisableInput {
    password: string;
    code: string;
}
