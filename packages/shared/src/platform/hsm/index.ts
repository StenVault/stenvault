/**
 * HSM (Hardware Security Module) Abstraction Layer
 *
 * Provides platform-agnostic interfaces for HSM operations.
 * Supports multiple backends:
 * - AWS CloudHSM
 * - Azure Key Vault
 * - HashiCorp Vault Transit
 * - YubiHSM 2
 * - Software fallback (development only)
 *
 * Usage:
 * ```typescript
 * import { HSMProvider, HSMConfig, HSM_CONSTANTS } from '@cloudvault/shared/platform/hsm';
 *
 * // Configuration
 * const config: HSMConfig = {
 *   provider: 'hashicorp-vault',
 *   enabled: true,
 *   hashicorpVault: {
 *     address: 'https://vault.example.com:8200',
 *     roleId: 'my-role-id',
 *     secretId: 'my-secret-id',
 *   },
 * };
 *
 * // Use provider
 * const hsm: HSMProvider = createHSMProvider(config);
 * await hsm.initialize(config);
 *
 * // Generate key
 * const key = await hsm.generateKey({
 *   algorithm: 'AES-256',
 *   purpose: 'encrypt',
 *   label: 'my-encryption-key',
 *   extractable: false,
 * });
 *
 * // Encrypt data
 * const result = await hsm.encrypt(plaintext, key);
 * ```
 *
 * @module platform/hsm
 */

// Export all types
export * from './types';

// Re-export commonly used items for convenience
export {
  // Constants
  HSM_CONSTANTS,
  HSM_ERROR_CODES,

  // Types
  type HSMProvider,
  type HSMConfig,
  type HSMKeySpec,
  type HSMKeyHandle,
  type HSMKeyInfo,
  type HSMEncryptResult,
  type HSMWrapResult,
  type HSMSignResult,
  type HSMKeyRotationResult,
  type HSMAuditEntry,
  type HSMAuditQuery,
  type HSMHealthStatus,
  type HSMInitializationStatus,
  type HSMProviderType,
  type HSMKeyAlgorithm,
  type HSMKeyPurpose,
  type HSMKeyStatus,
  type HSMAuditOperation,
  type HSMErrorCode,

  // Provider configs
  type AWSCloudHSMConfig,
  type AzureKeyVaultConfig,
  type YubiHSMConfig,
  type HashiCorpVaultConfig,
  type SoftwareHSMConfig,

  // Error class
  HSMError,

  // Utility functions
  validateHSMConfig,
  validateKeySpec,
  generateSecureIV,
  uint8ArrayToHex,
  hexToUint8Array,
} from './types';

// Re-export constantTimeEqual from crypto utils
export { constantTimeEqual } from '../crypto/utils';
