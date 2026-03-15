/**
 * Timestamp Type Definitions
 *
 * Types for OpenTimestamps blockchain proof of existence feature.
 * Import from @stenvault/shared for consistency across frontend and backend.
 */

/**
 * Timestamp status values
 */
export type TimestampStatus =
    | "pending"
    | "confirming"
    | "confirmed"
    | "failed"
    | "skipped";

/**
 * Timestamp information for a file
 */
export interface FileTimestampInfo {
    hasTimestamp: boolean;
    status: TimestampStatus | null;
    submittedAt: Date | string | null;
    confirmedAt: Date | string | null;
    bitcoinBlockHeight: number | null;
    bitcoinTimestamp: Date | string | null;
    /** SHA-256 hash of the encrypted file content */
    contentHash?: string | null;
}

/**
 * Timestamp verification result
 */
export interface TimestampVerification {
    verified: boolean;
    status: TimestampStatus;
    message?: string;
    timestamp?: Date | string;
    bitcoinBlockHeight?: number;
    bitcoinBlockHash?: string;
    attestations?: string[];
}

/**
 * Timestamp submission result
 */
export interface TimestampSubmitResult {
    status: TimestampStatus;
    message: string;
    timestampId: number;
}

/**
 * Timestamp proof download
 */
export interface TimestampProof {
    proof: string; // Base64 encoded OTS proof
    filename: string;
    contentHash: string;
    status: TimestampStatus;
}

/**
 * Batch timestamp status entry
 */
export interface BatchTimestampStatus {
    fileId: number;
    status: TimestampStatus | null;
    confirmedAt: Date | string | null;
}

/**
 * Helper to check if timestamp is confirmed
 */
export function isTimestampConfirmed(status: TimestampStatus | null): boolean {
    return status === "confirmed";
}

/**
 * Helper to check if timestamp is pending (still processing)
 */
export function isTimestampPending(status: TimestampStatus | null): boolean {
    return status === "pending" || status === "confirming";
}

/**
 * Get human-readable label for timestamp status
 */
export function getTimestampStatusLabel(status: TimestampStatus | null): string {
    switch (status) {
        case "pending":
            return "Pending";
        case "confirming":
            return "Confirming";
        case "confirmed":
            return "Verified";
        case "failed":
            return "Failed";
        case "skipped":
            return "Skipped";
        default:
            return "Not timestamped";
    }
}
