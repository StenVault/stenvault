/**
 * Hybrid KEM Interface Tests
 *
 * Tests for the hybrid post-quantum key encapsulation interface.
 * Tests validation functions and serialization utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  HYBRID_KEM_SIZES,
  HYBRID_KEM_ALGORITHMS,
  HYBRID_KEM_HKDF_INFO,
  validateHybridPublicKey,
  validateHybridSecretKey,
  validateHybridCiphertext,
  serializeHybridPublicKey,
  deserializeHybridPublicKey,
  serializeHybridCiphertext,
  deserializeHybridCiphertext,
  type HybridPublicKey,
  type HybridSecretKey,
  type HybridCiphertext,
} from '../hybridKem';

// ============ Test Data ============

function createValidPublicKey(): HybridPublicKey {
  return {
    classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY).fill(0xAB),
    postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY).fill(0xCD),
  };
}

function createValidSecretKey(): HybridSecretKey {
  return {
    classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_SECRET_KEY).fill(0x12),
    postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY).fill(0x34),
  };
}

function createValidCiphertext(): HybridCiphertext {
  return {
    classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY).fill(0x56),
    postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT).fill(0x78),
  };
}

// ============ Constants Tests ============

describe('HYBRID_KEM_SIZES', () => {
  it('has correct X25519 key sizes', () => {
    expect(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY).toBe(32);
    expect(HYBRID_KEM_SIZES.X25519_SECRET_KEY).toBe(32);
    expect(HYBRID_KEM_SIZES.X25519_SHARED_SECRET).toBe(32);
  });

  it('has correct ML-KEM-768 sizes', () => {
    expect(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY).toBe(1184);
    expect(HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY).toBe(2400);
    expect(HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT).toBe(1088);
    expect(HYBRID_KEM_SIZES.MLKEM768_SHARED_SECRET).toBe(32);
  });

  it('has correct hybrid shared secret size', () => {
    expect(HYBRID_KEM_SIZES.HYBRID_SHARED_SECRET).toBe(32);
  });
});

describe('HYBRID_KEM_ALGORITHMS', () => {
  it('has correct algorithm identifiers', () => {
    expect(HYBRID_KEM_ALGORITHMS.NONE).toBe(0x00);
    expect(HYBRID_KEM_ALGORITHMS.X25519_MLKEM768).toBe(0x01);
  });
});

describe('HYBRID_KEM_HKDF_INFO', () => {
  it('has correct domain separator', () => {
    expect(HYBRID_KEM_HKDF_INFO).toBe('StenVault-Hybrid-KEM-v1');
  });
});

// ============ Validation Tests ============

describe('validateHybridPublicKey', () => {
  it('accepts valid public key', () => {
    const publicKey = createValidPublicKey();
    expect(() => validateHybridPublicKey(publicKey)).not.toThrow();
  });

  it('rejects invalid X25519 public key size', () => {
    const publicKey = {
      classical: new Uint8Array(31), // Too short
      postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY),
    };
    expect(() => validateHybridPublicKey(publicKey)).toThrow('Invalid X25519 public key');
  });

  it('rejects invalid ML-KEM-768 public key size', () => {
    const publicKey = {
      classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY),
      postQuantum: new Uint8Array(1000), // Too short
    };
    expect(() => validateHybridPublicKey(publicKey)).toThrow('Invalid ML-KEM-768 public key');
  });

  it('rejects null classical key', () => {
    const publicKey = {
      classical: null as unknown as Uint8Array,
      postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY),
    };
    expect(() => validateHybridPublicKey(publicKey)).toThrow('Invalid X25519 public key');
  });

  it('rejects undefined postQuantum key', () => {
    const publicKey = {
      classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY),
      postQuantum: undefined as unknown as Uint8Array,
    };
    expect(() => validateHybridPublicKey(publicKey)).toThrow('Invalid ML-KEM-768 public key');
  });
});

describe('validateHybridSecretKey', () => {
  it('accepts valid secret key', () => {
    const secretKey = createValidSecretKey();
    expect(() => validateHybridSecretKey(secretKey)).not.toThrow();
  });

  it('rejects invalid X25519 secret key size', () => {
    const secretKey = {
      classical: new Uint8Array(16), // Too short
      postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_SECRET_KEY),
    };
    expect(() => validateHybridSecretKey(secretKey)).toThrow('Invalid X25519 secret key');
  });

  it('rejects invalid ML-KEM-768 secret key size', () => {
    const secretKey = {
      classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_SECRET_KEY),
      postQuantum: new Uint8Array(2000), // Too short
    };
    expect(() => validateHybridSecretKey(secretKey)).toThrow('Invalid ML-KEM-768 secret key');
  });
});

describe('validateHybridCiphertext', () => {
  it('accepts valid ciphertext', () => {
    const ciphertext = createValidCiphertext();
    expect(() => validateHybridCiphertext(ciphertext)).not.toThrow();
  });

  it('rejects invalid X25519 ciphertext size', () => {
    const ciphertext = {
      classical: new Uint8Array(31), // Too short
      postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT),
    };
    expect(() => validateHybridCiphertext(ciphertext)).toThrow('Invalid X25519 ciphertext');
  });

  it('rejects invalid ML-KEM-768 ciphertext size', () => {
    const ciphertext = {
      classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY),
      postQuantum: new Uint8Array(1000), // Too short
    };
    expect(() => validateHybridCiphertext(ciphertext)).toThrow('Invalid ML-KEM-768 ciphertext');
  });
});

// ============ Serialization Tests ============

describe('serializeHybridPublicKey', () => {
  it('serializes valid public key to Base64', () => {
    const publicKey = createValidPublicKey();
    const serialized = serializeHybridPublicKey(publicKey);

    expect(serialized.algorithm).toBe('x25519-ml-kem-768');
    expect(typeof serialized.classical).toBe('string');
    expect(typeof serialized.postQuantum).toBe('string');
    expect(serialized.classical.length).toBeGreaterThan(0);
    expect(serialized.postQuantum.length).toBeGreaterThan(0);
  });

  it('throws on invalid public key', () => {
    const invalidKey = {
      classical: new Uint8Array(10),
      postQuantum: new Uint8Array(10),
    };
    expect(() => serializeHybridPublicKey(invalidKey)).toThrow();
  });
});

describe('deserializeHybridPublicKey', () => {
  it('deserializes valid serialized public key', () => {
    const original = createValidPublicKey();
    const serialized = serializeHybridPublicKey(original);
    const deserialized = deserializeHybridPublicKey(serialized);

    expect(deserialized.classical.length).toBe(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY);
    expect(deserialized.postQuantum.length).toBe(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY);
    expect(deserialized.classical).toEqual(original.classical);
    expect(deserialized.postQuantum).toEqual(original.postQuantum);
  });

  it('round-trips correctly', () => {
    const original = createValidPublicKey();
    const serialized = serializeHybridPublicKey(original);
    const deserialized = deserializeHybridPublicKey(serialized);

    expect(deserialized.classical).toEqual(original.classical);
    expect(deserialized.postQuantum).toEqual(original.postQuantum);
  });
});

describe('serializeHybridCiphertext', () => {
  it('serializes valid ciphertext to Base64', () => {
    const ciphertext = createValidCiphertext();
    const serialized = serializeHybridCiphertext(ciphertext);

    expect(typeof serialized.classical).toBe('string');
    expect(typeof serialized.postQuantum).toBe('string');
    expect(serialized.classical.length).toBeGreaterThan(0);
    expect(serialized.postQuantum.length).toBeGreaterThan(0);
  });
});

describe('deserializeHybridCiphertext', () => {
  it('deserializes valid serialized ciphertext', () => {
    const original = createValidCiphertext();
    const serialized = serializeHybridCiphertext(original);
    const deserialized = deserializeHybridCiphertext(serialized);

    expect(deserialized.classical.length).toBe(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY);
    expect(deserialized.postQuantum.length).toBe(HYBRID_KEM_SIZES.MLKEM768_CIPHERTEXT);
    expect(deserialized.classical).toEqual(original.classical);
    expect(deserialized.postQuantum).toEqual(original.postQuantum);
  });

  it('round-trips correctly', () => {
    const original = createValidCiphertext();
    const serialized = serializeHybridCiphertext(original);
    const deserialized = deserializeHybridCiphertext(serialized);

    expect(deserialized.classical).toEqual(original.classical);
    expect(deserialized.postQuantum).toEqual(original.postQuantum);
  });
});

// ============ Edge Cases ============

describe('Edge Cases', () => {
  it('handles empty arrays correctly', () => {
    const emptyPublicKey = {
      classical: new Uint8Array(0),
      postQuantum: new Uint8Array(0),
    };
    expect(() => validateHybridPublicKey(emptyPublicKey)).toThrow();
  });

  it('handles arrays at exact boundary sizes', () => {
    // Exactly one byte too short
    const almostValidPublicKey = {
      classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY - 1),
      postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY),
    };
    expect(() => validateHybridPublicKey(almostValidPublicKey)).toThrow();

    // Exactly one byte too long
    const tooLongPublicKey = {
      classical: new Uint8Array(HYBRID_KEM_SIZES.X25519_PUBLIC_KEY + 1),
      postQuantum: new Uint8Array(HYBRID_KEM_SIZES.MLKEM768_PUBLIC_KEY),
    };
    expect(() => validateHybridPublicKey(tooLongPublicKey)).toThrow();
  });

  it('preserves all byte values through serialization', () => {
    // Create a public key with all possible byte values
    const publicKey = createValidPublicKey();
    for (let i = 0; i < publicKey.classical.length; i++) {
      publicKey.classical[i] = i % 256;
    }

    const serialized = serializeHybridPublicKey(publicKey);
    const deserialized = deserializeHybridPublicKey(serialized);

    for (let i = 0; i < publicKey.classical.length; i++) {
      expect(deserialized.classical[i]).toBe(publicKey.classical[i]);
    }
  });
});
