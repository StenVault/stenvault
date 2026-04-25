/**
 * Debug Logger - Only logs in development mode
 * 
 * Use this instead of console.log for debugging statements
 * that should not appear in production.
 * 
 * @example
 * import { debugLog, debugWarn, debugError } from '@/lib/debugLogger';
 * 
 * debugLog('[crypto]', 'Encryption started', { fileSize: 1024 });
 * debugWarn('[warn]', 'File too large');
 * debugError('[fail]', 'Upload failed', error);
 */

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

/**
 * Log debug message (only in development)
 */
export function debugLog(prefix: string, message: string, data?: unknown): void {
    if (isDev) {
        if (data !== undefined) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }
}

/**
 * Log warning message (only in development)
 */
export function debugWarn(prefix: string, message: string, data?: unknown): void {
    if (isDev) {
        if (data !== undefined) {
            console.warn(`${prefix} ${message}`, data);
        } else {
            console.warn(`${prefix} ${message}`);
        }
    }
}

/**
 * Log error message (only in development)
 */
export function debugError(prefix: string, message: string, data?: unknown): void {
    if (isDev) {
        if (data !== undefined) {
            console.error(`${prefix} ${message}`, data);
        } else {
            console.error(`${prefix} ${message}`);
        }
    }
}

/**
 * Log with custom console method (only in development)
 */
export function debugGroup(label: string, fn: () => void): void {
    if (isDev) {
        console.group(label);
        fn();
        console.groupEnd();
    }
}

/**
 * Time a block of code (only in development)
 */
export function debugTime<T>(label: string, fn: () => T): T {
    if (isDev) {
        console.time(label);
        const result = fn();
        console.timeEnd(label);
        return result;
    }
    return fn();
}

/**
 * Async version of debugTime
 */
export async function debugTimeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (isDev) {
        console.time(label);
        const result = await fn();
        console.timeEnd(label);
        return result;
    }
    return fn();
}

/**
 * Drop-in replacements for console.log/warn — same signature, dev-only.
 * Use these for bulk migration of existing console.log/warn calls.
 */
 
export function devLog(...args: any[]): void {
    if (isDev) console.log(...args);
}
 
export function devWarn(...args: any[]): void {
    if (isDev) console.warn(...args);
}
