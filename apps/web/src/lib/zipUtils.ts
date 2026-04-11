/**
 * ZIP entry path sanitization.
 *
 * In a zero-knowledge system filenames are decrypted client-side and untrusted —
 * a malicious encrypted name containing path traversal sequences (e.g. "../../etc/passwd")
 * could escape the ZIP root. This helper strips dangerous segments.
 */

/** Strip path traversal segments so decrypted names can't escape the ZIP root */
export function sanitizeZipEntryPath(name: string): string {
    return name.replace(/\\/g, '/').split('/')
        .filter(seg => seg !== '..' && seg !== '.' && seg.length > 0)
        .join('/') || 'unnamed';
}
