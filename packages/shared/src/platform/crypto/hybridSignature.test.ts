/**
 * Tests for Hybrid Signature Interface (Phase 3.4)
 *
 * Tests validation, serialization, and utility functions.
 * Provider-specific tests are in their respective test files.
 */

import { describe, it, expect } from 'vitest';
import {
  HYBRID_SIGNATURE_SIZES,
  HYBRID_SIGNATURE_ALGORITHMS,
  SIGNATURE_CONTEXTS,
  validateHybridSignaturePublicKey,
  validateHybridSignatureSecretKey,
  validateHybridSignature,
  validateSignatureContext,
  serializeHybridSignaturePublicKey,
  deserializeHybridSignaturePublicKey,
  serializeHybridSignature,
  deserializeHybridSignature,
  createContextualMessage,
  generateSignatureKeyFingerprint,
  type HybridSignaturePublicKey,
  type HybridSignatureSecretKey,
  type HybridSignature,
  type SignatureContext,
} from './hybridSignature';

// ============ Test Data Generators ============

function createValidPublicKey(): HybridSignaturePublicKey {
  return {
    classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).fill(0x01),
    postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).fill(0x02),
  };
}

function createValidSecretKey(): HybridSignatureSecretKey {
  return {
    classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_SECRET_KEY).fill(0x03),
    postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY).fill(0x04),
  };
}

function createValidSignature(): HybridSignature {
  return {
    classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE).fill(0x05),
    postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE).fill(0x06),
    context: 'FILE',
    signedAt: Date.now(),
  };
}

// ============ Constants Tests ============

describe('HYBRID_SIGNATURE_SIZES', () => {
  it('should have correct Ed25519 sizes per RFC 8032', () => {
    expect(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).toBe(32);
    expect(HYBRID_SIGNATURE_SIZES.ED25519_SECRET_KEY).toBe(64);
    expect(HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE).toBe(64);
  });

  it('should have correct ML-DSA-65 sizes per FIPS 204', () => {
    expect(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).toBe(1952);
    expect(HYBRID_SIGNATURE_SIZES.MLDSA65_SECRET_KEY).toBe(32);
    expect(HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE).toBe(3309);
  });

  it('should have reasonable hybrid signature size', () => {
    // Hybrid = Ed25519 (64) + ML-DSA-65 (3309) + overhead
    expect(HYBRID_SIGNATURE_SIZES.HYBRID_SIGNATURE).toBeGreaterThanOrEqual(
      HYBRID_SIGNATURE_SIZES.ED25519_SIGNATURE + HYBRID_SIGNATURE_SIZES.MLDSA65_SIGNATURE
    );
  });
});

describe('HYBRID_SIGNATURE_ALGORITHMS', () => {
  it('should have correct algorithm identifiers', () => {
    expect(HYBRID_SIGNATURE_ALGORITHMS.NONE).toBe(0x00);
    expect(HYBRID_SIGNATURE_ALGORITHMS.ED25519_MLDSA65).toBe(0x01);
  });
});

describe('SIGNATURE_CONTEXTS', () => {
  it('should have all required contexts', () => {
    expect(SIGNATURE_CONTEXTS.FILE).toBeDefined();
    expect(SIGNATURE_CONTEXTS.TIMESTAMP).toBeDefined();
    expect(SIGNATURE_CONTEXTS.SHARE).toBeDefined();
  });

  it('should have unique domain separators', () => {
    const values = Object.values(SIGNATURE_CONTEXTS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('should include version in domain separators', () => {
    expect(SIGNATURE_CONTEXTS.FILE).toContain('v1');
    expect(SIGNATURE_CONTEXTS.TIMESTAMP).toContain('v1');
    expect(SIGNATURE_CONTEXTS.SHARE).toContain('v1');
  });
});

// ============ Validation Tests ============

describe('validateHybridSignaturePublicKey', () => {
  it('should accept valid public key', () => {
    const publicKey = createValidPublicKey();
    expect(() => validateHybridSignaturePublicKey(publicKey)).not.toThrow();
  });

  it('should reject wrong Ed25519 public key size', () => {
    const publicKey = createValidPublicKey();
    publicKey.classical = new Uint8Array(31); // Wrong size
    expect(() => validateHybridSignaturePublicKey(publicKey)).toThrow(/Ed25519 public key/);
  });

  it('should reject wrong ML-DSA-65 public key size', () => {
    const publicKey = createValidPublicKey();
    publicKey.postQuantum = new Uint8Array(1951); // Wrong size
    expect(() => validateHybridSignaturePublicKey(publicKey)).toThrow(/ML-DSA-65 public key/);
  });

  it('should reject missing classical key', () => {
    const publicKey = { postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY) } as HybridSignaturePublicKey;
    expect(() => validateHybridSignaturePublicKey(publicKey)).toThrow();
  });

  it('should reject missing postQuantum key', () => {
    const publicKey = { classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY) } as HybridSignaturePublicKey;
    expect(() => validateHybridSignaturePublicKey(publicKey)).toThrow();
  });
});

describe('validateHybridSignatureSecretKey', () => {
  it('should accept valid secret key', () => {
    const secretKey = createValidSecretKey();
    expect(() => validateHybridSignatureSecretKey(secretKey)).not.toThrow();
  });

  it('should reject wrong Ed25519 secret key size', () => {
    const secretKey = createValidSecretKey();
    secretKey.classical = new Uint8Array(32); // Wrong size (should be 64)
    expect(() => validateHybridSignatureSecretKey(secretKey)).toThrow(/Ed25519 secret key/);
  });

  it('should reject wrong ML-DSA-65 secret key size', () => {
    const secretKey = createValidSecretKey();
    secretKey.postQuantum = new Uint8Array(4000); // Wrong size
    expect(() => validateHybridSignatureSecretKey(secretKey)).toThrow(/ML-DSA-65 secret key/);
  });
});

describe('validateHybridSignature', () => {
  it('should accept valid signature', () => {
    const signature = createValidSignature();
    expect(() => validateHybridSignature(signature)).not.toThrow();
  });

  it('should reject wrong Ed25519 signature size', () => {
    const signature = createValidSignature();
    signature.classical = new Uint8Array(63); // Wrong size
    expect(() => validateHybridSignature(signature)).toThrow(/Ed25519 signature/);
  });

  it('should reject wrong ML-DSA-65 signature size', () => {
    const signature = createValidSignature();
    signature.postQuantum = new Uint8Array(3292); // Wrong size
    expect(() => validateHybridSignature(signature)).toThrow(/ML-DSA-65 signature/);
  });

  it('should reject invalid context', () => {
    const signature = createValidSignature();
    (signature as any).context = 'INVALID';
    expect(() => validateHybridSignature(signature)).toThrow(/context/);
  });

  it('should reject invalid signedAt', () => {
    const signature = createValidSignature();
    signature.signedAt = 0;
    expect(() => validateHybridSignature(signature)).toThrow(/signedAt/);
  });

  it('should reject negative signedAt', () => {
    const signature = createValidSignature();
    signature.signedAt = -1;
    expect(() => validateHybridSignature(signature)).toThrow(/signedAt/);
  });

  it('should accept all valid contexts', () => {
    const contexts: SignatureContext[] = ['FILE', 'TIMESTAMP', 'SHARE'];
    for (const context of contexts) {
      const signature = createValidSignature();
      signature.context = context;
      expect(() => validateHybridSignature(signature)).not.toThrow();
    }
  });
});

describe('validateSignatureContext', () => {
  it('should accept valid contexts', () => {
    expect(() => validateSignatureContext('FILE')).not.toThrow();
    expect(() => validateSignatureContext('TIMESTAMP')).not.toThrow();
    expect(() => validateSignatureContext('SHARE')).not.toThrow();
  });

  it('should reject invalid context', () => {
    expect(() => validateSignatureContext('INVALID')).toThrow();
    expect(() => validateSignatureContext('')).toThrow();
  });
});

// ============ Serialization Tests ============

describe('serializeHybridSignaturePublicKey', () => {
  it('should serialize public key to Base64', () => {
    const publicKey = createValidPublicKey();
    const serialized = serializeHybridSignaturePublicKey(publicKey);

    expect(serialized.algorithm).toBe('ed25519-ml-dsa-65');
    expect(typeof serialized.classical).toBe('string');
    expect(typeof serialized.postQuantum).toBe('string');
    expect(serialized.classical.length).toBeGreaterThan(0);
    expect(serialized.postQuantum.length).toBeGreaterThan(0);
  });

  it('should reject invalid public key', () => {
    const publicKey = { classical: new Uint8Array(10), postQuantum: new Uint8Array(10) };
    expect(() => serializeHybridSignaturePublicKey(publicKey as HybridSignaturePublicKey)).toThrow();
  });
});

describe('deserializeHybridSignaturePublicKey', () => {
  it('should round-trip public key', () => {
    const original = createValidPublicKey();
    const serialized = serializeHybridSignaturePublicKey(original);
    const deserialized = deserializeHybridSignaturePublicKey(serialized);

    expect(deserialized.classical).toEqual(original.classical);
    expect(deserialized.postQuantum).toEqual(original.postQuantum);
  });

  it('should validate deserialized key sizes', () => {
    const invalidSerialized = {
      classical: 'aGVsbG8=', // "hello" - wrong size
      postQuantum: 'd29ybGQ=', // "world" - wrong size
      algorithm: 'ed25519-ml-dsa-65' as const,
    };
    expect(() => deserializeHybridSignaturePublicKey(invalidSerialized)).toThrow();
  });
});

describe('serializeHybridSignature', () => {
  it('should serialize signature to Base64', () => {
    const signature = createValidSignature();
    const serialized = serializeHybridSignature(signature);

    expect(typeof serialized.classical).toBe('string');
    expect(typeof serialized.postQuantum).toBe('string');
    expect(serialized.context).toBe(signature.context);
    expect(serialized.signedAt).toBe(signature.signedAt);
  });
});

describe('deserializeHybridSignature', () => {
  it('should round-trip signature', () => {
    const original = createValidSignature();
    const serialized = serializeHybridSignature(original);
    const deserialized = deserializeHybridSignature(serialized);

    expect(deserialized.classical).toEqual(original.classical);
    expect(deserialized.postQuantum).toEqual(original.postQuantum);
    expect(deserialized.context).toBe(original.context);
    expect(deserialized.signedAt).toBe(original.signedAt);
  });

  it('should preserve all contexts through round-trip', () => {
    const contexts: SignatureContext[] = ['FILE', 'TIMESTAMP', 'SHARE'];
    for (const context of contexts) {
      const original = createValidSignature();
      original.context = context;
      const serialized = serializeHybridSignature(original);
      const deserialized = deserializeHybridSignature(serialized);
      expect(deserialized.context).toBe(context);
    }
  });
});

// ============ Utility Function Tests ============

describe('createContextualMessage', () => {
  it('should prefix message with context', () => {
    const message = new Uint8Array([0x01, 0x02, 0x03]);
    const contextual = createContextualMessage(message, 'FILE');

    // Should start with context string
    const contextBytes = new TextEncoder().encode(SIGNATURE_CONTEXTS.FILE);
    expect(contextual.slice(0, contextBytes.length)).toEqual(contextBytes);

    // Should have separator byte
    expect(contextual[contextBytes.length]).toBe(0x00);

    // Should end with original message
    expect(contextual.slice(-message.length)).toEqual(message);
  });

  it('should create different messages for different contexts', () => {
    const message = new Uint8Array([0x01, 0x02, 0x03]);

    const fileContextual = createContextualMessage(message, 'FILE');
    const timestampContextual = createContextualMessage(message, 'TIMESTAMP');
    const shareContextual = createContextualMessage(message, 'SHARE');

    // All should be different (different domain separators)
    expect(fileContextual).not.toEqual(timestampContextual);
    expect(fileContextual).not.toEqual(shareContextual);
    expect(timestampContextual).not.toEqual(shareContextual);
  });

  it('should handle empty message', () => {
    const message = new Uint8Array(0);
    const contextual = createContextualMessage(message, 'FILE');

    const contextBytes = new TextEncoder().encode(SIGNATURE_CONTEXTS.FILE);
    // Length should be context + separator (1 byte)
    expect(contextual.length).toBe(contextBytes.length + 1);
  });

  it('should handle large message', () => {
    const message = new Uint8Array(10000).fill(0xAB);
    const contextual = createContextualMessage(message, 'FILE');

    const contextBytes = new TextEncoder().encode(SIGNATURE_CONTEXTS.FILE);
    expect(contextual.length).toBe(contextBytes.length + 1 + message.length);
    expect(contextual.slice(-message.length)).toEqual(message);
  });

  it('should be deterministic', () => {
    const message = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const result1 = createContextualMessage(message, 'FILE');
    const result2 = createContextualMessage(message, 'FILE');

    expect(result1).toEqual(result2);
  });
});

// ============ Cross-Context Attack Prevention Tests ============

describe('Domain Separator Security', () => {
  it('should prevent signature reuse across contexts', () => {
    // Signatures created for one context should not validate for another
    // This is enforced by the contextual message prefix
    const message = new Uint8Array([0x01, 0x02, 0x03]);

    const fileMsg = createContextualMessage(message, 'FILE');
    const timestampMsg = createContextualMessage(message, 'TIMESTAMP');

    // Even with same underlying message, contextual messages are different
    expect(fileMsg).not.toEqual(timestampMsg);

    // This means a signature over fileMsg won't verify against timestampMsg
    // (actual verification tested in provider tests)
  });

  it('should include version in all contexts', () => {
    // Version in domain separator allows future protocol upgrades
    for (const [name, value] of Object.entries(SIGNATURE_CONTEXTS)) {
      expect(value).toContain('v1');
    }
  });
});

// ============ Edge Cases ============

describe('Edge Cases', () => {
  it('should handle maximum size keys', () => {
    const publicKey = createValidPublicKey();
    const secretKey = createValidSecretKey();

    // Fill with random-ish data
    for (let i = 0; i < publicKey.classical.length; i++) {
      publicKey.classical[i] = i % 256;
    }
    for (let i = 0; i < publicKey.postQuantum.length; i++) {
      publicKey.postQuantum[i] = (i * 7) % 256;
    }

    expect(() => validateHybridSignaturePublicKey(publicKey)).not.toThrow();
    expect(() => validateHybridSignatureSecretKey(secretKey)).not.toThrow();

    // Round-trip should preserve data
    const serialized = serializeHybridSignaturePublicKey(publicKey);
    const deserialized = deserializeHybridSignaturePublicKey(serialized);
    expect(deserialized.classical).toEqual(publicKey.classical);
    expect(deserialized.postQuantum).toEqual(publicKey.postQuantum);
  });

  it('should handle signature with future timestamp', () => {
    const signature = createValidSignature();
    signature.signedAt = Date.now() + 1000000; // Future timestamp
    // Should still be valid (server time sync issues happen)
    expect(() => validateHybridSignature(signature)).not.toThrow();
  });

  it('should handle binary message data', () => {
    // All possible byte values
    const message = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      message[i] = i;
    }

    const contextual = createContextualMessage(message, 'FILE');
    expect(contextual.slice(-256)).toEqual(message);
  });
});

describe('generateSignatureKeyFingerprint', () => {
  it('should generate a 32-character hex fingerprint', async () => {
    const publicKey: HybridSignaturePublicKey = {
      classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).fill(0x01),
      postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).fill(0x02),
    };

    const fingerprint = await generateSignatureKeyFingerprint(publicKey);

    // SHA-256 first 16 bytes = 32 hex characters
    expect(fingerprint).toHaveLength(32);
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate different fingerprints for different keys', async () => {
    const publicKey1: HybridSignaturePublicKey = {
      classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).fill(0x01),
      postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).fill(0x02),
    };

    const publicKey2: HybridSignaturePublicKey = {
      classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).fill(0x03),
      postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).fill(0x04),
    };

    const fingerprint1 = await generateSignatureKeyFingerprint(publicKey1);
    const fingerprint2 = await generateSignatureKeyFingerprint(publicKey2);

    expect(fingerprint1).not.toBe(fingerprint2);
  });

  it('should generate consistent fingerprints for the same key', async () => {
    const publicKey: HybridSignaturePublicKey = {
      classical: new Uint8Array(HYBRID_SIGNATURE_SIZES.ED25519_PUBLIC_KEY).fill(0xaa),
      postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY).fill(0xbb),
    };

    const fingerprint1 = await generateSignatureKeyFingerprint(publicKey);
    const fingerprint2 = await generateSignatureKeyFingerprint(publicKey);

    expect(fingerprint1).toBe(fingerprint2);
  });

  it('should reject invalid public key', async () => {
    const invalidKey: HybridSignaturePublicKey = {
      classical: new Uint8Array(10), // Wrong size
      postQuantum: new Uint8Array(HYBRID_SIGNATURE_SIZES.MLDSA65_PUBLIC_KEY),
    };

    await expect(generateSignatureKeyFingerprint(invalidKey)).rejects.toThrow(
      /Invalid Ed25519 public key/
    );
  });
});
