/**
 * Shamir Master Key Recovery Interface
 *
 * Platform-agnostic abstraction for Shamir Secret Sharing.
 * Used to split master keys into N shares requiring K to reconstruct.
 *
 * Architecture:
 * ```
 * Master Key (32 bytes)
 *        ↓
 *   splitSecret(MK, N, K)
 *        ↓
 * N shares (each 32 bytes)
 *        ↓
 * Distribute to:
 *   - Server (encrypted)
 *   - Email (encrypted)
 *   - Trusted Contacts (ECDH encrypted)
 *   - External (QR/paper with HMAC)
 * ```
 *
 * Recovery Flow:
 * ```
 * Collect K shares → combineShares() → Master Key
 *        ↓
 * Re-wrap with new KEK → Continue using files
 * ```
 *
 * Mathematical Foundation:
 * - Uses Galois Field GF(2^8) for operations
 * - Polynomial interpolation (Lagrange)
 * - Information-theoretically secure with < K shares
 *
 * References:
 * - Shamir's Secret Sharing: https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing
 * - RFC 7539: ChaCha20-Poly1305 (for share encryption)
 */

import { z } from "zod";

// ============ Constants ============

export const SHAMIR_CONSTANTS = {
    /** Maximum number of shares (GF(2^8) limitation) */
    MAX_SHARES: 255,

    /** Minimum threshold (must have at least 2 shares) */
    MIN_THRESHOLD: 2,

    /** Master key size in bytes */
    MASTER_KEY_SIZE: 32,

    /** Share size matches master key size */
    SHARE_SIZE: 32,

    /** Recovery session timeout in milliseconds (24 hours) */
    SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000,

    /** Maximum recovery attempts per session */
    MAX_RECOVERY_ATTEMPTS: 5,

    /** Maximum number of trusted contacts */
    MAX_TRUSTED_CONTACTS: 5,

    /** Maximum recovery attempts per 24 hours */
    MAX_ATTEMPTS_PER_DAY: 3,

    /** Share format version */
    SHARE_VERSION: "v1",

    /** Share encoding prefix */
    SHARE_PREFIX: "shamir",
} as const;

// ============ Types ============

/**
 * Share storage type
 */
export type ShamirShareType = "server" | "email" | "trusted_contact" | "external";

/**
 * Share status
 */
export type ShamirShareStatus = "active" | "used" | "revoked" | "invalidated";

/**
 * Recovery attempt status
 */
export type RecoveryStatus = "pending" | "collecting" | "completed" | "failed" | "expired";

/**
 * A single Shamir share
 */
export interface ShamirShare {
    /** Share index (1 to N) */
    index: number;
    /** Share data (32 bytes) */
    data: Uint8Array;
}

/**
 * Encoded share for storage/transmission
 */
export interface EncodedShare {
    /** Share index (1 to N) */
    index: number;
    /** Share data (Base64) */
    data: string;
    /** Threshold (K) */
    threshold: number;
    /** Total shares (N) */
    totalShares: number;
}

/**
 * Share distribution configuration
 */
export interface ShareDistribution {
    /** Number of server-stored shares */
    server: number;
    /** Number of email shares */
    email: number;
    /** User IDs of trusted contacts */
    trustedContacts: number[];
    /** Number of external (QR/paper) shares */
    external: number;
}

/**
 * Setup options for Shamir recovery
 */
export interface ShamirSetupOptions {
    /** Threshold (K) - minimum shares needed */
    threshold: number;
    /** Share distribution configuration */
    distribution: ShareDistribution;
    /** Master key version being protected */
    masterKeyVersion: number;
    /** Optional recipient emails for email shares */
    emailRecipients?: string[];
}

/**
 * Result of setting up Shamir recovery
 */
export interface ShamirSetupResult {
    /** Unique configuration ID */
    configId: string;
    /** Total shares generated */
    totalShares: number;
    /** Threshold required */
    threshold: number;
    /** Server shares (encrypted for server) */
    serverShares: EncryptedShare[];
    /** Email shares (encrypted for recovery token) */
    emailShares: EncryptedShare[];
    /** Trusted contact shares (encrypted for each contact) */
    contactShares: EncryptedShare[];
    /** External shares (for QR code display) */
    externalShares: ExternalShare[];
}

/**
 * Encrypted share for storage
 */
export interface EncryptedShare {
    /** Share index */
    index: number;
    /** Encrypted share data (Base64) */
    encryptedData: string;
    /** Encryption method used */
    encryptionMethod: string;
    /** HMAC integrity tag */
    integrityTag: string;
    /** Recipient (userId or email) */
    recipient?: string | number;
}

/**
 * External share for QR code/paper
 */
export interface ExternalShare {
    /** Share index */
    index: number;
    /** Share data as string (shamir:v1:index/K/N:base64data) */
    shareString: string;
    /** HMAC for integrity verification */
    hmac: string;
    /** QR code data (share + hmac truncated) */
    qrData: string;
}

/**
 * Recovery session info
 */
export interface RecoverySession {
    /** Recovery token */
    recoveryToken: string;
    /** Config ID */
    configId: string;
    /** Threshold needed */
    threshold: number;
    /** Shares collected so far */
    collectedCount: number;
    /** Indices of collected shares */
    collectedIndices: number[];
    /** Session status */
    status: RecoveryStatus;
    /** Expiration time */
    expiresAt: Date;
}

/**
 * Result of submitting a share
 */
export interface ShareSubmitResult {
    /** Whether share was accepted */
    accepted: boolean;
    /** Updated progress */
    progress: {
        collected: number;
        threshold: number;
        remaining: number;
    };
    /** Whether threshold is now reached */
    thresholdReached: boolean;
    /** Error message if rejected */
    error?: string;
}

/**
 * Result of completing recovery
 */
export interface RecoveryResult {
    /** Whether recovery succeeded */
    success: boolean;
    /** Recovered master key (only on success) */
    masterKey?: Uint8Array;
    /** Number of shares used */
    sharesUsed?: number;
    /** Error message if failed */
    error?: string;
}

/**
 * Shamir Recovery Provider Interface
 *
 * Platform-specific implementations for Shamir secret sharing.
 * Web uses existing shamirSecretSharing.ts, Mobile uses native.
 */
export interface ShamirRecoveryProvider {
    /**
     * Check if Shamir secret sharing is available
     */
    isAvailable(): Promise<boolean>;

    /**
     * Split a master key into N shares
     *
     * @param masterKey - 32-byte master key to split
     * @param totalShares - N: total number of shares
     * @param threshold - K: minimum shares needed
     * @returns Array of shares
     *
     * @throws Error if parameters are invalid
     */
    splitSecret(
        masterKey: Uint8Array,
        totalShares: number,
        threshold: number
    ): Promise<ShamirShare[]>;

    /**
     * Combine K or more shares to reconstruct master key
     *
     * @param shares - Array of at least K shares
     * @returns Reconstructed master key
     *
     * @throws Error if insufficient shares or shares are invalid
     */
    combineShares(shares: ShamirShare[]): Promise<Uint8Array>;

    /**
     * Validate share integrity using HMAC
     *
     * @param share - Share to validate
     * @param hmac - Expected HMAC
     * @param configId - Configuration ID (used as HMAC key context)
     * @returns Whether share is valid
     */
    verifyShareIntegrity(
        share: EncodedShare,
        hmac: string,
        configId: string
    ): Promise<boolean>;

    /**
     * Encode share as string for external storage
     * Format: shamir:v1:index/threshold/totalShares:base64data
     *
     * @param share - Share to encode
     * @returns Encoded share string
     */
    encodeShareAsString(share: EncodedShare): string;

    /**
     * Decode share from string format
     *
     * @param encoded - Encoded share string
     * @returns Decoded share
     *
     * @throws Error if format is invalid
     */
    decodeShareFromString(encoded: string): EncodedShare;

    /**
     * Generate HMAC for share integrity
     *
     * @param share - Share to protect
     * @param configId - Configuration ID
     * @returns HMAC hex string
     */
    generateShareHmac(share: EncodedShare, configId: string): Promise<string>;
}

/**
 * Factory function type for creating Shamir providers
 */
export type ShamirRecoveryProviderFactory = () => ShamirRecoveryProvider;

// ============ Zod Schemas ============

/**
 * Share distribution schema
 */
export const shareDistributionSchema = z.object({
    server: z.number().min(0).max(SHAMIR_CONSTANTS.MAX_SHARES),
    email: z.number().min(0).max(SHAMIR_CONSTANTS.MAX_SHARES),
    trustedContacts: z.array(z.number()).max(SHAMIR_CONSTANTS.MAX_TRUSTED_CONTACTS),
    external: z.number().min(0).max(SHAMIR_CONSTANTS.MAX_SHARES),
}).refine(
    (data) => {
        const total = data.server + data.email + data.trustedContacts.length + data.external;
        return total >= SHAMIR_CONSTANTS.MIN_THRESHOLD && total <= SHAMIR_CONSTANTS.MAX_SHARES;
    },
    {
        message: `Total shares must be between ${SHAMIR_CONSTANTS.MIN_THRESHOLD} and ${SHAMIR_CONSTANTS.MAX_SHARES}`,
    }
);

/**
 * Setup options schema
 */
export const shamirSetupOptionsSchema = z.object({
    threshold: z.number()
        .min(SHAMIR_CONSTANTS.MIN_THRESHOLD)
        .max(SHAMIR_CONSTANTS.MAX_SHARES),
    distribution: shareDistributionSchema,
    masterKeyVersion: z.number().positive(),
    emailRecipients: z.array(z.string().email()).optional(),
}).refine(
    (data) => {
        const total = data.distribution.server +
            data.distribution.email +
            data.distribution.trustedContacts.length +
            data.distribution.external;
        return data.threshold <= total;
    },
    {
        message: "Threshold cannot be greater than total shares",
    }
);

/**
 * Encoded share schema
 */
export const encodedShareSchema = z.object({
    index: z.number().min(1).max(SHAMIR_CONSTANTS.MAX_SHARES),
    data: z.string().min(1),
    threshold: z.number().min(SHAMIR_CONSTANTS.MIN_THRESHOLD),
    totalShares: z.number().min(SHAMIR_CONSTANTS.MIN_THRESHOLD).max(SHAMIR_CONSTANTS.MAX_SHARES),
});

/**
 * Share string format regex
 */
export const SHARE_STRING_REGEX = /^shamir:v1:(\d+)\/(\d+)\/(\d+):(.+)$/;

// ============ Utility Functions ============

/**
 * Calculate total shares from distribution
 */
export function getTotalShares(distribution: ShareDistribution): number {
    return (
        distribution.server +
        distribution.email +
        distribution.trustedContacts.length +
        distribution.external
    );
}

/**
 * Validate setup configuration
 */
export function validateSetupConfig(options: ShamirSetupOptions): {
    valid: boolean;
    error?: string;
} {
    const totalShares = getTotalShares(options.distribution);

    if (totalShares < SHAMIR_CONSTANTS.MIN_THRESHOLD) {
        return {
            valid: false,
            error: `Total shares (${totalShares}) must be at least ${SHAMIR_CONSTANTS.MIN_THRESHOLD}`,
        };
    }

    if (totalShares > SHAMIR_CONSTANTS.MAX_SHARES) {
        return {
            valid: false,
            error: `Total shares (${totalShares}) cannot exceed ${SHAMIR_CONSTANTS.MAX_SHARES}`,
        };
    }

    if (options.threshold < SHAMIR_CONSTANTS.MIN_THRESHOLD) {
        return {
            valid: false,
            error: `Threshold (${options.threshold}) must be at least ${SHAMIR_CONSTANTS.MIN_THRESHOLD}`,
        };
    }

    if (options.threshold > totalShares) {
        return {
            valid: false,
            error: `Threshold (${options.threshold}) cannot be greater than total shares (${totalShares})`,
        };
    }

    if (options.distribution.trustedContacts.length > SHAMIR_CONSTANTS.MAX_TRUSTED_CONTACTS) {
        return {
            valid: false,
            error: `Maximum ${SHAMIR_CONSTANTS.MAX_TRUSTED_CONTACTS} trusted contacts allowed`,
        };
    }

    // Check for duplicate trusted contacts
    const uniqueContacts = new Set(options.distribution.trustedContacts);
    if (uniqueContacts.size !== options.distribution.trustedContacts.length) {
        return {
            valid: false,
            error: "Duplicate trusted contacts not allowed",
        };
    }

    return { valid: true };
}

/**
 * Validate shares before combining
 */
export function validateSharesForCombine(
    shares: EncodedShare[]
): { valid: boolean; error?: string } {
    if (shares.length === 0) {
        return { valid: false, error: "No shares provided" };
    }

    const first = shares[0]!;

    // Check all shares have same threshold/total
    for (const share of shares) {
        if (share.threshold !== first.threshold) {
            return { valid: false, error: "Shares have different thresholds" };
        }
        if (share.totalShares !== first.totalShares) {
            return { valid: false, error: "Shares have different total counts" };
        }
    }

    // Check we have enough shares
    if (shares.length < first.threshold) {
        return {
            valid: false,
            error: `Need ${first.threshold} shares, only have ${shares.length}`,
        };
    }

    // Check for duplicate indices
    const indices = new Set(shares.map((s) => s.index));
    if (indices.size !== shares.length) {
        return { valid: false, error: "Duplicate share indices" };
    }

    return { valid: true };
}

/**
 * Parse share string to EncodedShare
 */
export function parseShareString(shareString: string): EncodedShare | null {
    const match = shareString.match(SHARE_STRING_REGEX);
    if (!match) {
        return null;
    }

    return {
        index: parseInt(match[1]!, 10),
        threshold: parseInt(match[2]!, 10),
        totalShares: parseInt(match[3]!, 10),
        data: match[4]!,
    };
}

/**
 * Format share as string
 */
export function formatShareString(share: EncodedShare): string {
    return `${SHAMIR_CONSTANTS.SHARE_PREFIX}:${SHAMIR_CONSTANTS.SHARE_VERSION}:${share.index}/${share.threshold}/${share.totalShares}:${share.data}`;
}

/**
 * Calculate Shamir recovery progress
 * Note: This is specific to Shamir recovery, named differently to avoid conflicts
 */
export function calculateShamirProgress(
    collected: number,
    threshold: number
): { collected: number; threshold: number; remaining: number; percentage: number } {
    const remaining = Math.max(0, threshold - collected);
    const percentage = Math.min(100, Math.round((collected / threshold) * 100));

    return { collected, threshold, remaining, percentage };
}

// Note: Base64 helpers are re-exported from keyWrap.ts
// Import them from './keyWrap' when needed
