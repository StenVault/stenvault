/**
 * HSM Types and Validation Tests
 *
 * Tests for HSM provider interface types and validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  HSM_CONSTANTS,
  HSM_ERROR_CODES,
  HSMError,
  validateHSMConfig,
  validateKeySpec,
  generateSecureIV,
  uint8ArrayToHex,
  hexToUint8Array,
  type HSMConfig,
  type HSMKeySpec,
} from '../types';
import { constantTimeEqual } from '../../crypto/utils';

describe('HSM Constants', () => {
  it('should have all required providers', () => {
    expect(HSM_CONSTANTS.PROVIDERS).toContain('aws-cloudhsm');
    expect(HSM_CONSTANTS.PROVIDERS).toContain('azure-keyvault');
    expect(HSM_CONSTANTS.PROVIDERS).toContain('yubihsm');
    expect(HSM_CONSTANTS.PROVIDERS).toContain('hashicorp-vault');
    expect(HSM_CONSTANTS.PROVIDERS).toContain('software');
  });

  it('should have all required key algorithms', () => {
    expect(HSM_CONSTANTS.KEY_ALGORITHMS).toContain('AES-256');
    expect(HSM_CONSTANTS.KEY_ALGORITHMS).toContain('RSA-4096');
    expect(HSM_CONSTANTS.KEY_ALGORITHMS).toContain('EC-P256');
  });

  it('should have all required key purposes', () => {
    expect(HSM_CONSTANTS.KEY_PURPOSES).toContain('wrap');
    expect(HSM_CONSTANTS.KEY_PURPOSES).toContain('encrypt');
    expect(HSM_CONSTANTS.KEY_PURPOSES).toContain('sign');
    expect(HSM_CONSTANTS.KEY_PURPOSES).toContain('derive');
  });

  it('should have correct AES-256 key size', () => {
    expect(HSM_CONSTANTS.AES_256_KEY_SIZE).toBe(32);
  });

  it('should have correct GCM IV size', () => {
    expect(HSM_CONSTANTS.GCM_IV_SIZE).toBe(12);
  });

  it('should have well-known key labels', () => {
    expect(HSM_CONSTANTS.KEY_LABELS.ROOT_KEY).toBe('stenvault-hsm-root');
    expect(HSM_CONSTANTS.KEY_LABELS.SERVER_MASTER_KEY).toBe('stenvault-server-master');
    expect(HSM_CONSTANTS.KEY_LABELS.SHAMIR_ENCRYPTION_KEY).toBe('stenvault-shamir-encryption');
  });
});

describe('HSMError', () => {
  it('should create error with all properties', () => {
    const error = new HSMError(
      HSM_ERROR_CODES.KEY_NOT_FOUND,
      'Key not found: test-key',
      'aws-cloudhsm',
      'getKey',
      'key-123'
    );

    expect(error.code).toBe(HSM_ERROR_CODES.KEY_NOT_FOUND);
    expect(error.message).toBe('Key not found: test-key');
    expect(error.provider).toBe('aws-cloudhsm');
    expect(error.operation).toBe('getKey');
    expect(error.keyId).toBe('key-123');
    expect(error.name).toBe('HSMError');
  });

  it('should serialize to JSON correctly', () => {
    const error = new HSMError(
      HSM_ERROR_CODES.CONNECTION_FAILED,
      'Connection timeout',
      'hashicorp-vault',
      'initialize'
    );

    const json = error.toJSON();

    expect(json.name).toBe('HSMError');
    expect(json.code).toBe(HSM_ERROR_CODES.CONNECTION_FAILED);
    expect(json.message).toBe('Connection timeout');
    expect(json.provider).toBe('hashicorp-vault');
    expect(json.operation).toBe('initialize');
  });

  it('should include cause in JSON when present', () => {
    const cause = new Error('Network error');
    const error = new HSMError(
      HSM_ERROR_CODES.CONNECTION_FAILED,
      'Connection failed',
      'azure-keyvault',
      'initialize',
      undefined,
      cause
    );

    const json = error.toJSON();
    expect(json.cause).toBe('Network error');
  });
});

describe('validateHSMConfig', () => {
  it('should reject missing provider', () => {
    const config = { enabled: true } as HSMConfig;

    expect(() => validateHSMConfig(config)).toThrow(HSMError);
    expect(() => validateHSMConfig(config)).toThrow('HSM provider type is required');
  });

  it('should reject invalid provider', () => {
    const config = {
      provider: 'invalid-provider' as any,
      enabled: true,
    };

    expect(() => validateHSMConfig(config)).toThrow(HSMError);
    expect(() => validateHSMConfig(config)).toThrow('Invalid HSM provider');
  });

  it('should validate AWS CloudHSM config', () => {
    const config: HSMConfig = {
      provider: 'aws-cloudhsm',
      enabled: true,
    };

    expect(() => validateHSMConfig(config)).toThrow('AWS CloudHSM configuration is required');

    config.awsCloudHsm = {
      clusterId: '',
      cryptoUser: 'cu',
      cryptoPassword: 'pass',
      customerCACertPath: '/path/to/ca.crt',
    };

    expect(() => validateHSMConfig(config)).toThrow('requires clusterId and cryptoUser');

    config.awsCloudHsm.clusterId = 'cluster-123';
    expect(() => validateHSMConfig(config)).not.toThrow();
  });

  it('should validate Azure Key Vault config', () => {
    const config: HSMConfig = {
      provider: 'azure-keyvault',
      enabled: true,
    };

    expect(() => validateHSMConfig(config)).toThrow('Azure Key Vault configuration is required');

    config.azureKeyVault = {
      vaultUrl: 'https://myvault.vault.azure.net',
      tenantId: '',
      clientId: 'client-id',
      useManagedIdentity: false,
    };

    expect(() => validateHSMConfig(config)).toThrow('requires vaultUrl and tenantId');

    config.azureKeyVault.tenantId = 'tenant-123';
    expect(() => validateHSMConfig(config)).not.toThrow();
  });

  it('should validate YubiHSM config', () => {
    const config: HSMConfig = {
      provider: 'yubihsm',
      enabled: true,
    };

    expect(() => validateHSMConfig(config)).toThrow('YubiHSM configuration is required');

    config.yubiHsm = {
      connectorUrl: 'http://localhost:12345',
      authKeyId: 0,
      authKeyPassword: 'password',
      domainId: 1,
    };

    expect(() => validateHSMConfig(config)).toThrow('requires connectorUrl and authKeyId');

    config.yubiHsm.authKeyId = 1;
    expect(() => validateHSMConfig(config)).not.toThrow();
  });

  it('should validate HashiCorp Vault config', () => {
    const config: HSMConfig = {
      provider: 'hashicorp-vault',
      enabled: true,
    };

    expect(() => validateHSMConfig(config)).toThrow('HashiCorp Vault configuration is required');

    config.hashicorpVault = {
      address: '',
    };

    expect(() => validateHSMConfig(config)).toThrow('requires address');

    config.hashicorpVault.address = 'https://vault.example.com:8200';
    expect(() => validateHSMConfig(config)).toThrow('requires either token or roleId');

    config.hashicorpVault.token = 'hvs.xxx';
    expect(() => validateHSMConfig(config)).not.toThrow();

    // Also works with roleId/secretId
    delete config.hashicorpVault.token;
    config.hashicorpVault.roleId = 'role-123';
    expect(() => validateHSMConfig(config)).not.toThrow();
  });

  it('should validate Software HSM config requires explicit enablement', () => {
    const config: HSMConfig = {
      provider: 'software',
      enabled: true,
    };

    expect(() => validateHSMConfig(config)).toThrow('Software HSM must be explicitly enabled');

    config.software = { enabled: true, storage: 'database' };
    // Should not throw, but should warn
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateHSMConfig(config)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
    consoleSpy.mockRestore();
  });
});

describe('validateKeySpec', () => {
  it('should reject invalid algorithm', () => {
    const spec: HSMKeySpec = {
      algorithm: 'INVALID' as any,
      purpose: 'encrypt',
      label: 'test-key',
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).toThrow(HSMError);
    expect(() => validateKeySpec(spec)).toThrow('Invalid key algorithm');
  });

  it('should reject invalid purpose', () => {
    const spec: HSMKeySpec = {
      algorithm: 'AES-256',
      purpose: 'invalid-purpose' as any,
      label: 'test-key',
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).toThrow(HSMError);
    expect(() => validateKeySpec(spec)).toThrow('Invalid key purpose');
  });

  it('should reject empty label', () => {
    const spec: HSMKeySpec = {
      algorithm: 'AES-256',
      purpose: 'encrypt',
      label: '',
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).toThrow(HSMError);
    expect(() => validateKeySpec(spec)).toThrow('Key label is required');
  });

  it('should reject label exceeding max length', () => {
    const spec: HSMKeySpec = {
      algorithm: 'AES-256',
      purpose: 'encrypt',
      label: 'a'.repeat(HSM_CONSTANTS.MAX_LABEL_LENGTH + 1),
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).toThrow(HSMError);
    expect(() => validateKeySpec(spec)).toThrow(`<= ${HSM_CONSTANTS.MAX_LABEL_LENGTH}`);
  });

  it('should reject AES key with sign purpose', () => {
    const spec: HSMKeySpec = {
      algorithm: 'AES-256',
      purpose: 'sign',
      label: 'test-key',
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).toThrow(HSMError);
    expect(() => validateKeySpec(spec)).toThrow('AES keys cannot be used for signing');
  });

  it('should accept valid key spec', () => {
    const spec: HSMKeySpec = {
      algorithm: 'AES-256',
      purpose: 'encrypt',
      label: 'test-key',
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).not.toThrow();
  });

  it('should accept multiple purposes', () => {
    const spec: HSMKeySpec = {
      algorithm: 'RSA-4096',
      purpose: ['encrypt', 'wrap', 'sign'],
      label: 'multi-purpose-key',
      extractable: false,
    };

    expect(() => validateKeySpec(spec)).not.toThrow();
  });
});

describe('generateSecureIV', () => {
  it('should generate IV of correct length', () => {
    const iv = generateSecureIV();
    expect(iv).toBeInstanceOf(Uint8Array);
    expect(iv.length).toBe(HSM_CONSTANTS.GCM_IV_SIZE);
  });

  it('should generate unique IVs', () => {
    const iv1 = generateSecureIV();
    const iv2 = generateSecureIV();

    // IVs should be different (extremely unlikely to be the same)
    expect(uint8ArrayToHex(iv1)).not.toBe(uint8ArrayToHex(iv2));
  });
});

describe('uint8ArrayToHex / hexToUint8Array', () => {
  it('should convert Uint8Array to hex', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    const hex = uint8ArrayToHex(bytes);
    expect(hex).toBe('000102ff');
  });

  it('should convert hex to Uint8Array', () => {
    const hex = '000102ff';
    const bytes = hexToUint8Array(hex);
    expect(bytes).toEqual(new Uint8Array([0x00, 0x01, 0x02, 0xff]));
  });

  it('should be reversible', () => {
    const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const hex = uint8ArrayToHex(original);
    const restored = hexToUint8Array(hex);
    expect(restored).toEqual(original);
  });

  it('should reject odd-length hex strings', () => {
    expect(() => hexToUint8Array('abc')).toThrow('even length');
  });
});

describe('constantTimeEqual', () => {
  it('should return true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should return false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('should return false for different length arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('should return true for empty arrays', () => {
    const a = new Uint8Array([]);
    const b = new Uint8Array([]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should handle all zero arrays', () => {
    const a = new Uint8Array([0, 0, 0, 0]);
    const b = new Uint8Array([0, 0, 0, 0]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should detect difference at any position', () => {
    const base = new Uint8Array([1, 2, 3, 4, 5]);

    for (let i = 0; i < base.length; i++) {
      const modified = new Uint8Array(base);
      modified[i] = modified[i]! ^ 0xff; // Flip all bits at position i
      expect(constantTimeEqual(base, modified)).toBe(false);
    }
  });
});

// Import vitest mock
import { vi } from 'vitest';
