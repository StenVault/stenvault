/**
 * Device Entropy Collection (Phase 3.1 UES)
 *
 * Collects device-specific entropy for User Entropy Seed generation.
 * Uses multiple fingerprinting techniques to create a unique device identifier.
 *
 * Fingerprints collected:
 * - Canvas fingerprint (WebGL rendering)
 * - Timezone + Language
 * - Screen resolution + color depth
 * - Hardware concurrency
 * - Platform info
 *
 * Security considerations:
 * - Fingerprint is hashed (SHA-256), never stored raw
 * - Combined with crypto.getRandomValues() for entropy
 * - Used only for device binding, not tracking
 *
 * @module deviceEntropy
 */

import { debugLog, debugError } from '@/lib/debugLogger';

// ============ Types ============

export interface DeviceFingerprint {
    canvas: string;
    webgl: string;
    timezone: string;
    language: string;
    screen: string;
    hardwareConcurrency: number;
    platform: string;
    userAgent: string;
    touchSupport: boolean;
    colorDepth: number;
    deviceMemory: number | null;
}

export interface DeviceEntropyResult {
    /** Combined entropy (256 bits) from fingerprint + random */
    entropy: Uint8Array;
    /** SHA-256 hash of device fingerprint (for identification) */
    fingerprintHash: string;
    /** Raw fingerprint data (for debugging, not stored) */
    fingerprint: DeviceFingerprint;
}

// ============ Canvas Fingerprinting ============

/**
 * Generate canvas fingerprint using 2D rendering
 * This creates a unique pattern based on how the browser renders text and shapes
 */
function getCanvasFingerprint(): string {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';

        canvas.width = 280;
        canvas.height = 60;

        // Draw text with specific font (font rendering varies by device/browser)
        ctx.textBaseline = 'alphabetic';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('StenVault Device Fingerprint', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('StenVault Device Fingerprint', 4, 17);

        // Draw gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, 'red');
        gradient.addColorStop(0.5, 'green');
        gradient.addColorStop(1, 'blue');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 30, 280, 5);

        // Draw arc
        ctx.beginPath();
        ctx.arc(50, 50, 15, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();

        return canvas.toDataURL();
    } catch {
        return 'canvas-error';
    }
}

/**
 * Generate WebGL fingerprint
 * Uses GPU info and WebGL parameters which vary by device
 */
function getWebGLFingerprint(): string {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl || !(gl instanceof WebGLRenderingContext)) return 'no-webgl';

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';

        // Collect WebGL parameters
        const params = [
            gl.getParameter(gl.VERSION),
            gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            vendor,
            renderer,
            gl.getParameter(gl.MAX_TEXTURE_SIZE),
            gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
            gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
            gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
            gl.getParameter(gl.MAX_VARYING_VECTORS),
            gl.getSupportedExtensions()?.join(',') || '',
        ].join('|');

        return params;
    } catch {
        return 'webgl-error';
    }
}

// ============ Device Info Collection ============

/**
 * Collect all device fingerprint data
 */
function collectFingerprint(): DeviceFingerprint {
    const nav = navigator as Navigator & {
        deviceMemory?: number;
        msMaxTouchPoints?: number;
    };

    return {
        canvas: getCanvasFingerprint(),
        webgl: getWebGLFingerprint(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: nav.language || nav.languages?.[0] || 'unknown',
        screen: `${screen.width}x${screen.height}x${screen.availWidth}x${screen.availHeight}`,
        hardwareConcurrency: nav.hardwareConcurrency || 0,
        platform: nav.platform || 'unknown',
        userAgent: nav.userAgent || 'unknown',
        touchSupport: 'ontouchstart' in window || nav.maxTouchPoints > 0 || (nav.msMaxTouchPoints ?? 0) > 0,
        colorDepth: screen.colorDepth || 0,
        deviceMemory: nav.deviceMemory || null,
    };
}

/**
 * Convert fingerprint to stable string for hashing
 */
function fingerprintToString(fp: DeviceFingerprint): string {
    return [
        fp.canvas,
        fp.webgl,
        fp.timezone,
        fp.language,
        fp.screen,
        fp.hardwareConcurrency.toString(),
        fp.platform,
        // Note: userAgent excluded from hash as it changes frequently
        fp.touchSupport.toString(),
        fp.colorDepth.toString(),
        (fp.deviceMemory ?? 'null').toString(),
    ].join('::');
}

// ============ Public API ============

/**
 * Generate SHA-256 hash of a string
 */
async function sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Collect device entropy and generate fingerprint hash
 *
 * Returns:
 * - 256-bit entropy (fingerprint + random bytes combined via HKDF)
 * - SHA-256 hash of fingerprint (for device identification)
 *
 * @returns DeviceEntropyResult with entropy, hash, and raw fingerprint
 */
export async function collectDeviceEntropy(): Promise<DeviceEntropyResult> {
    try {
        debugLog('[CRYPTO]', 'Collecting device entropy...');

        // Collect fingerprint
        const fingerprint = collectFingerprint();
        const fingerprintString = fingerprintToString(fingerprint);

        // Generate fingerprint hash (for identification)
        const fingerprintHash = await sha256(fingerprintString);

        // Combine fingerprint with random bytes for entropy
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const fingerprintBytes = new TextEncoder().encode(fingerprintString);

        // Use HKDF to combine fingerprint entropy with random bytes
        const combinedData = new Uint8Array(fingerprintBytes.length + randomBytes.length);
        combinedData.set(fingerprintBytes, 0);
        combinedData.set(randomBytes, fingerprintBytes.length);

        // Import combined data as HKDF key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            combinedData,
            'HKDF',
            false,
            ['deriveBits']
        );

        // Derive 256 bits of entropy
        const entropy = new Uint8Array(
            await crypto.subtle.deriveBits(
                {
                    name: 'HKDF',
                    hash: 'SHA-256',
                    salt: new TextEncoder().encode('stenvault-device-entropy-v1'),
                    info: new TextEncoder().encode('device-seed'),
                },
                keyMaterial,
                256
            )
        );

        debugLog('[CRYPTO]', 'Device entropy collected', {
            fingerprintHashPrefix: fingerprintHash.substring(0, 16) + '...',
            entropyLength: entropy.length,
        });

        return {
            entropy,
            fingerprintHash,
            fingerprint,
        };
    } catch (error) {
        debugError('[CRYPTO]', 'Failed to collect device entropy', error);
        throw new Error('Failed to collect device entropy');
    }
}

/**
 * Get only the device fingerprint hash (for quick identification)
 * This is much faster than full entropy collection
 */
export async function getDeviceFingerprintHash(): Promise<string> {
    try {
        const fingerprint = collectFingerprint();
        const fingerprintString = fingerprintToString(fingerprint);
        return await sha256(fingerprintString);
    } catch (error) {
        debugError('[CRYPTO]', 'Failed to get device fingerprint', error);
        throw new Error('Failed to get device fingerprint');
    }
}

/**
 * Get human-readable device name based on platform and browser
 */
export function getDeviceName(): string {
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Detect browser
    if (ua.includes('Firefox')) {
        browser = 'Firefox';
    } else if (ua.includes('Edg/')) {
        browser = 'Edge';
    } else if (ua.includes('Chrome')) {
        browser = 'Chrome';
    } else if (ua.includes('Safari')) {
        browser = 'Safari';
    }

    // Detect OS (order matters: check specific before generic)
    if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iOS')) {
        os = 'iOS';
    } else if (ua.includes('Android')) {
        os = 'Android';
    } else if (ua.includes('Windows')) {
        os = 'Windows';
    } else if (ua.includes('Mac OS')) {
        os = 'macOS';
    } else if (ua.includes('Linux')) {
        os = 'Linux';
    }

    return `${browser} on ${os}`;
}

/**
 * Get browser info string for logging
 */
export function getBrowserInfo(): string {
    return navigator.userAgent;
}

/**
 * Get device platform identifier
 */
export function getDevicePlatform(): 'web' | 'unknown' {
    // In web context, always return 'web'
    // React Native will have its own implementation
    return 'web';
}
