/**
 * Utility functions for formatting data
 * Centralized formatters to avoid duplication across components
 */

import {
    DEFAULT_LOCALE,
    getCurrencyForLocale
} from '@/config/locale';

// Single source of truth for formatBytes, formatDate, formatDateTime — re-export from @cloudvault/shared
export { formatBytes, formatDate, formatDateTime } from '@cloudvault/shared';

/**
 * Formats a number with thousand separators
 * @param num - Number to format
 * @param locale - Locale string (default from locale config)
 * @returns Formatted number string
 */
export function formatNumber(num: number, locale: string = DEFAULT_LOCALE): string {
    return new Intl.NumberFormat(locale).format(num);
}

/**
 * Formats a currency value
 * @param amount - Amount to format
 * @param currency - Currency code (default: derived from locale)
 * @param locale - Locale string (default from locale config)
 * @returns Formatted currency string
 */
export function formatCurrency(
    amount: number,
    currency?: string,
    locale: string = DEFAULT_LOCALE
): string {
    const currencyCode = currency || getCurrencyForLocale(locale);
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode
    }).format(amount);
}

/**
 * Truncates text with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
