/**
 * Format Utilities
 * Shared formatting functions for frontend and backend
 */

/**
 * Format bytes to human readable string
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
    if (!bytes || bytes <= 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    // Clamp to valid index
    const sizeIndex = Math.min(i, sizes.length - 1);
    const value = bytes / Math.pow(k, sizeIndex);

    return `${value.toFixed(decimals)} ${sizes[sizeIndex]}`;
}

/**
 * Format duration in seconds to human readable string
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "2h 30m 15s")
 */
/** @internal Used by formatTimeRemaining — not part of public API */
function formatDuration(seconds: number): string {
    if (seconds < 0) return "Invalid";
    if (seconds === 0) return "0s";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(" ");
}

/**
 * Format time remaining for transfers
 * @param milliseconds - Time remaining in milliseconds
 * @returns Formatted string (e.g., "5m 30s remaining")
 */
export function formatTimeRemaining(milliseconds: number): string {
    if (milliseconds <= 0) return "Complete";

    const seconds = Math.floor(milliseconds / 1000);
    const duration = formatDuration(seconds);
    return `${duration} remaining`;
}

/**
 * Format speed in bytes per second
 * @param bytesPerSecond - Transfer speed
 * @returns Formatted string (e.g., "1.5 MB/s")
 */
export function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond <= 0) return "0 B/s";
    return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Formats a date to a localized string
 * @param date - Date to format (Date object, ISO string, or null)
 * @param locale - Locale string (default: 'en-GB')
 * @returns Formatted date string, or 'N/A' if date is null/undefined
 */
export function formatDate(
    date: Date | string | null,
    locale: string = "en-GB",
): string {
    if (!date) return "N/A";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString(locale);
}

/**
 * Formats a date with time to a localized string
 * @param date - Date to format (Date object, ISO string, or null)
 * @param locale - Locale string (default: 'en-GB')
 * @returns Formatted datetime string, or 'N/A' if date is null/undefined
 */
export function formatDateTime(
    date: Date | string | null,
    locale: string = "en-GB",
): string {
    if (!date) return "N/A";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleString(locale);
}
