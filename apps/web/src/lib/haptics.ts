/**
 * Haptic Feedback Utility
 *
 * Direct Vibration API wrapper for haptic feedback on supported browsers.
 * Note: The Vibration API is only available on Android and some mobile browsers.
 * iOS Safari does not support the Vibration API.
 *
 * This is a self-contained module -- no provider abstraction needed
 * since CloudVault mobile uses Kotlin Multiplatform (not React Native).
 */


function isVibrationAvailable(): boolean {
    return typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function';
}

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function safeVibrate(pattern: number | number[]): boolean {
    if (!isVibrationAvailable() || prefersReducedMotion()) return false;
    try {
        navigator.vibrate(pattern);
        return true;
    } catch {
        return false;
    }
}


/**
 * Trigger a short haptic feedback vibration
 *
 * @param duration - Vibration duration in milliseconds (default: 15ms)
 * @returns true if vibration was triggered, false otherwise
 */
export function hapticFeedback(duration: number = 15): boolean {
    return safeVibrate([duration]);
}

/**
 * Trigger a light tap feedback (10ms)
 */
export function hapticTap(): boolean {
    return safeVibrate(10);
}

/**
 * Trigger a medium feedback (15ms) - for swipe actions
 */
export function hapticMedium(): boolean {
    return safeVibrate(25);
}

/**
 * Trigger a strong feedback (25ms) - for confirmations/warnings
 */
export function hapticStrong(): boolean {
    return safeVibrate(50);
}

/**
 * Trigger a success pattern (two short pulses)
 */
export function hapticSuccess(): boolean {
    return safeVibrate([10, 50, 10]);
}

/**
 * Trigger an error pattern (three short pulses)
 */
export function hapticError(): boolean {
    return safeVibrate([20, 50, 20, 50, 20]);
}
