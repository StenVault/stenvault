/**
 * E2E Encryption Hook Tests — Hybrid PQC
 *
 * Tests for the useE2ECrypto hook with mocked HybridKemProvider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the platform module
const mockEncapsulate = vi.fn();
const mockDecapsulate = vi.fn();

vi.mock('@/lib/platform', () => ({
  arrayBufferToBase64: (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  },
  base64ToArrayBuffer: (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },
  getHybridKemProvider: () => ({
    encapsulate: mockEncapsulate,
    decapsulate: mockDecapsulate,
  }),
  serializeHybridCiphertext: (ct: any) => ({
    classical: 'mock-classical',
    postQuantum: 'mock-pq',
  }),
  deserializeHybridCiphertext: (s: any) => ({
    classical: new Uint8Array(32),
    postQuantum: new Uint8Array(1088),
  }),
}));

import { useE2ECrypto } from './useE2ECrypto';

describe('useE2ECrypto (Hybrid PQC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hook shape', () => {
    it('should return encryptMessage and decryptMessage', () => {
      const { result } = renderHook(() => useE2ECrypto());

      expect(result.current).toHaveProperty('encryptMessage');
      expect(result.current).toHaveProperty('decryptMessage');
      expect(typeof result.current.encryptMessage).toBe('function');
      expect(typeof result.current.decryptMessage).toBe('function');
    });

    it('should not return old P-256 methods', () => {
      const { result } = renderHook(() => useE2ECrypto());

      expect(result.current).not.toHaveProperty('generateKeyPair');
      expect(result.current).not.toHaveProperty('getKeyPair');
      expect(result.current).not.toHaveProperty('deriveSharedSecret');
      expect(result.current).not.toHaveProperty('clearKeys');
      expect(result.current).not.toHaveProperty('isReady');
      expect(result.current).not.toHaveProperty('hasKeys');
    });
  });

  describe('callback stability', () => {
    it('should return stable function references across renders', () => {
      const { result, rerender } = renderHook(() => useE2ECrypto());

      const firstRender = { ...result.current };
      rerender();

      expect(result.current.encryptMessage).toBe(firstRender.encryptMessage);
      expect(result.current.decryptMessage).toBe(firstRender.decryptMessage);
    });
  });
});
