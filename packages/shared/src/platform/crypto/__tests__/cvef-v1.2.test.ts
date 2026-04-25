/**
 * CVEF v1.2 Format Tests
 *
 * Tests for the Crypto Vault Encrypted File Format v1.2 with hybrid KEM support.
 */

import { describe, it, expect } from 'vitest';
import {
  CVEF_MAGIC,
  CVEF_CONTAINER_V1,
  CVEF_HEADER_SIZE,
  CVEF_KEM,
  createCVEFMetadataV1_2,
  createCVEFHeader,
  parseCVEFHeader,
  isCVEFFile,
  isCVEFMetadataV1_2,
  normalizeCVEFMetadata,
  validateCVEFMetadata,
  describeCVEFMetadata,
  type CVEFMetadataV1_1,
  type CVEFMetadataV1_2,
  type CVEFPqcParamsV1_2,
} from '../cvef';

// ============ Test Data ============

function createValidPqcParams(): CVEFPqcParamsV1_2 {
  return {
    kemAlgorithm: 'x25519-ml-kem-768',
    classicalCiphertext: 'YWJjZGVm', // Base64 "abcdef"
    pqCiphertext: 'Z2hpamts', // Base64 "ghijkl"
    wrappedFileKey: 'bW5vcHFy', // Base64 "mnopqr"
  };
}

function createV1_0Metadata(): CVEFMetadataV1_1 {
  return {
    salt: 'c2FsdA==', // Base64 "salt"
    iv: 'aXY=', // Base64 "iv"
    algorithm: 'AES-256-GCM',
    iterations: 600000,
  };
}

function createV1_1Metadata(): CVEFMetadataV1_1 {
  return {
    version: '1.1',
    salt: 'c2FsdA==',
    iv: 'aXY=',
    algorithm: 'AES-256-GCM',
    iterations: 0,
    kdfAlgorithm: 'argon2id',
    kdfParams: {
      memoryCost: 47104,
      timeCost: 1,
      parallelism: 1,
    },
    keyWrapAlgorithm: 'aes-kw',
    masterKeyVersion: 1,
    pqcAlgorithm: 'none',
  };
}

function createV1_2Metadata(): CVEFMetadataV1_2 {
  return {
    version: '1.2',
    salt: 'c2FsdA==',
    iv: 'aXY=',
    algorithm: 'AES-256-GCM',
    iterations: 0,
    kdfAlgorithm: 'argon2id',
    kdfParams: {
      memoryCost: 47104,
      timeCost: 1,
      parallelism: 1,
    },
    keyWrapAlgorithm: 'aes-kw',
    masterKeyVersion: 1,
    pqcAlgorithm: 'ml-kem-768',
    pqcParams: createValidPqcParams(),
  };
}

// ============ Constants Tests ============

describe('CVEF Constants', () => {
  it('has correct magic header', () => {
    expect(CVEF_MAGIC).toEqual(new Uint8Array([0x43, 0x56, 0x45, 0x46])); // "CVEF"
  });

  it('has correct version', () => {
    expect(CVEF_CONTAINER_V1).toBe(1);
  });

  it('has correct header size', () => {
    expect(CVEF_HEADER_SIZE).toBe(9); // magic(4) + version(1) + length(4)
  });
});

describe('CVEF_KEM', () => {
  it('has correct KEM algorithm identifiers', () => {
    expect(CVEF_KEM.NONE).toBe(0x00);
    expect(CVEF_KEM.X25519_MLKEM768).toBe(0x01);
  });
});

// ============ Metadata Creation Tests ============

describe('createCVEFMetadataV1_2', () => {
  it('creates valid v1.2 metadata with hybrid KEM', () => {
    const pqcParams = createValidPqcParams();
    const metadata = createCVEFMetadataV1_2({
      salt: 'c2FsdA==',
      iv: 'aXY=',
      kdfAlgorithm: 'argon2id',
      kdfParams: {
        memoryCost: 47104,
        timeCost: 1,
        parallelism: 1,
      },
      pqcParams,
    });

    expect(metadata.version).toBe('1.2');
    expect(metadata.pqcAlgorithm).toBe('ml-kem-768');
    expect(metadata.pqcParams).toEqual(pqcParams);
    expect(metadata.keyWrapAlgorithm).toBe('aes-kw');
  });

  it('includes chunked info when provided', () => {
    const metadata = createCVEFMetadataV1_2({
      salt: 'c2FsdA==',
      iv: 'aXY=',
      kdfAlgorithm: 'argon2id',
      kdfParams: {
        memoryCost: 47104,
        timeCost: 1,
        parallelism: 1,
      },
      pqcParams: createValidPqcParams(),
      chunked: {
        count: 10,
        chunkSize: 65536,
        ivs: ['aXYx', 'aXYy'],
      },
    });

    expect(metadata.chunked).toBeDefined();
    expect(metadata.chunked!.count).toBe(10);
    expect(metadata.chunked!.chunkSize).toBe(65536);
  });
});

// ============ Header Tests ============

describe('createCVEFHeader', () => {
  it('creates valid header with magic and version', () => {
    const metadata = createV1_1Metadata();
    const { header } = createCVEFHeader(metadata);

    // Check magic header
    expect(header.slice(0, 4)).toEqual(CVEF_MAGIC);

    // Check version
    expect(header[4]).toBe(CVEF_CONTAINER_V1);

    // Header should be at least CVEF_HEADER_SIZE
    expect(header.length).toBeGreaterThanOrEqual(CVEF_HEADER_SIZE);
  });

  it('encodes metadata length correctly', () => {
    const metadata = createV1_1Metadata();
    const { header } = createCVEFHeader(metadata);

    // Read metadata length (big-endian)
    const metadataLength = (header[5]! << 24) | (header[6]! << 16) | (header[7]! << 8) | header[8]!;

    // Length should be header.length - CVEF_HEADER_SIZE
    expect(metadataLength).toBe(header.length - CVEF_HEADER_SIZE);
  });

  it('includes JSON metadata in header', () => {
    const metadata = createV1_2Metadata();
    const { header } = createCVEFHeader(metadata);

    // Parse metadata from header
    const metadataLength = (header[5]! << 24) | (header[6]! << 16) | (header[7]! << 8) | header[8]!;
    const metadataBytes = header.slice(CVEF_HEADER_SIZE, CVEF_HEADER_SIZE + metadataLength);
    const metadataJson = new TextDecoder().decode(metadataBytes);
    const parsedMetadata = JSON.parse(metadataJson);

    expect(parsedMetadata.version).toBe('1.2');
    expect(parsedMetadata.pqcAlgorithm).toBe('ml-kem-768');
  });
});

describe('parseCVEFHeader', () => {
  it('rejects v1.1 header (unsupported)', () => {
    const originalMetadata = createV1_1Metadata();
    const { header } = createCVEFHeader(originalMetadata);

    expect(() => parseCVEFHeader(header)).toThrow('Unsupported CVEF metadata version');
  });

  it('parses v1.2 header correctly', () => {
    const originalMetadata = createV1_2Metadata();
    const { header } = createCVEFHeader(originalMetadata);

    const { metadata, dataOffset } = parseCVEFHeader(header);

    expect('version' in metadata && metadata.version).toBe('1.2');
    expect(isCVEFMetadataV1_2(metadata)).toBe(true);
    if (isCVEFMetadataV1_2(metadata)) {
      expect(metadata.pqcParams.kemAlgorithm).toBe('x25519-ml-kem-768');
    }
    expect(dataOffset).toBe(header.length);
  });

  it('rejects v1.0 metadata on parse (unsupported)', () => {
    const v1_0Metadata = createV1_0Metadata();
    const { header } = createCVEFHeader(v1_0Metadata as CVEFMetadataV1_1);

    expect(() => parseCVEFHeader(header)).toThrow('Unsupported CVEF metadata version');
  });

  it('throws on invalid magic header', () => {
    const badData = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02]);
    expect(() => parseCVEFHeader(badData)).toThrow('missing magic header');
  });

  it('throws on unsupported version', () => {
    const badVersion = new Uint8Array([
      0x43, 0x56, 0x45, 0x46, // CVEF magic
      0x99, // Bad version
      0x00, 0x00, 0x00, 0x02,
      0x7b, 0x7d, // {}
    ]);
    expect(() => parseCVEFHeader(badVersion)).toThrow('Unsupported CVEF container version');
  });
});

describe('isCVEFFile', () => {
  it('returns true for valid CVEF file', () => {
    const { header } = createCVEFHeader(createV1_1Metadata());
    expect(isCVEFFile(header)).toBe(true);
  });

  it('returns false for non-CVEF file', () => {
    const notCVEF = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    expect(isCVEFFile(notCVEF)).toBe(false);
  });

  it('returns false for too-short data', () => {
    const tooShort = new Uint8Array([0x43, 0x56]);
    expect(isCVEFFile(tooShort)).toBe(false);
  });
});

// ============ Type Guard Tests ============

describe('isCVEFMetadataV1_2', () => {
  it('returns true for v1.2 metadata', () => {
    const metadata = createV1_2Metadata();
    expect(isCVEFMetadataV1_2(metadata)).toBe(true);
  });

  it('returns false for v1.1 metadata', () => {
    const metadata = createV1_1Metadata();
    expect(isCVEFMetadataV1_2(metadata)).toBe(false);
  });

  it('returns false for v1.0 metadata', () => {
    const metadata = createV1_0Metadata();
    expect(isCVEFMetadataV1_2(metadata)).toBe(false);
  });

  it('returns false for v1.2 without pqcParams', () => {
    const metadata = {
      ...createV1_1Metadata(),
      version: '1.2' as const,
      pqcAlgorithm: 'ml-kem-768' as const,
      // Missing pqcParams
    };
    expect(isCVEFMetadataV1_2(metadata as any)).toBe(false);
  });
});

// ============ Validation Tests ============

describe('validateCVEFMetadata', () => {
  it('validates v1.0 metadata', () => {
    expect(validateCVEFMetadata(createV1_0Metadata())).toBe(true);
  });

  it('validates v1.1 metadata', () => {
    expect(validateCVEFMetadata(createV1_1Metadata())).toBe(true);
  });

  it('validates v1.2 metadata', () => {
    expect(validateCVEFMetadata(createV1_2Metadata())).toBe(true);
  });

  it('rejects invalid metadata', () => {
    expect(validateCVEFMetadata(null)).toBe(false);
    expect(validateCVEFMetadata({})).toBe(false);
    expect(validateCVEFMetadata({ salt: 'test' })).toBe(false);
  });

  it('rejects invalid version', () => {
    const invalidVersion = {
      ...createV1_0Metadata(),
      version: '2.0',
    };
    expect(validateCVEFMetadata(invalidVersion)).toBe(false);
  });

  it('rejects invalid kdfAlgorithm', () => {
    const invalidKdf = {
      ...createV1_0Metadata(),
      kdfAlgorithm: 'sha256',
    };
    expect(validateCVEFMetadata(invalidKdf)).toBe(false);
  });

  it('rejects v1.2 with missing pqcParams fields', () => {
    const invalidV1_2 = {
      ...createV1_1Metadata(),
      version: '1.2',
      pqcAlgorithm: 'ml-kem-768',
      pqcParams: {
        kemAlgorithm: 'x25519-ml-kem-768',
        // Missing classicalCiphertext, pqCiphertext, wrappedFileKey
      },
    };
    expect(validateCVEFMetadata(invalidV1_2)).toBe(false);
  });
});

// ============ Normalization Tests ============

describe('normalizeCVEFMetadata', () => {
  it('returns v1.2 metadata unchanged', () => {
    const metadata = createV1_2Metadata();
    const normalized = normalizeCVEFMetadata(metadata);
    expect(normalized).toEqual(metadata);
  });

  it('rejects v1.1 metadata', () => {
    const metadata = createV1_1Metadata();
    expect(() => normalizeCVEFMetadata(metadata)).toThrow('Unsupported CVEF metadata version "1.1"');
  });

  it('rejects v1.0 metadata', () => {
    const metadata = createV1_0Metadata();
    expect(() => normalizeCVEFMetadata(metadata)).toThrow('Unsupported CVEF metadata version');
  });
});

// ============ Description Tests ============

describe('describeCVEFMetadata', () => {
  it('describes v1.0 metadata', () => {
    const metadata = createV1_0Metadata();
    const description = describeCVEFMetadata(metadata);

    expect(description).toContain('CVEF v1.0');
    expect(description).toContain('AES-256-GCM');
    expect(description).toContain('pbkdf2');
    expect(description).toContain('600000');
  });

  it('describes v1.1 metadata with Argon2id', () => {
    const metadata = createV1_1Metadata();
    const description = describeCVEFMetadata(metadata);

    expect(description).toContain('CVEF v1.1');
    expect(description).toContain('argon2id');
    expect(description).toContain('AES-KW');
  });

  it('describes v1.2 metadata with hybrid KEM', () => {
    const metadata = createV1_2Metadata();
    const description = describeCVEFMetadata(metadata);

    expect(description).toContain('CVEF v1.2');
    expect(description).toContain('ML-KEM-768');
    expect(description).toContain('hybrid');
    expect(description).toContain('X25519');
  });

  it('includes chunk info when present', () => {
    const metadata: CVEFMetadataV1_2 = {
      ...createV1_2Metadata(),
      chunked: {
        count: 10,
        chunkSize: 65536,
        ivs: [],
      },
    };
    const description = describeCVEFMetadata(metadata);

    expect(description).toContain('Chunks');
    expect(description).toContain('10');
  });
});

// ============ Round-Trip Tests ============

describe('Round-trip tests', () => {
  it('rejects v1.1 metadata on round-trip (unsupported)', () => {
    const original = createV1_1Metadata();
    const { header } = createCVEFHeader(original);
    expect(() => parseCVEFHeader(header)).toThrow('Unsupported CVEF metadata version');
  });

  it('round-trips v1.2 metadata through header', () => {
    const original = createV1_2Metadata();
    const { header } = createCVEFHeader(original);
    const { metadata: parsed } = parseCVEFHeader(header);

    expect(isCVEFMetadataV1_2(parsed)).toBe(true);
    if (isCVEFMetadataV1_2(parsed)) {
      expect(parsed.version).toBe(original.version);
      expect(parsed.pqcAlgorithm).toBe(original.pqcAlgorithm);
      expect(parsed.pqcParams.kemAlgorithm).toBe(original.pqcParams.kemAlgorithm);
      expect(parsed.pqcParams.classicalCiphertext).toBe(original.pqcParams.classicalCiphertext);
      expect(parsed.pqcParams.pqCiphertext).toBe(original.pqcParams.pqCiphertext);
      expect(parsed.pqcParams.wrappedFileKey).toBe(original.pqcParams.wrappedFileKey);
    }
  });
});
