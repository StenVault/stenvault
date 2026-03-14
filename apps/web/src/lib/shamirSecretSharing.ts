/**
 * Shamir's Secret Sharing Implementation
 * 
 * Splits a secret into N shares, where any K shares can reconstruct the original.
 * Uses Galois Field GF(2^8) for operations.
 * 
 * Based on Shamir's Secret Sharing Scheme:
 * https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing
 */


/**
 * Galois Field GF(2^8) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
 * This polynomial makes g=2 a primitive element (generator of the multiplicative group).
 */
const GF256_PRIMITIVE = 0x11d;

// Precomputed log and exp tables for GF(2^8)
// EXP_TABLE[i] = g^i mod primitive, where g=2 is the generator
// LOG_TABLE[x] = i such that g^i = x (undefined for x=0)
const EXP_TABLE: number[] = new Array(512);
const LOG_TABLE: number[] = new Array(256);

// Initialize tables
// The generator g=2 has order 255 in GF(2^8), meaning g^255 = 1
function initGFTables(): void {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        // Multiply by generator (2) in GF(2^8)
        x = (x << 1) ^ (x >= 128 ? GF256_PRIMITIVE : 0);
    }
    // EXP_TABLE[255] should equal EXP_TABLE[0] = 1 (since g^255 = 1)
    EXP_TABLE[255] = 1;
    // Extend table for easier modular arithmetic (avoids negative indices)
    for (let i = 256; i < 512; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 255]!;
    }
    // LOG_TABLE[0] is undefined (log of 0 doesn't exist)
    LOG_TABLE[0] = -1; // Sentinel value
}

// Initialize on module load
initGFTables();

/**
 * Galois Field multiplication using log/exp tables
 * a * b = exp(log(a) + log(b)) mod 255
 */
function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    const sum = LOG_TABLE[a]! + LOG_TABLE[b]!;
    return EXP_TABLE[sum % 255]!;
}

/**
 * Galois Field division using log/exp tables
 * a / b = exp(log(a) - log(b)) mod 255
 */
function gfDiv(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero");
    if (a === 0) return 0;
    // Add 255 to ensure positive result before modulo
    const diff = LOG_TABLE[a]! - LOG_TABLE[b]! + 255;
    return EXP_TABLE[diff % 255]!;
}


export interface ShamirShare {
    index: number; // Share index (1 to n)
    data: Uint8Array; // Share data
}

export interface ShamirConfig {
    totalShares: number; // n: total shares to create
    threshold: number; // k: minimum shares needed to reconstruct
}

export interface EncodedShare {
    index: number;
    data: string; // Base64 encoded
    threshold: number;
    totalShares: number;
}


/**
 * Split a secret into n shares, requiring k shares to reconstruct
 * 
 * @param secret - The secret to split (Uint8Array)
 * @param totalShares - Total number of shares to create (n)
 * @param threshold - Minimum shares needed to reconstruct (k)
 * @returns Array of shares
 */
export function splitSecret(
    secret: Uint8Array,
    totalShares: number,
    threshold: number
): ShamirShare[] {
    if (threshold > totalShares) {
        throw new Error("Threshold cannot be greater than total shares");
    }
    if (threshold < 2) {
        throw new Error("Threshold must be at least 2");
    }
    if (totalShares > 255) {
        throw new Error("Maximum 255 shares supported");
    }

    const shares: ShamirShare[] = [];

    // Initialize shares
    for (let i = 0; i < totalShares; i++) {
        shares.push({
            index: i + 1, // Shares indexed 1 to n
            data: new Uint8Array(secret.length),
        });
    }

    // For each byte of the secret
    for (let byteIndex = 0; byteIndex < secret.length; byteIndex++) {
        // Generate random polynomial coefficients
        // f(x) = a_0 + a_1*x + a_2*x^2 + ... + a_{k-1}*x^{k-1}
        // where a_0 = secret byte
        const coefficients = new Uint8Array(threshold);
        coefficients[0] = secret[byteIndex] ?? 0;

        // Generate random coefficients for a_1 to a_{k-1}
        crypto.getRandomValues(coefficients.subarray(1));

        // Evaluate polynomial at each share index
        for (let shareIndex = 0; shareIndex < totalShares; shareIndex++) {
            const x = shareIndex + 1; // x = 1, 2, 3, ...
            let y = 0;
            let xPower = 1;

            for (let c = 0; c < threshold; c++) {
                y ^= gfMul(coefficients[c] ?? 0, xPower);
                xPower = gfMul(xPower, x);
            }

            const share = shares[shareIndex];
            if (share) {
                share.data[byteIndex] = y;
            }
        }
    }

    return shares;
}

/**
 * Reconstruct secret from k shares using Lagrange interpolation
 *
 * @param shares - Array of shares (at least threshold shares)
 * @returns Reconstructed secret
 */
export function combineShares(shares: ShamirShare[]): Uint8Array {
    if (shares.length < 2) {
        throw new Error("At least 2 shares required");
    }

    // Check all shares have same length
    const secretLength = shares[0]?.data.length ?? 0;
    for (const share of shares) {
        if (share.data.length !== secretLength) {
            throw new Error("All shares must have the same length");
        }
    }

    const secret = new Uint8Array(secretLength);

    // For each byte position
    for (let byteIndex = 0; byteIndex < secretLength; byteIndex++) {
        // Lagrange interpolation at x=0
        let result = 0;

        for (let i = 0; i < shares.length; i++) {
            const share = shares[i];
            if (!share) continue;

            const xi = share.index;
            const yi = share.data[byteIndex] ?? 0;

            // Calculate Lagrange basis polynomial L_i(0)
            let numerator = 1;
            let denominator = 1;

            for (let j = 0; j < shares.length; j++) {
                if (i !== j) {
                    const otherShare = shares[j];
                    if (!otherShare) continue;

                    const xj = otherShare.index;
                    // L_i(0) = product of (-x_j) / (x_i - x_j) for all j != i
                    // In GF(2^8), -x = x, so this simplifies
                    numerator = gfMul(numerator, xj);
                    denominator = gfMul(denominator, xi ^ xj);
                }
            }

            // L_i(0) * y_i
            const lagrangeTerm = gfMul(yi, gfDiv(numerator, denominator));
            result ^= lagrangeTerm;
        }

        secret[byteIndex] = result;
    }

    return secret;
}


/**
 * Split a string secret into shares
 */
export function splitSecretString(
    secret: string,
    totalShares: number,
    threshold: number
): EncodedShare[] {
    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(secret);
    const shares = splitSecret(secretBytes, totalShares, threshold);

    return shares.map(share => ({
        index: share.index,
        data: arrayBufferToBase64(toArrayBuffer(share.data)),
        threshold,
        totalShares,
    }));
}

/**
 * Combine shares to recover string secret
 */
export function combineSharesString(encodedShares: EncodedShare[]): string {
    const shares: ShamirShare[] = encodedShares.map(es => ({
        index: es.index,
        data: base64ToUint8Array(es.data),
    }));

    const secretBytes = combineShares(shares);
    const decoder = new TextDecoder();
    return decoder.decode(secretBytes);
}

/**
 * Split an encryption key into shares
 */
export function splitKey(
    key: CryptoKey | ArrayBuffer | Uint8Array,
    totalShares: number,
    threshold: number
): Promise<EncodedShare[]> | EncodedShare[] {
    if (key instanceof CryptoKey) {
        return crypto.subtle.exportKey("raw", key).then(rawKey => {
            return splitSecret(new Uint8Array(rawKey), totalShares, threshold)
                .map(share => ({
                    index: share.index,
                    data: arrayBufferToBase64(toArrayBuffer(share.data)),
                    threshold,
                    totalShares,
                }));
        });
    }

    const keyBytes = key instanceof ArrayBuffer ? new Uint8Array(key) : key;
    const shares = splitSecret(keyBytes, totalShares, threshold);

    return shares.map(share => ({
        index: share.index,
        data: arrayBufferToBase64(toArrayBuffer(share.data)),
        threshold,
        totalShares,
    }));
}

/**
 * Combine shares to recover encryption key
 */
export function combineKeyShares(encodedShares: EncodedShare[]): Uint8Array {
    const shares: ShamirShare[] = encodedShares.map(es => ({
        index: es.index,
        data: base64ToUint8Array(es.data),
    }));

    return combineShares(shares);
}


/**
 * Encode a share as a compact string for easy sharing
 * Format: shamir:v1:<index>/<threshold>/<total>:<base64data>
 */
export function encodeShareAsString(share: EncodedShare): string {
    return `shamir:v1:${share.index}/${share.threshold}/${share.totalShares}:${share.data}`;
}

/**
 * Decode a share from string format
 */
export function decodeShareFromString(encoded: string): EncodedShare {
    const match = encoded.match(/^shamir:v1:(\d+)\/(\d+)\/(\d+):(.+)$/);
    if (!match) {
        throw new Error("Invalid share format");
    }

    return {
        index: parseInt(match[1] ?? "0", 10),
        threshold: parseInt(match[2] ?? "0", 10),
        totalShares: parseInt(match[3] ?? "0", 10),
        data: match[4] ?? "",
    };
}

/**
 * Validate that shares are compatible
 */
export function validateShares(shares: EncodedShare[]): { valid: boolean; error?: string } {
    if (shares.length === 0) {
        return { valid: false, error: "No shares provided" };
    }

    const first = shares[0];
    if (!first) {
        return { valid: false, error: "Invalid share" };
    }

    // Check all shares have same threshold and total
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
            error: `Need ${first.threshold} shares, only have ${shares.length}`
        };
    }

    // Check for duplicate indices
    const indices = new Set(shares.map(s => s.index));
    if (indices.size !== shares.length) {
        return { valid: false, error: "Duplicate share indices" };
    }

    return { valid: true };
}


import { base64ToUint8Array, arrayBufferToBase64, toArrayBuffer } from '@/lib/platform';


/**
 * Generate a random encryption key and split it
 */
export async function generateAndSplitKey(
    keyLengthBytes: number,
    totalShares: number,
    threshold: number
): Promise<{ key: Uint8Array; shares: EncodedShare[] }> {
    const key = new Uint8Array(keyLengthBytes);
    crypto.getRandomValues(key);

    const shares = splitSecret(key, totalShares, threshold).map(share => ({
        index: share.index,
        data: arrayBufferToBase64(toArrayBuffer(share.data)),
        threshold,
        totalShares,
    }));

    return { key, shares };
}
