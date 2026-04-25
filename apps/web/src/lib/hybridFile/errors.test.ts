/**
 * hybridFile — VaultError contract tests.
 *
 * One test per migrated throw site, asserting the resulting VaultError
 * carries the expected `code` + `context`. Real crypto (no mocks) except
 * for `extractV4FileKey` network tests which stub `global.fetch`.
 *
 * Existing cryptoRoundtrip tests still exercise the byte-level roundtrip;
 * these tests are only about the error-contract boundary.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { VaultError } from '@stenvault/shared/errors';
import {
    encryptFileHybrid,
    decryptFileHybrid,
    decryptChunked,
    decryptFileHybridFromUrl,
    extractV4FileKey,
    verifyChunkManifest,
    deriveManifestHmacKey,
} from './index';
import { getHybridKemProvider } from '@/lib/platform/webHybridKemProvider';
import { getHybridSignatureProvider } from '@/lib/platform/webHybridSignatureProvider';
import { parseCVEFHeader, deriveChunkIV } from '@stenvault/shared/platform/crypto';
import { importFileKey } from './helpers';

function randomBytes(n: number): Uint8Array {
    const result = new Uint8Array(n);
    for (let offset = 0; offset < n; offset += 65536) {
        const chunk = Math.min(65536, n - offset);
        crypto.getRandomValues(result.subarray(offset, offset + chunk));
    }
    return result;
}

function createMockFile(content: Uint8Array, name: string): File {
    const buf = new ArrayBuffer(content.byteLength);
    new Uint8Array(buf).set(content);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    return Object.assign(blob, { name, lastModified: Date.now() }) as unknown as File;
}

let hybridKem: ReturnType<typeof getHybridKemProvider>;
let available: boolean;

beforeAll(async () => {
    hybridKem = getHybridKemProvider();
    available = await hybridKem.isAvailable();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('hybridFile — VaultError contract', () => {
    it('tampered body ciphertext → FILE_CORRUPT(body_decrypt)', async () => {
        if (!available) return;
        const keyPair = await hybridKem.generateKeyPair();
        const plaintext = randomBytes(4096); // small → single-pass path
        const file = createMockFile(plaintext, 'body.bin');

        const { blob } = await encryptFileHybrid(file, { publicKey: keyPair.publicKey });
        const data = new Uint8Array(await blob.arrayBuffer());

        const { dataOffset } = parseCVEFHeader(data);
        const tampered = new Uint8Array(data.length);
        tampered.set(data);
        tampered[dataOffset + 10]! ^= 0xFF;

        const err = await decryptFileHybrid(tampered.buffer as ArrayBuffer, {
            secretKey: keyPair.secretKey,
        }).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('FILE_CORRUPT');
        expect((err as VaultError).context.layer).toBe('body_decrypt');
    });

    it('tampered chunk ciphertext → FILE_CORRUPT(chunk_decrypt)', async () => {
        // Build one AES-GCM chunk manually and tamper it. Avoids the streaming
        // ReadableStream path (which wraps errors) and targets decryptChunked's
        // catch block directly.
        const fileKeyBytes = randomBytes(32);
        const fileKey = await importFileKey(fileKeyBytes);
        const baseIv = randomBytes(12);
        const chunkIv = deriveChunkIV(baseIv, 0);
        const chunkPlaintext = randomBytes(128);

        const chunkCiphertext = new Uint8Array(
            await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: chunkIv.buffer as ArrayBuffer },
                fileKey,
                chunkPlaintext.buffer as ArrayBuffer,
            ),
        );

        // Length-prefix framing: 4-byte BE length, then ciphertext bytes.
        const framed = new Uint8Array(4 + chunkCiphertext.length);
        new DataView(framed.buffer).setUint32(0, chunkCiphertext.length, false);
        framed.set(chunkCiphertext, 4);
        framed[10] = framed[10]! ^ 0xFF;

        const err = await decryptChunked(framed, fileKey, baseIv, 1)
            .catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('FILE_CORRUPT');
        expect((err as VaultError).context.layer).toBe('chunk_decrypt');
        expect((err as VaultError).context.chunkIndex).toBe(0);
    });

    it('signed file without signerPublicKey → SIGNATURE_INVALID(signer_key_missing)', async () => {
        if (!available) return;
        const keyPair = await hybridKem.generateKeyPair();
        const sigKeyPair = await getHybridSignatureProvider().generateKeyPair();
        const file = createMockFile(randomBytes(512), 'signed.bin');

        const { blob } = await encryptFileHybrid(file, {
            publicKey: keyPair.publicKey,
            signing: {
                secretKey: sigKeyPair.secretKey,
                fingerprint: 'fp',
                keyVersion: 1,
            },
        });

        const err = await decryptFileHybrid(await blob.arrayBuffer(), {
            secretKey: keyPair.secretKey,
        }).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('SIGNATURE_INVALID');
        expect((err as VaultError).context.reason).toBe('signer_key_missing');
    });

    it('signed file with wrong signerPublicKey → SIGNATURE_INVALID(v1.4)', async () => {
        if (!available) return;
        const keyPair = await hybridKem.generateKeyPair();
        const sigKeyPair = await getHybridSignatureProvider().generateKeyPair();
        const otherSigKeyPair = await getHybridSignatureProvider().generateKeyPair();
        const file = createMockFile(randomBytes(512), 'signed.bin');

        const { blob } = await encryptFileHybrid(file, {
            publicKey: keyPair.publicKey,
            signing: {
                secretKey: sigKeyPair.secretKey,
                fingerprint: 'fp',
                keyVersion: 1,
            },
        });

        const err = await decryptFileHybrid(await blob.arrayBuffer(), {
            secretKey: keyPair.secretKey,
            signerPublicKey: otherSigKeyPair.publicKey,
        }).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('SIGNATURE_INVALID');
        expect((err as VaultError).context.layer).toBe('v1.4');
    });

    it('verifyChunkManifest with wrong stored count → INTEGRITY_FAILED(chunk_count)', async () => {
        // Encrypt a manifest whose stored count does not match the count
        // the verifier will be told to check against. AES-GCM must succeed
        // first, so the IV is derived from the verifier-side count.
        const fileKeyBytes = randomBytes(32);
        const fileKey = await importFileKey(fileKeyBytes);
        const hmacKey = await deriveManifestHmacKey(fileKeyBytes);
        const baseIv = randomBytes(12);

        const suppliedChunkCount = 4;
        const storedCount = 3;

        const manifestPlaintext = new Uint8Array(36);
        new DataView(manifestPlaintext.buffer).setUint32(32, storedCount, false);

        const manifestIv = deriveChunkIV(baseIv, suppliedChunkCount);
        const manifestCiphertext = new Uint8Array(
            await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: manifestIv.buffer as ArrayBuffer },
                fileKey,
                manifestPlaintext.buffer as ArrayBuffer,
            ),
        );

        const err = await verifyChunkManifest(
            manifestCiphertext, fileKey, hmacKey, baseIv,
            suppliedChunkCount, [],
        ).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INTEGRITY_FAILED');
        expect((err as VaultError).context.layer).toBe('chunk_count');
        expect((err as VaultError).context.expected).toBe(suppliedChunkCount);
        expect((err as VaultError).context.stored).toBe(storedCount);
    });

    it('verifyChunkManifest on tampered manifest ciphertext → FILE_CORRUPT(manifest_decrypt)', async () => {
        const fileKeyBytes = randomBytes(32);
        const fileKey = await importFileKey(fileKeyBytes);
        const hmacKey = await deriveManifestHmacKey(fileKeyBytes);
        const baseIv = randomBytes(12);

        // Random ciphertext bytes will fail AES-GCM auth tag verification.
        const bogus = randomBytes(64);

        const err = await verifyChunkManifest(
            bogus, fileKey, hmacKey, baseIv, 1, [],
        ).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('FILE_CORRUPT');
        expect((err as VaultError).context.layer).toBe('manifest_decrypt');
    });

    it('decryptFileHybridFromUrl on 404 → INFRA_NETWORK(fetch_encrypted_file)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }));

        const secretKey = {
            classical: new Uint8Array(32),
            postQuantum: new Uint8Array(2400),
        };
        const err = await decryptFileHybridFromUrl(
            'https://example.com/gone.enc',
            { secretKey },
            'application/octet-stream',
        ).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_NETWORK');
        expect((err as VaultError).context.op).toBe('fetch_encrypted_file');
        expect((err as VaultError).context.status).toBe(404);
    });

    it('extractV4FileKey on 500 → INFRA_NETWORK(extract_key)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            body: null,
        }));

        const secretKey = {
            classical: new Uint8Array(32),
            postQuantum: new Uint8Array(2400),
        };
        const err = await extractV4FileKey(
            'https://example.com/500.enc',
            secretKey,
        ).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_NETWORK');
        expect((err as VaultError).context.op).toBe('extract_key');
        expect((err as VaultError).context.status).toBe(500);
    });

    it('extractV4FileKey on null body → INFRA_NETWORK(null_body)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: null,
        }));

        const secretKey = {
            classical: new Uint8Array(32),
            postQuantum: new Uint8Array(2400),
        };
        const err = await extractV4FileKey(
            'https://example.com/ok-but-no-body.enc',
            secretKey,
        ).catch((e: unknown) => e);

        expect(VaultError.isVaultError(err)).toBe(true);
        expect((err as VaultError).code).toBe('INFRA_NETWORK');
        expect((err as VaultError).context.op).toBe('extract_key');
        expect((err as VaultError).context.reason).toBe('null_body');
    });
});
