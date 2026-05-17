/// <reference lib="dom" />
// DOM reference: CryptoKey / SubtleCrypto / BufferSource. This file is
// the browser-facing fragment-key encoding for Public Send URLs. It
// lives under /core because it defines the Send URL fragment format
// (protocol-level), even though the implementation only runs in the
// browser. Accessed via @stenvault/send/core/fragment subpath so that
// @stenvault/send/core stays DOM-free for server-side consumers.

/**
 * Generate a random 256-bit AES-GCM key for a send session.
 *
 * The key is extractable so it can be exported into a URL fragment
 * (`#key=...`) and sent out-of-band. The server never sees it.
 */
export async function generateSendKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // extractable — needed for export to URL fragment
        ["encrypt", "decrypt"],
    );
}

/**
 * Export a CryptoKey to a base64url-encoded string (for URL fragment).
 */
export async function keyToFragment(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", key);
    return base64urlEncode(new Uint8Array(raw));
}

/**
 * Import a CryptoKey from a base64url-encoded URL fragment.
 */
export async function fragmentToKey(fragment: string): Promise<CryptoKey> {
    const raw = base64urlDecode(fragment);
    if (raw.byteLength !== 32) {
        throw new Error(`Invalid key length: expected 32 bytes, got ${raw.byteLength}`);
    }
    return crypto.subtle.importKey(
        "raw",
        raw as BufferSource,
        { name: "AES-GCM", length: 256 },
        true, // extractable — needed for chunk manifest HMAC verification
        ["encrypt", "decrypt"],
    );
}

// ============ Base64url Helpers ============

export function base64urlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function base64urlDecode(str: string): Uint8Array {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
        base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
