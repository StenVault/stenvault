/**
 * Web Shamir Recovery Provider Tests
 *
 * Tests Shamir secret sharing recovery system:
 * - Split secret into N shares
 * - Combine K shares to reconstruct secret
 * - Input validation (key size, threshold, limits)
 * - Share encoding/decoding round-trip
 * - HMAC generation (local integrity check)
 * - High-level: prepareRecoveryShares, recoverMasterKey
 * - QR code data generation/parsing
 * - validateRecoveryShares
 */

import { describe, it, expect } from 'vitest';
import {
    getWebShamirRecoveryProvider,
    prepareRecoveryShares,
    recoverMasterKey,
    validateRecoveryShares,
    generateExternalShareQR,
    parseExternalShareQR,
} from './webShamirRecoveryProvider';

describe('WebShamirRecoveryProvider', () => {
    const provider = getWebShamirRecoveryProvider();


    describe('isAvailable', () => {
        it('should return true (WebCrypto available in test env)', async () => {
            expect(await provider.isAvailable()).toBe(true);
        });
    });


    describe('splitSecret', () => {
        it('should split 32-byte key into N shares', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            const shares = await provider.splitSecret(key, 5, 3);

            expect(shares.length).toBe(5);
            for (const share of shares) {
                expect(share.index).toBeGreaterThanOrEqual(1);
                expect(share.data).toBeInstanceOf(Uint8Array);
                expect(share.data.length).toBe(32);
            }
        });

        it('should reject non-32-byte key', async () => {
            const key = new Uint8Array(16);
            await expect(provider.splitSecret(key, 3, 2)).rejects.toThrow('32 bytes');
        });

        it('should reject threshold < 2', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            await expect(provider.splitSecret(key, 3, 1)).rejects.toThrow('at least 2');
        });

        it('should reject threshold > totalShares', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            await expect(provider.splitSecret(key, 3, 4)).rejects.toThrow('greater than');
        });

        it('should reject > 255 shares', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            await expect(provider.splitSecret(key, 256, 2)).rejects.toThrow('255');
        });
    });


    describe('combineShares', () => {
        it('should reconstruct secret from threshold shares', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            const shares = await provider.splitSecret(key, 5, 3);

            // Use only 3 of 5 shares
            const recovered = await provider.combineShares(shares.slice(0, 3));
            expect(recovered).toEqual(key);
        });

        it('should reconstruct from any subset of threshold shares', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            const shares = await provider.splitSecret(key, 5, 3);

            // Use shares [1, 3, 4] (skipping 0, 2)
            const subset = [shares[1]!, shares[3]!, shares[4]!];
            const recovered = await provider.combineShares(subset);
            expect(recovered).toEqual(key);
        });

        it('should reject fewer than 2 shares', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            const shares = await provider.splitSecret(key, 3, 2);

            await expect(provider.combineShares([shares[0]!])).rejects.toThrow('2 shares');
        });
    });


    describe('encode/decode share', () => {
        it('should round-trip encode → decode', async () => {
            const key = crypto.getRandomValues(new Uint8Array(32));
            const shares = await provider.splitSecret(key, 3, 2);

            const encoded = {
                index: shares[0]!.index,
                data: btoa(String.fromCharCode(...shares[0]!.data)),
                threshold: 2,
                totalShares: 3,
            };

            const shareString = provider.encodeShareAsString(encoded);
            expect(shareString).toMatch(/^shamir:v1:/);

            const decoded = provider.decodeShareFromString(shareString);
            expect(decoded.index).toBe(encoded.index);
            expect(decoded.threshold).toBe(2);
            expect(decoded.totalShares).toBe(3);
        });
    });


    describe('generateShareHmac', () => {
        it('should return hex HMAC string', async () => {
            const share = {
                index: 1,
                data: btoa('test'),
                threshold: 2,
                totalShares: 3,
            };

            const hmac = await provider.generateShareHmac(share, 'config-123');
            expect(typeof hmac).toBe('string');
            expect(hmac).toMatch(/^[a-f0-9]{64}$/); // SHA-256 = 64 hex chars
        });

        it('should produce different HMACs for different configIds', async () => {
            const share = {
                index: 1,
                data: btoa('test'),
                threshold: 2,
                totalShares: 3,
            };

            const hmac1 = await provider.generateShareHmac(share, 'config-a');
            const hmac2 = await provider.generateShareHmac(share, 'config-b');
            expect(hmac1).not.toBe(hmac2);
        });

        it('should be deterministic', async () => {
            const share = {
                index: 1,
                data: btoa('stable'),
                threshold: 2,
                totalShares: 3,
            };

            const hmac1 = await provider.generateShareHmac(share, 'cfg');
            const hmac2 = await provider.generateShareHmac(share, 'cfg');
            expect(hmac1).toBe(hmac2);
        });
    });
});


describe('prepareRecoveryShares', () => {
    it('should return shares with HMACs', async () => {
        const key = crypto.getRandomValues(new Uint8Array(32));
        const { shares } = await prepareRecoveryShares(key, 5, 3, 'config-test');

        expect(shares.length).toBe(5);
        for (const share of shares) {
            expect(share.index).toBeGreaterThanOrEqual(1);
            expect(typeof share.data).toBe('string');
            expect(share.threshold).toBe(3);
            expect(share.totalShares).toBe(5);
            expect(share.hmac).toMatch(/^[a-f0-9]{64}$/);
        }
    });
});

describe('recoverMasterKey', () => {
    it('should recover key from prepared shares', async () => {
        const originalKey = crypto.getRandomValues(new Uint8Array(32));
        const { shares } = await prepareRecoveryShares(originalKey, 5, 3, 'cfg');

        // Use 3 of 5 shares
        const collectedShares = shares.slice(0, 3).map(s => ({
            index: s.index,
            data: s.data,
        }));

        const recovered = await recoverMasterKey(collectedShares);
        expect(recovered).toEqual(originalKey);
    });
});

describe('validateRecoveryShares', () => {
    it('should return valid for consistent shares', async () => {
        const key = crypto.getRandomValues(new Uint8Array(32));
        const { shares } = await prepareRecoveryShares(key, 3, 2, 'cfg');

        const result = validateRecoveryShares(shares);
        expect(result.valid).toBe(true);
    });
});


describe('QR code generation/parsing', () => {
    it('should generate and parse QR data', async () => {
        const key = crypto.getRandomValues(new Uint8Array(32));
        const { shares } = await prepareRecoveryShares(key, 3, 2, 'cfg-qr');

        const share = shares[0]!;
        const { shareString, qrData } = await generateExternalShareQR(share, 'cfg-qr');

        expect(shareString).toMatch(/^shamir:v1:/);
        expect(qrData).toContain('|');

        const parsed = await parseExternalShareQR(qrData, 'cfg-qr');
        expect(parsed.valid).toBe(true);
        expect(parsed.share).toBeDefined();
        expect(parsed.share!.index).toBe(share.index);
    });

    it('should reject invalid QR format', async () => {
        const result = await parseExternalShareQR('not-a-valid-qr', 'cfg');
        expect(result.valid).toBe(false);
    });

    it('should reject tampered HMAC', async () => {
        const key = crypto.getRandomValues(new Uint8Array(32));
        const { shares } = await prepareRecoveryShares(key, 3, 2, 'cfg-tamper');

        const { qrData } = await generateExternalShareQR(shares[0]!, 'cfg-tamper');

        // Replace last hex char to tamper the HMAC
        const tampered = qrData.slice(0, -1) + (qrData.endsWith('0') ? '1' : '0');
        const result = await parseExternalShareQR(tampered, 'cfg-tamper');
        expect(result.valid).toBe(false);
    });
});
