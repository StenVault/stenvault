/**
 * P2P Types Tests
 *
 * Tests for P2P type definitions, type guards, and constants.
 */

import { describe, it, expect } from 'vitest';
import {
  isP2PMessage,
  DEFAULT_ICE_SERVERS,
  type P2PManifestMessage,
  type P2PChunkRequestMessage,
  type P2PChunkResponseMessage,
  type P2PTransferCompleteMessage,
  type P2PErrorMessage,
  type P2PProtocolMessage,
  type ChunkedFileManifest,
  type SignalingChannel,
} from './types';
import {
  CHUNKED_THRESHOLD,
  SIGNAL_POLL_INTERVAL_MS,
  BACKEND_FAIL_THRESHOLD,
  SESSION_NOT_FOUND_THRESHOLD,
  ICE_GATHERING_TIMEOUT_MS,
  DATA_CHANNEL_BUFFER_THRESHOLD,
  INITIAL_TRANSFER_STATE,
} from './constants';

describe('P2P Types', () => {
  describe('isP2PMessage type guard', () => {
    it('should return true for valid manifest message', () => {
      const msg: P2PManifestMessage = {
        type: 'manifest',
        protocol: 'chunked',
        fileName: 'test.txt',
      };

      expect(isP2PMessage(msg)).toBe(true);
    });

    it('should return true for valid chunk request message', () => {
      const msg: P2PChunkRequestMessage = {
        type: 'chunk_request',
        chunkIndex: 0,
      };

      expect(isP2PMessage(msg)).toBe(true);
    });

    it('should return true for valid chunk response message', () => {
      const msg: P2PChunkResponseMessage = {
        type: 'chunk_response',
        chunkIndex: 0,
        data: 'base64data',
      };

      expect(isP2PMessage(msg)).toBe(true);
    });

    it('should return true for valid transfer complete message', () => {
      const msg: P2PTransferCompleteMessage = {
        type: 'transfer_complete',
      };

      expect(isP2PMessage(msg)).toBe(true);
    });

    it('should return true for valid error message', () => {
      const msg: P2PErrorMessage = {
        type: 'error',
        message: 'Something went wrong',
        code: 'ERR_TRANSFER',
      };

      expect(isP2PMessage(msg)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isP2PMessage(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isP2PMessage(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isP2PMessage('string')).toBe(false);
      expect(isP2PMessage(123)).toBe(false);
      expect(isP2PMessage(true)).toBe(false);
    });

    it('should return false for object without type property', () => {
      expect(isP2PMessage({ data: 'test' })).toBe(false);
    });

    it('should return false for object with non-string type', () => {
      expect(isP2PMessage({ type: 123 })).toBe(false);
      expect(isP2PMessage({ type: null })).toBe(false);
      expect(isP2PMessage({ type: ['manifest'] })).toBe(false);
    });

    it('should return true for any object with string type property', () => {
      expect(isP2PMessage({ type: 'unknown_type' })).toBe(true);
    });
  });

  describe('DEFAULT_ICE_SERVERS', () => {
    it('should contain STUN servers', () => {
      expect(DEFAULT_ICE_SERVERS.length).toBeGreaterThan(0);
    });

    it('should have valid STUN URL format', () => {
      for (const server of DEFAULT_ICE_SERVERS) {
        expect(server.urls).toMatch(/^stun:/);
      }
    });

    it('should include Google STUN servers', () => {
      const hasGoogleStun = DEFAULT_ICE_SERVERS.some((server) =>
        server.urls.includes('google.com')
      );
      expect(hasGoogleStun).toBe(true);
    });
  });

  describe('ChunkedFileManifest type', () => {
    it('should allow creating a valid manifest', () => {
      const manifest: ChunkedFileManifest = {
        fileName: 'large-file.zip',
        fileSize: 1024 * 1024 * 500, // 500MB
        mimeType: 'application/zip',
        chunkSize: 64 * 1024, // 64KB
        totalChunks: 8192,
        chunkHashes: ['hash1', 'hash2'],
        fileHash: 'file-hash-sha256',
      };

      expect(manifest.fileName).toBe('large-file.zip');
      expect(manifest.totalChunks).toBe(8192);
    });
  });

  describe('SignalingChannel type', () => {
    it('should allow valid channel types', () => {
      const channels: SignalingChannel[] = ['backend', 'trystero', 'both', 'none'];

      expect(channels).toHaveLength(4);
      expect(channels).toContain('backend');
      expect(channels).toContain('trystero');
      expect(channels).toContain('both');
      expect(channels).toContain('none');
    });
  });
});

describe('P2P Constants', () => {
  describe('CHUNKED_THRESHOLD', () => {
    it('should be 100MB', () => {
      expect(CHUNKED_THRESHOLD).toBe(100 * 1024 * 1024);
    });

    it('should be greater than zero', () => {
      expect(CHUNKED_THRESHOLD).toBeGreaterThan(0);
    });
  });

  describe('Timing constants', () => {
    it('should have reasonable poll interval', () => {
      expect(SIGNAL_POLL_INTERVAL_MS).toBeGreaterThan(0);
      expect(SIGNAL_POLL_INTERVAL_MS).toBeLessThanOrEqual(5000);
    });

    it('should have backend fail threshold', () => {
      expect(BACKEND_FAIL_THRESHOLD).toBeGreaterThan(0);
    });

    it('should have session not found threshold', () => {
      expect(SESSION_NOT_FOUND_THRESHOLD).toBeGreaterThan(0);
    });

    it('should have ICE gathering timeout', () => {
      expect(ICE_GATHERING_TIMEOUT_MS).toBeGreaterThan(0);
      expect(ICE_GATHERING_TIMEOUT_MS).toBeLessThanOrEqual(30000);
    });
  });

  describe('DATA_CHANNEL_BUFFER_THRESHOLD', () => {
    it('should be 16MB', () => {
      expect(DATA_CHANNEL_BUFFER_THRESHOLD).toBe(16 * 1024 * 1024);
    });
  });

  describe('INITIAL_TRANSFER_STATE', () => {
    it('should have idle status', () => {
      expect(INITIAL_TRANSFER_STATE.status).toBe('idle');
    });

    it('should have zero progress', () => {
      expect(INITIAL_TRANSFER_STATE.progress).toBe(0);
    });

    it('should have zero bytes transferred', () => {
      expect(INITIAL_TRANSFER_STATE.bytesTransferred).toBe(0);
    });

    it('should have zero total bytes', () => {
      expect(INITIAL_TRANSFER_STATE.totalBytes).toBe(0);
    });

    it('should have zero speed', () => {
      expect(INITIAL_TRANSFER_STATE.speed).toBe(0);
    });

    it('should have zero estimated time remaining', () => {
      expect(INITIAL_TRANSFER_STATE.estimatedTimeRemaining).toBe(0);
    });

    it('should not be encrypted by default', () => {
      expect(INITIAL_TRANSFER_STATE.isEncrypted).toBe(false);
    });

    it('should have stream mode by default', () => {
      expect(INITIAL_TRANSFER_STATE.mode).toBe('stream');
    });

    it('should have undefined peer fingerprint', () => {
      expect(INITIAL_TRANSFER_STATE.peerFingerprint).toBeUndefined();
    });
  });
});

describe('P2P Protocol Messages', () => {
  describe('Manifest message', () => {
    it('should support simple protocol', () => {
      const msg: P2PManifestMessage = {
        type: 'manifest',
        protocol: 'simple',
        fileName: 'file.txt',
        fileSize: 1024,
        mimeType: 'text/plain',
      };

      expect(msg.protocol).toBe('simple');
    });

    it('should support chunked protocol with manifest', () => {
      const msg: P2PManifestMessage = {
        type: 'manifest',
        protocol: 'chunked',
        manifest: {
          fileName: 'large.zip',
          fileSize: 1024 * 1024 * 200,
          mimeType: 'application/zip',
          chunkSize: 64 * 1024,
          totalChunks: 3200,
          chunkHashes: [],
          fileHash: 'hash',
        },
      };

      expect(msg.protocol).toBe('chunked');
      expect(msg.manifest?.totalChunks).toBe(3200);
    });

    it('should support E2E encryption metadata', () => {
      const msg: P2PManifestMessage = {
        type: 'manifest',
        protocol: 'simple',
        fileName: 'encrypted.dat',
        fileSize: 2048,
        e2eIv: 'base64-iv',
      };

      expect(msg.e2eIv).toBeDefined();
    });
  });

  describe('Chunk messages', () => {
    it('should create valid chunk request', () => {
      const msg: P2PChunkRequestMessage = {
        type: 'chunk_request',
        chunkIndex: 42,
      };

      expect(msg.type).toBe('chunk_request');
      expect(msg.chunkIndex).toBe(42);
    });

    it('should create valid chunk response', () => {
      const msg: P2PChunkResponseMessage = {
        type: 'chunk_response',
        chunkIndex: 42,
        data: 'SGVsbG8gV29ybGQ=', // base64 "Hello World"
      };

      expect(msg.type).toBe('chunk_response');
      expect(msg.chunkIndex).toBe(42);
      expect(msg.data).toBeTruthy();
    });
  });

  describe('Error message', () => {
    it('should create error message with code', () => {
      const msg: P2PErrorMessage = {
        type: 'error',
        message: 'Transfer failed',
        code: 'ERR_NETWORK',
      };

      expect(msg.type).toBe('error');
      expect(msg.message).toBe('Transfer failed');
      expect(msg.code).toBe('ERR_NETWORK');
    });

    it('should allow error message without code', () => {
      const msg: P2PErrorMessage = {
        type: 'error',
        message: 'Unknown error',
      };

      expect(msg.type).toBe('error');
      expect(msg.code).toBeUndefined();
    });
  });
});
