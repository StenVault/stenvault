/**
 * Platform detection for OS-specific chrome (keyboard hints, kbd labels).
 * Kept separate from crypto/network providers — this has no dependencies
 * and no side effects.
 *
 * `navigator.platform` is deprecated but still returns a stable string on
 * every browser we target; the modern `navigator.userAgentData` is Chromium
 * only and returns a richer object, not a substitute for our one bit of
 * info. Good enough.
 */

export function isMac(): boolean {
    if (typeof navigator === 'undefined') return false;
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * The label for the "mod" key on the current platform.
 * `⌘` on macOS, `Ctrl` everywhere else.
 */
export function modKeyLabel(): string {
    return isMac() ? '⌘' : 'Ctrl';
}
