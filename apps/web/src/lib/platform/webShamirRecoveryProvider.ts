/**
 * Web Shamir Recovery Provider
 *
 * Platform-specific implementation of ShamirRecoveryProvider for web browsers.
 * Uses the existing shamirSecretSharing.ts implementation.
 *
 * @module lib/platform/webShamirRecoveryProvider
 */

import {
    splitSecret,
    combineShares,
    encodeShareAsString,
    decodeShareFromString,
    validateShares,
    type ShamirShare,
    type EncodedShare,
} from "../shamirSecretSharing";
import type {
    ShamirRecoveryProvider,
    ShamirShare as SharedShamirShare,
    EncodedShare as SharedEncodedShare,
} from "@stenvault/shared";
import { base64ToUint8Array, arrayBufferToBase64, toArrayBuffer } from "@/lib/platform";
import { devWarn } from '@/lib/debugLogger';

// ============ Utility Functions ============

/**
 * Generate HMAC-SHA256 using Web Crypto API
 */
async function generateHmac(
    message: string,
    keyMaterial: string
): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyMaterial);
    const messageData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============ Provider Implementation ============

/**
 * Web implementation of Shamir Recovery Provider
 */
class WebShamirRecoveryProviderImpl implements ShamirRecoveryProvider {
    /**
     * Check if Shamir secret sharing is available
     */
    async isAvailable(): Promise<boolean> {
        // Check for Web Crypto API
        if (typeof crypto === "undefined" || !crypto.subtle) {
            return false;
        }

        // Check for required functions
        if (typeof crypto.getRandomValues !== "function") {
            return false;
        }

        return true;
    }

    /**
     * Split a master key into N shares
     */
    async splitSecret(
        masterKey: Uint8Array,
        totalShares: number,
        threshold: number
    ): Promise<SharedShamirShare[]> {
        // Validate input
        if (masterKey.length !== 32) {
            throw new Error("Master key must be 32 bytes");
        }
        if (threshold < 2) {
            throw new Error("Threshold must be at least 2");
        }
        if (threshold > totalShares) {
            throw new Error("Threshold cannot be greater than total shares");
        }
        if (totalShares > 255) {
            throw new Error("Maximum 255 shares supported");
        }

        // Use existing implementation
        const shares = splitSecret(masterKey, totalShares, threshold);

        return shares.map((share) => ({
            index: share.index,
            data: share.data,
        }));
    }

    /**
     * Combine K or more shares to reconstruct master key
     */
    async combineShares(shares: SharedShamirShare[]): Promise<Uint8Array> {
        if (shares.length < 2) {
            throw new Error("At least 2 shares required");
        }

        // Convert to internal format
        const internalShares: ShamirShare[] = shares.map((share) => ({
            index: share.index,
            data: share.data,
        }));

        return combineShares(internalShares);
    }

    /**
     * Validate share integrity using HMAC
     *
     * NOTE: This is a LOCAL verification only and should NOT be trusted for security.
     * The server performs authoritative HMAC verification using INTERNAL_SECRET.
     * This method is kept for backwards compatibility and local display purposes.
     *
     * @deprecated Use server-side verification for security-critical operations
     */
    async verifyShareIntegrity(
        share: SharedEncodedShare,
        hmac: string,
        configId: string
    ): Promise<boolean> {
        // WARNING: This uses configId as HMAC key which is publicly known.
        // Server-side verification with INTERNAL_SECRET is the authoritative check.
        const expectedHmac = await this.generateShareHmac(share, configId);
        return expectedHmac === hmac;
    }

    /**
     * Encode share as string for external storage
     */
    encodeShareAsString(share: SharedEncodedShare): string {
        return encodeShareAsString({
            index: share.index,
            data: share.data,
            threshold: share.threshold,
            totalShares: share.totalShares,
        });
    }

    /**
     * Decode share from string format
     */
    decodeShareFromString(encoded: string): SharedEncodedShare {
        return decodeShareFromString(encoded);
    }

    /**
     * Generate HMAC for share integrity
     *
     * WARNING: This uses configId as the HMAC key, which is publicly known.
     * This HMAC is NOT suitable for security verification.
     * The server generates authoritative HMACs using INTERNAL_SECRET.
     *
     * This method exists for local display/organization purposes only.
     * Server-side verification is always performed on share submission.
     *
     * @deprecated Do not use for security-critical operations
     */
    async generateShareHmac(
        share: SharedEncodedShare,
        configId: string
    ): Promise<string> {
        // WARNING: configId is public - this HMAC can be forged by anyone with configId
        // Server verifies shares using INTERNAL_SECRET, not this client-generated HMAC
        const message = `${configId}:${share.index}:${share.data}`;
        return generateHmac(message, configId);
    }
}

// ============ Provider Instance ============

let providerInstance: WebShamirRecoveryProviderImpl | null = null;

/**
 * Get the Web Shamir Recovery Provider instance
 */
export function getWebShamirRecoveryProvider(): ShamirRecoveryProvider {
    if (!providerInstance) {
        providerInstance = new WebShamirRecoveryProviderImpl();
    }
    return providerInstance;
}

// ============ High-Level Recovery Functions ============

/**
 * Prepare shares for storage/distribution
 * Splits master key and encrypts shares based on type
 */
export async function prepareRecoveryShares(
    masterKey: Uint8Array,
    totalShares: number,
    threshold: number,
    configId: string
): Promise<{
    shares: Array<{
        index: number;
        data: string;
        threshold: number;
        totalShares: number;
        hmac: string;
    }>;
}> {
    const provider = getWebShamirRecoveryProvider();

    // Split the master key
    const rawShares = await provider.splitSecret(masterKey, totalShares, threshold);

    // Encode and generate HMACs
    const shares = await Promise.all(
        rawShares.map(async (share) => {
            const encoded: SharedEncodedShare = {
                index: share.index,
                data: arrayBufferToBase64(toArrayBuffer(share.data)),
                threshold,
                totalShares,
            };

            const hmac = await provider.generateShareHmac(encoded, configId);

            return {
                index: encoded.index,
                data: encoded.data,
                threshold: encoded.threshold,
                totalShares: encoded.totalShares,
                hmac,
            };
        })
    );

    return { shares };
}

/**
 * Recover master key from collected shares
 */
export async function recoverMasterKey(
    collectedShares: Array<{
        index: number;
        data: string;
    }>
): Promise<Uint8Array> {
    const provider = getWebShamirRecoveryProvider();

    // Convert to internal format
    const shares: SharedShamirShare[] = collectedShares.map((share) => ({
        index: share.index,
        data: base64ToUint8Array(share.data),
    }));

    // Combine shares to recover master key
    return provider.combineShares(shares);
}

/**
 * Validate shares before attempting recovery
 */
export function validateRecoveryShares(
    shares: Array<{
        index: number;
        data: string;
        threshold: number;
        totalShares: number;
    }>
): { valid: boolean; error?: string } {
    // Convert to EncodedShare format
    const encodedShares: EncodedShare[] = shares.map((s) => ({
        index: s.index,
        data: s.data,
        threshold: s.threshold,
        totalShares: s.totalShares,
    }));

    return validateShares(encodedShares);
}

/**
 * Generate external share QR data
 */
export async function generateExternalShareQR(
    share: {
        index: number;
        data: string;
        threshold: number;
        totalShares: number;
    },
    configId: string
): Promise<{ shareString: string; qrData: string }> {
    const provider = getWebShamirRecoveryProvider();

    const encoded: SharedEncodedShare = {
        index: share.index,
        data: share.data,
        threshold: share.threshold,
        totalShares: share.totalShares,
    };

    const shareString = provider.encodeShareAsString(encoded);
    const hmac = await provider.generateShareHmac(encoded, configId);

    const qrData = `${shareString}|${hmac}`;

    return { shareString, qrData };
}

/**
 * Parse and validate external share from QR code
 *
 * NOTE: This function performs LOCAL format validation only.
 * The HMAC in the QR code was generated with a public configId key,
 * so it provides limited security. The server performs authoritative
 * verification using INTERNAL_SECRET when the share is submitted.
 *
 * @param qrData - QR code data string
 * @param configId - Configuration ID (used for local HMAC check, but not security-critical)
 */
export async function parseExternalShareQR(
    qrData: string,
    configId: string
): Promise<{
    valid: boolean;
    share?: SharedEncodedShare;
    error?: string;
}> {
    try {
        // Accept 16-char (legacy), 32-char (mid), and full 64-char HMACs
        // Parse format: shamir:v1:index/threshold/total:base64data|hmac
        const match = qrData.match(
            /^(shamir:v1:\d+\/\d+\/\d+:[A-Za-z0-9+/=]+)\|([a-f0-9]{16,64})$/
        );

        if (!match) {
            return { valid: false, error: "Invalid QR code format" };
        }

        const shareString = match[1]!;
        const truncatedHmac = match[2]!;

        const provider = getWebShamirRecoveryProvider();
        const share = provider.decodeShareFromString(shareString);

        // SECURITY NOTE: This HMAC check uses configId (public) as key.
        // It only provides basic tamper detection against accidental corruption.
        // Server-side verification with INTERNAL_SECRET is the authoritative security check.
        // We still perform this check to catch obvious corruption/invalid QR codes.
        const fullHmac = await provider.generateShareHmac(share, configId);
        if (!fullHmac.startsWith(truncatedHmac)) {
            // Log warning but note this is not a security failure - server will verify properly
            devWarn(
                "[ShamirRecovery] Local HMAC check failed - share may be corrupted. " +
                "Server will perform authoritative verification on submission."
            );
            return { valid: false, error: "Share may be corrupted or invalid" };
        }

        return { valid: true, share };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : "Failed to parse QR code",
        };
    }
}

export default getWebShamirRecoveryProvider;
