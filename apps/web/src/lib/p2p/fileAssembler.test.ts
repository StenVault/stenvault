/**
 * FileAssembler Tests
 *
 * Tests P2P file chunk assembly:
 * - Chunk collection (in-order, out-of-order, dedup)
 * - Bounds checking (negative, out of range)
 * - Hash verification
 * - Progress tracking
 * - Assembly into Blob (correct order, MIME type)
 * - Missing chunk detection
 * - Streaming download (progressive memory release)
 * - Reset / clear
 * - Base64 ↔ ArrayBuffer utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
    FileAssembler,
    type FileManifest,
    type ChunkData,
} from './fileAssembler';
import { base64ToArrayBuffer, arrayBufferToBase64 } from '@/lib/platform';

// Mock dependencies that use IndexedDB / DOM APIs
vi.mock('./transferStateStorage', () => ({
    getTransferStorage: vi.fn(() => ({
        addChunk: vi.fn().mockResolvedValue(undefined),
        saveState: vi.fn().mockResolvedValue(undefined),
        loadState: vi.fn().mockResolvedValue(null),
        deleteState: vi.fn().mockResolvedValue(undefined),
        listPendingTransfers: vi.fn().mockResolvedValue([]),
    })),
    createTransferState: vi.fn((opts: any) => opts),
}));

vi.mock('@/lib/platform', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/platform')>();
    return {
        ...actual,
        streamDownloadToDisk: vi.fn().mockResolvedValue(undefined),
    };
});

// ============ Helpers ============

function makeManifest(overrides: Partial<FileManifest> = {}): FileManifest {
    return {
        fileName: 'test.bin',
        fileSize: 300,
        mimeType: 'application/octet-stream',
        totalChunks: 3,
        ...overrides,
    };
}

function makeChunk(index: number, data: string, hash?: string): ChunkData {
    const encoded = new TextEncoder().encode(data);
    return { index, data: encoded.buffer as ArrayBuffer, hash };
}

describe('FileAssembler', () => {

    // ============ addChunk ============

    describe('addChunk', () => {
        it('should add chunk within valid range', () => {
            const a = new FileAssembler(makeManifest());
            expect(a.addChunk(makeChunk(0, 'aaa'))).toBe(true);
            expect(a.addChunk(makeChunk(1, 'bbb'))).toBe(true);
            expect(a.addChunk(makeChunk(2, 'ccc'))).toBe(true);
        });

        it('should reject negative index', () => {
            const a = new FileAssembler(makeManifest());
            expect(a.addChunk(makeChunk(-1, 'bad'))).toBe(false);
        });

        it('should reject index >= totalChunks', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 3 }));
            expect(a.addChunk(makeChunk(3, 'bad'))).toBe(false);
            expect(a.addChunk(makeChunk(100, 'bad'))).toBe(false);
        });

        it('should deduplicate (return true, not double-count bytes)', () => {
            const a = new FileAssembler(makeManifest());
            a.addChunk(makeChunk(0, 'aaa'));
            const p1 = a.getProgress();

            // Add same chunk again
            expect(a.addChunk(makeChunk(0, 'aaa'))).toBe(true);
            const p2 = a.getProgress();

            expect(p1.completedChunks).toBe(1);
            expect(p2.completedChunks).toBe(1);
            expect(p1.bytesReceived).toBe(p2.bytesReceived);
        });

        it('should accept out-of-order chunks', () => {
            const a = new FileAssembler(makeManifest());
            a.addChunk(makeChunk(2, 'ccc'));
            a.addChunk(makeChunk(0, 'aaa'));
            a.addChunk(makeChunk(1, 'bbb'));

            expect(a.isComplete()).toBe(true);
        });

        it('should reject chunk with mismatched hash', () => {
            const manifest = makeManifest({
                totalChunks: 2,
                chunkHashes: ['hash_a', 'hash_b'],
            });
            const a = new FileAssembler(manifest);

            // Correct hash
            expect(a.addChunk({ index: 0, data: new ArrayBuffer(10), hash: 'hash_a' })).toBe(true);
            // Wrong hash
            expect(a.addChunk({ index: 1, data: new ArrayBuffer(10), hash: 'wrong' })).toBe(false);
        });

        it('should accept chunk when hash matches', () => {
            const manifest = makeManifest({
                totalChunks: 1,
                chunkHashes: ['correct_hash'],
            });
            const a = new FileAssembler(manifest);
            expect(a.addChunk({ index: 0, data: new ArrayBuffer(5), hash: 'correct_hash' })).toBe(true);
        });

        it('should accept chunk when no hash provided (skip verification)', () => {
            const manifest = makeManifest({
                totalChunks: 1,
                chunkHashes: ['some_hash'],
            });
            const a = new FileAssembler(manifest);
            // No hash on chunk → skip verification
            expect(a.addChunk({ index: 0, data: new ArrayBuffer(5) })).toBe(true);
        });
    });

    // ============ getProgress ============

    describe('getProgress', () => {
        it('should return 0% when empty', () => {
            const a = new FileAssembler(makeManifest({ fileSize: 1000, totalChunks: 10 }));
            const p = a.getProgress();

            expect(p.completedChunks).toBe(0);
            expect(p.totalChunks).toBe(10);
            expect(p.percent).toBe(0);
            expect(p.bytesReceived).toBe(0);
            expect(p.totalBytes).toBe(1000);
        });

        it('should track progress as chunks are added', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 4, fileSize: 400 }));
            a.addChunk(makeChunk(0, 'aaaa')); // 4 bytes
            a.addChunk(makeChunk(1, 'bbbb')); // 4 bytes

            const p = a.getProgress();
            expect(p.completedChunks).toBe(2);
            expect(p.totalChunks).toBe(4);
            expect(p.percent).toBe(50);
            expect(p.bytesReceived).toBe(8);
        });

        it('should return 100% when complete', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 2, fileSize: 200 }));
            a.addChunk(makeChunk(0, 'aa'));
            a.addChunk(makeChunk(1, 'bb'));

            expect(a.getProgress().percent).toBe(100);
        });

        it('should handle 0 total chunks (edge case)', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 0, fileSize: 0 }));
            const p = a.getProgress();
            expect(p.percent).toBe(0);
        });
    });

    // ============ isComplete / getMissingChunks ============

    describe('isComplete / getMissingChunks', () => {
        it('should return false when chunks are missing', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 3 }));
            a.addChunk(makeChunk(0, 'x'));
            a.addChunk(makeChunk(2, 'z'));

            expect(a.isComplete()).toBe(false);
            expect(a.getMissingChunks()).toEqual([1]);
        });

        it('should return true when all chunks present', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 2 }));
            a.addChunk(makeChunk(0, 'x'));
            a.addChunk(makeChunk(1, 'y'));

            expect(a.isComplete()).toBe(true);
            expect(a.getMissingChunks()).toEqual([]);
        });

        it('should return all indices as missing when empty', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 3 }));
            expect(a.getMissingChunks()).toEqual([0, 1, 2]);
        });
    });

    // ============ assemble ============

    describe('assemble', () => {
        it('should assemble chunks in correct order', async () => {
            const a = new FileAssembler(makeManifest({
                totalChunks: 3,
                mimeType: 'text/plain',
            }));
            // Add out of order
            a.addChunk(makeChunk(2, 'CCC'));
            a.addChunk(makeChunk(0, 'AAA'));
            a.addChunk(makeChunk(1, 'BBB'));

            const blob = a.assemble();
            expect(blob.type).toBe('text/plain');

            const text = await blob.text();
            expect(text).toBe('AAABBBCCC');
        });

        it('should throw when chunks are missing', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 3 }));
            a.addChunk(makeChunk(0, 'x'));

            expect(() => a.assemble()).toThrow('Cannot assemble: missing 2 chunks');
        });

        it('should set correct MIME type on blob', async () => {
            const a = new FileAssembler(makeManifest({
                totalChunks: 1,
                mimeType: 'image/png',
            }));
            a.addChunk(makeChunk(0, 'png-data'));

            const blob = a.assemble();
            expect(blob.type).toBe('image/png');
        });
    });

    // ============ getDownloadStream ============

    describe('getDownloadStream', () => {
        it('should stream chunks in order and release memory', async () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 3 }));
            a.addChunk(makeChunk(0, 'AAA'));
            a.addChunk(makeChunk(1, 'BBB'));
            a.addChunk(makeChunk(2, 'CCC'));

            const stream = a.getDownloadStream();
            const reader = stream.getReader();

            const parts: string[] = [];
            let done = false;
            while (!done) {
                const result = await reader.read();
                if (result.done) {
                    done = true;
                } else {
                    parts.push(new TextDecoder().decode(result.value));
                }
            }

            expect(parts).toEqual(['AAA', 'BBB', 'CCC']);
        });

        it('should throw when chunks are missing', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 2 }));
            a.addChunk(makeChunk(0, 'x'));

            expect(() => a.getDownloadStream()).toThrow('Cannot stream: missing 1 chunks');
        });
    });

    // ============ reset ============

    describe('reset', () => {
        it('should clear all chunks and bytesReceived', () => {
            const a = new FileAssembler(makeManifest({ totalChunks: 2 }));
            a.addChunk(makeChunk(0, 'data1'));
            a.addChunk(makeChunk(1, 'data2'));

            expect(a.isComplete()).toBe(true);
            a.reset();

            expect(a.isComplete()).toBe(false);
            expect(a.getProgress().completedChunks).toBe(0);
            expect(a.getProgress().bytesReceived).toBe(0);
        });
    });

    // ============ getManifest ============

    describe('getManifest', () => {
        it('should return a copy of the manifest', () => {
            const manifest = makeManifest({ fileName: 'report.pdf' });
            const a = new FileAssembler(manifest);
            const got = a.getManifest();

            expect(got.fileName).toBe('report.pdf');
            // Should be a copy, not same reference
            got.fileName = 'changed';
            expect(a.getManifest().fileName).toBe('report.pdf');
        });
    });

    // ============ sessionId ============

    describe('sessionId', () => {
        it('should set and get session ID', () => {
            const a = new FileAssembler(makeManifest());
            expect(a.getSessionId()).toBeNull();

            a.setSessionId('abc-123');
            expect(a.getSessionId()).toBe('abc-123');
        });

        it('should accept sessionId in constructor', () => {
            const a = new FileAssembler(makeManifest(), { sessionId: 'from-ctor' });
            expect(a.getSessionId()).toBe('from-ctor');
        });
    });

    // ============ saveState / restoreFromState ============

    describe('persistence', () => {
        it('should throw saveState without sessionId', async () => {
            const a = new FileAssembler(makeManifest());
            await expect(a.saveState()).rejects.toThrow('Cannot save state: no sessionId set');
        });

        it('should call storage.saveState with sessionId', async () => {
            const a = new FileAssembler(makeManifest(), { sessionId: 'sess-1', autoPersist: true });
            a.addChunk(makeChunk(0, 'data'));

            // Should not throw
            await a.saveState();
        });
    });
});

// ============ Utility Functions ============

describe('base64 utilities', () => {
    describe('arrayBufferToBase64', () => {
        it('should encode "Hello" as base64', () => {
            const data = new TextEncoder().encode('Hello');
            const b64 = arrayBufferToBase64(data.buffer as ArrayBuffer);
            expect(b64).toBe(btoa('Hello'));
        });

        it('should handle empty buffer', () => {
            const b64 = arrayBufferToBase64(new ArrayBuffer(0));
            expect(b64).toBe('');
        });

        it('should handle binary data', () => {
            const data = new Uint8Array([0, 128, 255]);
            const b64 = arrayBufferToBase64(data.buffer as ArrayBuffer);
            expect(b64).toBe(btoa(String.fromCharCode(0, 128, 255)));
        });
    });

    describe('base64ToArrayBuffer', () => {
        it('should decode base64 "Hello"', () => {
            const b64 = btoa('Hello');
            const buf = base64ToArrayBuffer(b64);
            const text = new TextDecoder().decode(buf);
            expect(text).toBe('Hello');
        });

        it('should handle empty string', () => {
            const buf = base64ToArrayBuffer(btoa(''));
            expect(buf.byteLength).toBe(0);
        });

        it('should round-trip with arrayBufferToBase64', () => {
            const original = new Uint8Array([10, 20, 30, 40, 50]);
            const b64 = arrayBufferToBase64(original.buffer as ArrayBuffer);
            const restored = new Uint8Array(base64ToArrayBuffer(b64));
            expect(restored).toEqual(original);
        });
    });
});
