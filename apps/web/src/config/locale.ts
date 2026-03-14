/**
 * Locale Configuration
 * Centralized locale settings for consistent internationalization across the app
 */

/**
 * Default locale for the application
 * Used as compile-time fallback; getUserLocale() returns browser locale at runtime.
 */
export const DEFAULT_LOCALE = 'en-GB';

/**
 * Supported locales
 */
export const SUPPORTED_LOCALES = {
    PT_PT: 'pt-PT',
    PT_BR: 'pt-BR',
    EN_US: 'en-US',
    EN_GB: 'en-GB',
} as const;

/**
 * Currency configuration per locale
 */
export const LOCALE_CURRENCY: Record<string, string> = {
    'pt-PT': 'EUR',
    'pt-BR': 'BRL',
    'en-US': 'USD',
    'en-GB': 'GBP',
};

/**
 * Date format preferences per locale
 */
export const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
};

/**
 * DateTime format preferences per locale
 */
export const DATETIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
    ...DATE_FORMAT_OPTIONS,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
};

/**
 * Number format options
 */
export const NUMBER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
    useGrouping: true,
};

/**
 * Get currency for locale
 */
export function getCurrencyForLocale(locale: string = DEFAULT_LOCALE): string {
    return LOCALE_CURRENCY[locale] || 'EUR';
}

/**
 * Get user's preferred locale from browser or return default
 */
export function getUserLocale(): string {
    if (typeof navigator !== 'undefined') {
        return navigator.language || DEFAULT_LOCALE;
    }
    return DEFAULT_LOCALE;
}
