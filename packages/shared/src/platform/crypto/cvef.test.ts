/**
 * Tests for CVEF format (v1.0–v1.3)
 */

import { describe, it, expect } from 'vitest';
import {
  CVEF_MAGIC,
  CVEF_VERSION,
  CVEF_HEADER_SIZE,
  isCVEFFile,
  parseCVEFHeader,
  normalizeCVEFMetadata,
  createCVEFHeader,
  createCVEFMetadata,
  validateCVEFMetadata,
  describeCVEFMetadata,
  type CVEFMetadataV1_0,
  type CVEFMetadataV1_1,
} from './cvef';

describe('CVEF Constants', () => {
  it('should have correct magic header', () => {
    expect(CVEF_MAGIC).toEqual(new Uint8Array([0x43, 0x56, 0x45, 0x46]));
    expect(new TextDecoder().decode(CVEF_MAGIC)).toBe('CVEF');
  });

  it('should have version 1', () => {
    expect(CVEF_VERSION).toBe(1);
  });

  it('should have correct header size', () => {
    expect(CVEF_HEADER_SIZE).toBe(9); // magic(4) + version(1) + length(4)
  });
});

describe('isCVEFFile', () => {
  it('should return true for valid CVEF header', () => {
    const data = new Uint8Array([0x43, 0x56, 0x45, 0x46, 0x01, 0, 0, 0, 10]);
    expect(isCVEFFile(data)).toBe(true);
  });

  it('should return false for invalid magic', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0, 0, 0, 10]);
    expect(isCVEFFile(data)).toBe(false);
  });

  it('should return false for too short data', () => {
    const data = new Uint8Array([0x43, 0x56, 0x45]);
    expect(isCVEFFile(data)).toBe(false);
  });

  it('should return false for empty data', () => {
    expect(isCVEFFile(new Uint8Array(0))).toBe(false);
  });
});

describe('createCVEFHeader and parseCVEFHeader', () => {
  it('should round-trip v1.1 metadata', () => {
    const metadata: CVEFMetadataV1_1 = {
      version: '1.1',
      salt: 'dGVzdHNhbHQ=',
      iv: 'dGVzdGl2',
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

    const header = createCVEFHeader(metadata);
    const parsed = parseCVEFHeader(header);

    expect(parsed.metadata.version).toBe('1.1');
    expect(parsed.metadata.salt).toBe(metadata.salt);
    expect(parsed.metadata.iv).toBe(metadata.iv);
    expect(parsed.metadata.kdfAlgorithm).toBe('argon2id');
    expect(parsed.metadata.kdfParams).toEqual(metadata.kdfParams);
    expect(parsed.metadata.keyWrapAlgorithm).toBe('aes-kw');
    expect(parsed.metadata.masterKeyVersion).toBe(1);
    expect(parsed.dataOffset).toBe(header.length);
  });

  it('should round-trip v1.0 compatible metadata', () => {
    const metadata: CVEFMetadataV1_1 = {
      version: '1.0',
      salt: 'dGVzdHNhbHQ=',
      iv: 'dGVzdGl2',
      algorithm: 'AES-256-GCM',
      iterations: 600000,
      kdfAlgorithm: 'pbkdf2',
      kdfParams: { iterations: 600000 },
      keyWrapAlgorithm: 'none',
      pqcAlgorithm: 'none',
    };

    const header = createCVEFHeader(metadata);
    const parsed = parseCVEFHeader(header);

    expect(parsed.metadata.iterations).toBe(600000);
    expect(parsed.metadata.kdfAlgorithm).toBe('pbkdf2');
    expect(parsed.metadata.keyWrapAlgorithm).toBe('none');
  });

  it('should round-trip chunked metadata', () => {
    const metadata: CVEFMetadataV1_1 = {
      version: '1.1',
      salt: 'dGVzdHNhbHQ=',
      iv: 'dGVzdGl2',
      algorithm: 'AES-256-GCM',
      iterations: 0,
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      chunked: {
        count: 3,
        chunkSize: 65536,
        ivs: ['aXYx', 'aXYy', 'aXYz'],
      },
    };

    const header = createCVEFHeader(metadata);
    const parsed = parseCVEFHeader(header);

    expect(parsed.metadata.chunked).toEqual(metadata.chunked);
  });

  it('should throw on invalid magic', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0, 0, 0, 2, 0x7b, 0x7d]);
    expect(() => parseCVEFHeader(data)).toThrow('missing magic header');
  });

  it('should throw on unsupported version', () => {
    const data = new Uint8Array([0x43, 0x56, 0x45, 0x46, 0x02, 0, 0, 0, 2, 0x7b, 0x7d]);
    expect(() => parseCVEFHeader(data)).toThrow('Unsupported CVEF version');
  });

  it('should throw on truncated metadata', () => {
    const data = new Uint8Array([0x43, 0x56, 0x45, 0x46, 0x01, 0, 0, 0, 100]);
    expect(() => parseCVEFHeader(data)).toThrow('metadata incomplete');
  });
});

describe('normalizeCVEFMetadata', () => {
  it('should return v1.1 metadata unchanged', () => {
    const metadata: CVEFMetadataV1_1 = {
      version: '1.1',
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 0,
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      keyWrapAlgorithm: 'aes-kw',
      masterKeyVersion: 2,
      pqcAlgorithm: 'none',
    };

    const normalized = normalizeCVEFMetadata(metadata);
    expect(normalized).toEqual(metadata);
  });

  it('should upgrade v1.0 metadata to v1.1 format', () => {
    const legacyMetadata: CVEFMetadataV1_0 = {
      salt: 'legacy-salt',
      iv: 'legacy-iv',
      algorithm: 'AES-256-GCM',
      iterations: 600000,
    };

    const normalized = normalizeCVEFMetadata(legacyMetadata);

    expect(normalized.version).toBe('1.0'); // Marked as upgraded
    expect(normalized.kdfAlgorithm).toBe('pbkdf2');
    expect(normalized.kdfParams).toEqual({ iterations: 600000 });
    expect(normalized.keyWrapAlgorithm).toBe('none');
    expect(normalized.pqcAlgorithm).toBe('none');
    expect(normalized.salt).toBe('legacy-salt');
    expect(normalized.iterations).toBe(600000);
  });

  it('should preserve chunked info when upgrading', () => {
    const legacyMetadata: CVEFMetadataV1_0 = {
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 600000,
      chunked: {
        count: 5,
        chunkSize: 65536,
        ivs: ['a', 'b', 'c', 'd', 'e'],
      },
    };

    const normalized = normalizeCVEFMetadata(legacyMetadata);
    expect(normalized.chunked).toEqual(legacyMetadata.chunked);
  });
});

describe('createCVEFMetadata', () => {
  it('should create v1.1 metadata with PBKDF2', () => {
    const metadata = createCVEFMetadata({
      salt: 'test-salt',
      iv: 'test-iv',
      kdfAlgorithm: 'pbkdf2',
      kdfParams: { iterations: 600000 },
    });

    expect(metadata.version).toBe('1.1');
    expect(metadata.algorithm).toBe('AES-256-GCM');
    expect(metadata.kdfAlgorithm).toBe('pbkdf2');
    expect(metadata.iterations).toBe(600000);
    expect(metadata.keyWrapAlgorithm).toBe('none');
    expect(metadata.pqcAlgorithm).toBe('none');
  });

  it('should create v1.1 metadata with Argon2id', () => {
    const metadata = createCVEFMetadata({
      salt: 'test-salt',
      iv: 'test-iv',
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
    });

    expect(metadata.kdfAlgorithm).toBe('argon2id');
    expect(metadata.kdfParams).toEqual({
      memoryCost: 47104,
      timeCost: 1,
      parallelism: 1,
    });
    expect(metadata.iterations).toBe(0); // Not used for Argon2
  });

  it('should create metadata with key wrapping', () => {
    const metadata = createCVEFMetadata({
      salt: 'test-salt',
      iv: 'test-iv',
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      keyWrapAlgorithm: 'aes-kw',
      masterKeyVersion: 3,
    });

    expect(metadata.keyWrapAlgorithm).toBe('aes-kw');
    expect(metadata.masterKeyVersion).toBe(3);
  });

  it('should create metadata with chunked info', () => {
    const metadata = createCVEFMetadata({
      salt: 'test-salt',
      iv: 'test-iv',
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      chunked: {
        count: 10,
        chunkSize: 65536,
        ivs: Array(10).fill('test-iv'),
      },
    });

    expect(metadata.chunked?.count).toBe(10);
    expect(metadata.chunked?.ivs.length).toBe(10);
  });
});

describe('validateCVEFMetadata', () => {
  it('should validate v1.0 metadata', () => {
    const metadata: CVEFMetadataV1_0 = {
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 600000,
    };
    expect(validateCVEFMetadata(metadata)).toBe(true);
  });

  it('should validate v1.1 metadata', () => {
    const metadata: CVEFMetadataV1_1 = {
      version: '1.1',
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 0,
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      keyWrapAlgorithm: 'aes-kw',
      masterKeyVersion: 1,
      pqcAlgorithm: 'none',
    };
    expect(validateCVEFMetadata(metadata)).toBe(true);
  });

  it('should reject null', () => {
    expect(validateCVEFMetadata(null)).toBe(false);
  });

  it('should reject missing salt', () => {
    expect(
      validateCVEFMetadata({
        iv: 'test',
        algorithm: 'AES-256-GCM',
        iterations: 600000,
      })
    ).toBe(false);
  });

  it('should reject invalid algorithm', () => {
    expect(
      validateCVEFMetadata({
        salt: 'test',
        iv: 'test',
        algorithm: 'AES-128-GCM',
        iterations: 600000,
      })
    ).toBe(false);
  });

  it('should reject invalid kdfAlgorithm', () => {
    expect(
      validateCVEFMetadata({
        salt: 'test',
        iv: 'test',
        algorithm: 'AES-256-GCM',
        iterations: 600000,
        kdfAlgorithm: 'bcrypt',
      })
    ).toBe(false);
  });

  it('should reject invalid version', () => {
    expect(
      validateCVEFMetadata({
        salt: 'test',
        iv: 'test',
        algorithm: 'AES-256-GCM',
        iterations: 600000,
        version: '2.0',
      })
    ).toBe(false);
  });
});

describe('describeCVEFMetadata', () => {
  it('should describe v1.0 metadata', () => {
    const description = describeCVEFMetadata({
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 600000,
    });

    expect(description).toContain('CVEF v1.0');
    expect(description).toContain('AES-256-GCM');
    expect(description).toContain('pbkdf2');
    expect(description).toContain('600000');
  });

  it('should describe v1.1 Argon2id metadata', () => {
    const description = describeCVEFMetadata({
      version: '1.1',
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 0,
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      keyWrapAlgorithm: 'aes-kw',
      masterKeyVersion: 2,
    });

    expect(description).toContain('CVEF v1.1');
    expect(description).toContain('argon2id');
    expect(description).toContain('46 MiB'); // 47104 / 1024
    expect(description).toContain('AES-KW');
    expect(description).toContain('version 2');
  });

  it('should describe chunked encryption', () => {
    const description = describeCVEFMetadata({
      version: '1.1',
      salt: 'test',
      iv: 'test',
      algorithm: 'AES-256-GCM',
      iterations: 0,
      kdfAlgorithm: 'argon2id',
      kdfParams: { memoryCost: 47104, timeCost: 1, parallelism: 1 },
      chunked: { count: 5, chunkSize: 65536, ivs: [] },
    });

    expect(description).toContain('Chunks: 5');
    expect(description).toContain('65536 bytes');
  });
});

