/**
 * Encryption / Master Key Types
 *
 * Types for master key status, setup, verification, and recovery.
 *
 * @generated 2026-02-21
 */


export interface MasterKeyStatus {
    isSetup: boolean;
    hasHint: boolean;
}

export interface SetupMasterKeyInput {
    password: string;
    hint?: string;
}

export interface SetupMasterKeyResult {
    success: boolean;
    recoveryCodes: string[];
}

export interface VerifyMasterKeyInput {
    password: string;
}

export interface VerifyMasterKeyResult {
    success: boolean;
}

export interface ChangeMasterKeyInput {
    currentPassword: string;
    newPassword: string;
    newHint?: string;
}

export interface ChangeMasterKeyResult {
    success: boolean;
    recoveryCodes: string[];
}

export interface ResetMasterKeyInput {
    recoveryCode: string;
    newPassword: string;
    newHint?: string;
}

export interface ResetMasterKeyResult {
    success: boolean;
    recoveryCodes: string[];
}

export interface GetPasswordHintResult {
    hint: string | null;
}
