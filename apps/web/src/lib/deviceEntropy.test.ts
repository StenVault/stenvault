/**
 * Device Entropy Tests
 *
 * Tests for device fingerprinting and entropy collection:
 * - collectDeviceEntropy: full pipeline
 * - getDeviceFingerprintHash: quick ID
 * - getDeviceName: browser/OS detection
 * - getDevicePlatform / getBrowserInfo
 * - Canvas/WebGL fingerprinting
 * - Graceful degradation when APIs unavailable
 *
 * @module deviceEntropy.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/debugLogger', () => ({
    debugLog: vi.fn(),
    debugError: vi.fn(),
}));

import {
    collectDeviceEntropy,
    getDeviceFingerprintHash,
    getDeviceName,
    getBrowserInfo,
    getDevicePlatform,
} from './deviceEntropy';

// ============ Mock Helpers ============

function mockCanvas2D() {
    const ctx = {
        textBaseline: '',
        font: '',
        fillStyle: '',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        createLinearGradient: vi.fn(() => ({
            addColorStop: vi.fn(),
        })),
        beginPath: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
    };

    return {
        width: 0,
        height: 0,
        getContext: vi.fn((type: string) => {
            if (type === '2d') return ctx;
            return null;
        }),
        toDataURL: vi.fn(() => 'data:image/png;base64,mockCanvasData'),
    };
}

function mockWebGLContext() {
    return {
        VERSION: 0x1f02,
        SHADING_LANGUAGE_VERSION: 0x8b8c,
        MAX_TEXTURE_SIZE: 0x0d33,
        MAX_VERTEX_ATTRIBS: 0x8869,
        MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
        MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
        MAX_VARYING_VECTORS: 0x8dfc,
        getExtension: vi.fn(() => ({
            UNMASKED_VENDOR_WEBGL: 0x9245,
            UNMASKED_RENDERER_WEBGL: 0x9246,
        })),
        getParameter: vi.fn((param: number) => {
            const values: Record<number, string> = {
                0x1f02: 'WebGL 1.0',
                0x8b8c: 'WebGL GLSL ES 1.0',
                0x9245: 'Google Inc.',
                0x9246: 'ANGLE (Intel)',
                0x0d33: '16384',
                0x8869: '16',
                0x8dfb: '4096',
                0x8dfd: '1024',
                0x8dfc: '30',
            };
            return values[param] ?? 'unknown';
        }),
        getSupportedExtensions: vi.fn(() => ['OES_texture_float', 'WEBGL_depth_texture']),
    };
}

let originalCreateElement: typeof document.createElement;
let originalNavigator: PropertyDescriptor | undefined;

beforeEach(() => {
    vi.clearAllMocks();
    originalCreateElement = document.createElement.bind(document);

    // Mock document.createElement to intercept canvas creation
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
            const canvas = mockCanvas2D();
            const webglCtx = mockWebGLContext();

            // Override getContext to also handle webgl
            canvas.getContext = vi.fn((type: string) => {
                if (type === '2d') {
                    return {
                        textBaseline: '',
                        font: '',
                        fillStyle: '',
                        fillRect: vi.fn(),
                        fillText: vi.fn(),
                        createLinearGradient: vi.fn(() => ({
                            addColorStop: vi.fn(),
                        })),
                        beginPath: vi.fn(),
                        arc: vi.fn(),
                        closePath: vi.fn(),
                        fill: vi.fn(),
                    };
                }
                if (type === 'webgl' || type === 'experimental-webgl') {
                    // Return an object that passes instanceof WebGLRenderingContext
                    return webglCtx;
                }
                return null;
            }) as any;

            return canvas as any;
        }
        return originalCreateElement(tag);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ============ Tests ============

describe('deviceEntropy', () => {
    describe('collectDeviceEntropy', () => {
        it('returns 32-byte entropy Uint8Array', async () => {
            const result = await collectDeviceEntropy();

            expect(result.entropy).toBeInstanceOf(Uint8Array);
            expect(result.entropy.length).toBe(32);
        });

        it('returns 64-char hex fingerprint hash', async () => {
            const result = await collectDeviceEntropy();

            expect(typeof result.fingerprintHash).toBe('string');
            expect(result.fingerprintHash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('returns fingerprint object with expected fields', async () => {
            const result = await collectDeviceEntropy();

            expect(result.fingerprint).toHaveProperty('canvas');
            expect(result.fingerprint).toHaveProperty('webgl');
            expect(result.fingerprint).toHaveProperty('timezone');
            expect(result.fingerprint).toHaveProperty('language');
            expect(result.fingerprint).toHaveProperty('screen');
            expect(result.fingerprint).toHaveProperty('hardwareConcurrency');
            expect(result.fingerprint).toHaveProperty('platform');
            expect(result.fingerprint).toHaveProperty('userAgent');
            expect(result.fingerprint).toHaveProperty('touchSupport');
            expect(result.fingerprint).toHaveProperty('colorDepth');
            expect(result.fingerprint).toHaveProperty('deviceMemory');
        });

        it('produces different entropy on each call (random component)', async () => {
            const result1 = await collectDeviceEntropy();
            const result2 = await collectDeviceEntropy();

            // Entropy should differ due to crypto.getRandomValues
            const hex1 = Array.from(result1.entropy).map(b => b.toString(16)).join('');
            const hex2 = Array.from(result2.entropy).map(b => b.toString(16)).join('');
            expect(hex1).not.toBe(hex2);
        });

        it('produces same fingerprint hash on repeated calls (deterministic)', async () => {
            const result1 = await collectDeviceEntropy();
            const result2 = await collectDeviceEntropy();

            // Fingerprint hash should be stable (same device environment)
            expect(result1.fingerprintHash).toBe(result2.fingerprintHash);
        });
    });

    describe('getDeviceFingerprintHash', () => {
        it('returns 64-char hex string', async () => {
            const hash = await getDeviceFingerprintHash();

            expect(typeof hash).toBe('string');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('is deterministic for same environment', async () => {
            const hash1 = await getDeviceFingerprintHash();
            const hash2 = await getDeviceFingerprintHash();

            expect(hash1).toBe(hash2);
        });

        it('matches fingerprint hash from collectDeviceEntropy', async () => {
            const fullResult = await collectDeviceEntropy();
            const quickHash = await getDeviceFingerprintHash();

            expect(quickHash).toBe(fullResult.fingerprintHash);
        });
    });

    describe('getDeviceName', () => {
        it('detects Chrome browser', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            expect(getDeviceName()).toBe('Chrome on Windows');
        });

        it('detects Firefox browser', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
            );

            expect(getDeviceName()).toBe('Firefox on Linux');
        });

        it('detects Edge browser', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
            );

            expect(getDeviceName()).toBe('Edge on Windows');
        });

        it('detects Safari on macOS', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
            );

            expect(getDeviceName()).toBe('Safari on macOS');
        });

        it('detects Android UA correctly', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            );

            expect(getDeviceName()).toBe('Chrome on Android');
        });

        it('detects iOS (iPhone) UA correctly', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            );

            expect(getDeviceName()).toBe('Safari on iOS');
        });

        it('detects iPad UA as iOS', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
                'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            );

            expect(getDeviceName()).toBe('Safari on iOS');
        });

        it('returns Unknown for unrecognized user agent', () => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('CustomBot/1.0');

            expect(getDeviceName()).toBe('Unknown Browser on Unknown OS');
        });
    });

    describe('getBrowserInfo', () => {
        it('returns navigator.userAgent string', () => {
            const info = getBrowserInfo();

            expect(typeof info).toBe('string');
            expect(info).toBe(navigator.userAgent);
        });
    });

    describe('getDevicePlatform', () => {
        it('returns web for browser context', () => {
            expect(getDevicePlatform()).toBe('web');
        });
    });

    describe('fingerprint components', () => {
        it('collects timezone', async () => {
            const result = await collectDeviceEntropy();

            expect(typeof result.fingerprint.timezone).toBe('string');
            expect(result.fingerprint.timezone.length).toBeGreaterThan(0);
        });

        it('collects language', async () => {
            const result = await collectDeviceEntropy();

            expect(typeof result.fingerprint.language).toBe('string');
        });

        it('collects screen dimensions', async () => {
            const result = await collectDeviceEntropy();

            expect(result.fingerprint.screen).toMatch(/^\d+x\d+x\d+x\d+$/);
        });

        it('collects hardware concurrency', async () => {
            const result = await collectDeviceEntropy();

            expect(typeof result.fingerprint.hardwareConcurrency).toBe('number');
        });

        it('collects touch support boolean', async () => {
            const result = await collectDeviceEntropy();

            expect(typeof result.fingerprint.touchSupport).toBe('boolean');
        });

        it('collects color depth', async () => {
            const result = await collectDeviceEntropy();

            expect(typeof result.fingerprint.colorDepth).toBe('number');
        });
    });

    describe('graceful degradation', () => {
        it('returns canvas-error when getContext returns null', async () => {
            vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
                if (tag === 'canvas') {
                    return {
                        width: 0,
                        height: 0,
                        getContext: vi.fn(() => null),
                        toDataURL: vi.fn(() => ''),
                    } as any;
                }
                return originalCreateElement(tag);
            });

            const result = await collectDeviceEntropy();

            // Should still complete without throwing
            expect(result.entropy.length).toBe(32);
            // Canvas fingerprint should be the fallback value
            expect(result.fingerprint.canvas).toBe('no-canvas');
        });

        it('handles WebGL not available', async () => {
            vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
                if (tag === 'canvas') {
                    const canvas2d = mockCanvas2D();
                    canvas2d.getContext = vi.fn((type: string) => {
                        if (type === '2d') {
                            return {
                                textBaseline: '',
                                font: '',
                                fillStyle: '',
                                fillRect: vi.fn(),
                                fillText: vi.fn(),
                                createLinearGradient: vi.fn(() => ({
                                    addColorStop: vi.fn(),
                                })),
                                beginPath: vi.fn(),
                                arc: vi.fn(),
                                closePath: vi.fn(),
                                fill: vi.fn(),
                            };
                        }
                        // No WebGL support
                        return null;
                    }) as any;
                    return canvas2d as any;
                }
                return originalCreateElement(tag);
            });

            const result = await collectDeviceEntropy();

            expect(result.entropy.length).toBe(32);
            expect(result.fingerprint.webgl).toBe('no-webgl');
        });
    });
});
