/**
 * Copy text to clipboard. Abstracted so tests can mock it and so both
 * apps (web + admin) share the same implementation.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        return false;
    }
}
