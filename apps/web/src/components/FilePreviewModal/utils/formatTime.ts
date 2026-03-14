/**
 * Time formatting utilities for media players
 */

/**
 * Format seconds into MM:SS format
 * @param seconds - Number of seconds
 * @returns Formatted time string (e.g., "3:45")
 */
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds into HH:MM:SS format for longer durations
 * @param seconds - Number of seconds
 * @returns Formatted time string (e.g., "1:23:45")
 */
export function formatTimeLong(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return formatTime(seconds);
}
