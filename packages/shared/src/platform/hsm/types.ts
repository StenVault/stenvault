/**
 * Hardware Security Module (HSM) Provider Interface
 *
 * Platform-agnostic abstraction for HSM operations.
 * Supports multiple HSM backends:
 * - AWS CloudHSM (PKCS#11)
 * - Azure Key Vault
 * - HashiCorp Vault Transit
 * - YubiHSM 2
 * - Software fallback (development only)
 *
 * SECURITY NOTES:
 * - HSM protects SERVER-SIDE secrets only (maintains zero-knowledge for users)
 * - User master keys are NOT HSM-protected (would break zero-knowledge)
 * - All HSM operations are audited
 * - Keys marked extractable=false should NEVER leave the HSM
 *
 * Key Hierarchy:
 * ```
 * HSM Root Key (never exported)
 *   ├── Server Master Key (SMK) - Wraps server secrets
 *   │     ├── Shamir Share Encryption Key (SSEK)
 *   │     ├── Hybrid Key Protection Key (HKPK)
 *   │     └── Internal Secrets Key (ISK)
 *   └── Audit Key (AK) - Signs audit logs only
 * ```
 *
 * References:
 * - PKCS#11 v2.40: http://docs.oasis-open.org/pkcs11/pkcs11-base/v2.40/pkcs11-base-v2.40.html
 * - Azure Key Vault: https://docs.microsoft.com/en-us/azure/key-vault/
 * - HashiCorp Vault Transit: https://www.vaultproject.io/docs/secrets/transit
 */


export const HSM_CONSTANTS = {
  /** Supported HSM providers */
  PROVIDERS: ['aws-cloudhsm', 'azure-keyvault', 'yubihsm', 'hashicorp-vault', 'software'] as const,

  /** Supported key algorithms */
  KEY_ALGORITHMS: ['AES-256', 'AES-128', 'RSA-2048', 'RSA-4096', 'EC-P256', 'EC-P384', 'EC-P521'] as const,

  /** Key purposes */
  KEY_PURPOSES: ['wrap', 'encrypt', 'sign', 'derive'] as const,

  /** Key statuses */
  KEY_STATUSES: ['active', 'rotating', 'retired', 'destroyed'] as const,

  /** Audit operation types */
  AUDIT_OPERATIONS: [
    'initialize',
    'shutdown',
    'generateKey',
    'importKey',
    'destroyKey',
    'wrap',
    'unwrap',
    'encrypt',
    'decrypt',
    'sign',
    'verify',
    'rotateKey',
    'getKey',
    'listKeys',
  ] as const,

  /** Well-known key labels (standardized across providers) */
  KEY_LABELS: {
    /** HSM root key - never exported */
    ROOT_KEY: 'cloudvault-hsm-root',
    /** Server Master Key - wraps all server secrets */
    SERVER_MASTER_KEY: 'cloudvault-server-master',
    /** Shamir Share Encryption Key */
    SHAMIR_ENCRYPTION_KEY: 'cloudvault-shamir-encryption',
    /** Hybrid Key Protection Key (for KEM keys) */
    HYBRID_KEY_PROTECTION: 'cloudvault-hybrid-protection',
    /** Signature Key Protection Key (for signature keys) */
    SIGNATURE_KEY_PROTECTION: 'cloudvault-signature-protection',
    /** Internal Secrets Key (JWT, API keys) */
    INTERNAL_SECRETS_KEY: 'cloudvault-internal-secrets',
    /** Audit signing key */
    AUDIT_SIGNING_KEY: 'cloudvault-audit-signing',
  } as const,

  /** AES-256 key size in bytes */
  AES_256_KEY_SIZE: 32,

  /** GCM IV size in bytes */
  GCM_IV_SIZE: 12,

  /** GCM auth tag size in bytes */
  GCM_TAG_SIZE: 16,

  /** Maximum key label length */
  MAX_LABEL_LENGTH: 255,

  /** Key rotation grace period (both versions active) in hours */
  KEY_ROTATION_GRACE_PERIOD_HOURS: 24,

  /** Default connection timeout in milliseconds */
  DEFAULT_TIMEOUT_MS: 30_000,

  /** Health check interval in milliseconds */
  HEALTH_CHECK_INTERVAL_MS: 60_000,

  /** Maximum retries for HSM operations */
  MAX_RETRIES: 3,

  /** Retry backoff base in milliseconds */
  RETRY_BACKOFF_BASE_MS: 1_000,
} as const;


/**
 * Supported HSM provider identifiers
 */
export type HSMProviderType = (typeof HSM_CONSTANTS.PROVIDERS)[number];

/**
 * Supported key algorithms
 */
export type HSMKeyAlgorithm = (typeof HSM_CONSTANTS.KEY_ALGORITHMS)[number];

/**
 * Key purpose (what operations this key can perform)
 */
export type HSMKeyPurpose = (typeof HSM_CONSTANTS.KEY_PURPOSES)[number];

/**
 * Key lifecycle status
 */
export type HSMKeyStatus = (typeof HSM_CONSTANTS.KEY_STATUSES)[number];

/**
 * Audit operation type
 */
export type HSMAuditOperation = (typeof HSM_CONSTANTS.AUDIT_OPERATIONS)[number];


/**
 * AWS CloudHSM configuration
 *
 * Requires:
 * - CloudHSM cluster with at least one HSM
 * - Crypto User credentials
 * - PKCS#11 library installed
 */
export interface AWSCloudHSMConfig {
  /** CloudHSM cluster ID */
  clusterId: string;
  /** HSM IP address (or use cluster ENI) */
  hsmIp?: string;
  /** Path to customer CA certificate */
  customerCACertPath: string;
  /** Crypto User (CU) username */
  cryptoUser: string;
  /** Crypto User password (use secrets manager in production) */
  cryptoPassword: string;
  /** AWS region */
  region?: string;
  /** PKCS#11 library path (defaults to /opt/cloudhsm/lib/libcloudhsm_pkcs11.so) */
  pkcs11LibPath?: string;
}

/**
 * Azure Key Vault configuration
 *
 * Supports:
 * - Managed Identity (recommended for Azure workloads)
 * - Service Principal (for non-Azure or local dev)
 */
export interface AzureKeyVaultConfig {
  /** Key Vault URL (e.g., https://myvault.vault.azure.net) */
  vaultUrl: string;
  /** Azure AD tenant ID */
  tenantId: string;
  /** Application (client) ID */
  clientId: string;
  /** Client secret (not needed if using managed identity) */
  clientSecret?: string;
  /** Use managed identity instead of service principal */
  useManagedIdentity: boolean;
  /** Use HSM-backed keys (requires Premium tier) */
  useHsmBackedKeys?: boolean;
}

/**
 * YubiHSM 2 configuration
 *
 * Requires:
 * - yubihsm-connector running (usually localhost:12345)
 * - Authentication key credentials
 */
export interface YubiHSMConfig {
  /** Connector URL (e.g., http://localhost:12345) */
  connectorUrl: string;
  /** Authentication key ID (1-65534) */
  authKeyId: number;
  /** Authentication key password */
  authKeyPassword: string;
  /** Domain ID for key isolation (1-16) */
  domainId: number;
  /** Capability restrictions (optional) */
  capabilities?: string[];
}

/**
 * HashiCorp Vault Transit configuration
 *
 * The Transit secrets engine provides "encryption as a service".
 * This is often used as an HSM abstraction layer.
 *
 * Authentication options:
 * - Token (simple, less secure)
 * - AppRole (recommended for applications)
 * - Kubernetes (for K8s workloads)
 */
export interface HashiCorpVaultConfig {
  /** Vault server address */
  address: string;
  /** Static token (for simple setups, prefer AppRole) */
  token?: string;
  /** AppRole role ID */
  roleId?: string;
  /** AppRole secret ID */
  secretId?: string;
  /** Vault namespace (enterprise feature) */
  namespace?: string;
  /** Transit secrets engine mount path (default: 'transit') */
  transitMountPath?: string;
  /** TLS CA certificate path (for self-signed) */
  caCertPath?: string;
  /** Skip TLS verification (NEVER in production) */
  tlsSkipVerify?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Software HSM configuration (development/testing ONLY)
 *
 * WARNING: This provides NO hardware security guarantees.
 * Use ONLY for local development and testing.
 * NEVER use in production.
 */
export interface SoftwareHSMConfig {
  /** Enable software HSM (must be explicitly enabled) */
  enabled: boolean;
  /** Storage method for encrypted keys */
  storage: 'database' | 'file';
  /** File path for key storage (if storage='file') */
  masterKeyPath?: string;
  /** Encryption key for software HSM keys (derived from env secret) */
  encryptionSecret?: string;
}

/**
 * Combined HSM configuration
 * Only one provider should be configured at a time.
 */
export interface HSMConfig {
  /** Which provider to use */
  provider: HSMProviderType;

  /** Enable HSM (if false, HSM operations are no-ops or use fallback) */
  enabled: boolean;

  /** Provider-specific configuration */
  awsCloudHsm?: AWSCloudHSMConfig;
  azureKeyVault?: AzureKeyVaultConfig;
  yubiHsm?: YubiHSMConfig;
  hashicorpVault?: HashiCorpVaultConfig;
  software?: SoftwareHSMConfig;

  /** Connection timeout in milliseconds */
  timeout?: number;

  /** Enable automatic health checks */
  healthCheckEnabled?: boolean;

  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;

  /** Retry configuration */
  retries?: {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Base backoff time in milliseconds */
    backoffBaseMs: number;
    /** Maximum backoff time in milliseconds */
    maxBackoffMs: number;
  };
}


/**
 * Specification for creating a new HSM key
 */
export interface HSMKeySpec {
  /** Key algorithm */
  algorithm: HSMKeyAlgorithm;

  /** Key purpose(s) - what operations this key can perform */
  purpose: HSMKeyPurpose | HSMKeyPurpose[];

  /** Human-readable label (must be unique per provider) */
  label: string;

  /**
   * Whether the key can be exported from HSM
   * WARNING: Should ALWAYS be false for sensitive keys
   */
  extractable: boolean;

  /** Parent key ID (for key hierarchy) */
  parentKeyId?: string;

  /** Custom metadata to attach */
  metadata?: Record<string, string>;
}

/**
 * HSM key handle - reference to a key stored in the HSM
 * This is what you pass to cryptographic operations
 */
export interface HSMKeyHandle {
  /** HSM-internal key identifier */
  id: string;

  /** Human-readable label */
  label: string;

  /** Key algorithm */
  algorithm: HSMKeyAlgorithm;

  /** Key purpose(s) */
  purpose: HSMKeyPurpose[];

  /** Key version (for rotation tracking) */
  version: number;

  /** Current status */
  status: HSMKeyStatus;

  /** Provider this key belongs to */
  provider: HSMProviderType;

  /** Whether key is extractable */
  extractable: boolean;

  /** Creation timestamp */
  createdAt: Date;

  /** Last used timestamp (if tracked) */
  lastUsedAt?: Date;

  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Key info for listing (lighter than full handle)
 */
export interface HSMKeyInfo {
  /** HSM-internal key identifier */
  id: string;

  /** Human-readable label */
  label: string;

  /** Key algorithm */
  algorithm: HSMKeyAlgorithm;

  /** Key version */
  version: number;

  /** Current status */
  status: HSMKeyStatus;

  /** Creation timestamp */
  createdAt: Date;
}


/**
 * AES-GCM encryption result
 */
export interface HSMEncryptResult {
  /** Encrypted data */
  ciphertext: Uint8Array;

  /** Initialization vector (should be unique per encryption) */
  iv: Uint8Array;

  /** Authentication tag */
  tag: Uint8Array;

  /** Key version used (for decryption reference) */
  keyVersion: number;
}

/**
 * Key wrap result (wrapping one key with another)
 */
export interface HSMWrapResult {
  /** Wrapped key material */
  wrappedKey: Uint8Array;

  /** Wrapping key ID (for unwrap reference) */
  wrappingKeyId: string;

  /** Wrapping key version */
  wrappingKeyVersion: number;
}

/**
 * Digital signature result
 */
export interface HSMSignResult {
  /** Digital signature */
  signature: Uint8Array;

  /** Algorithm used */
  algorithm: string;

  /** Signing key version */
  keyVersion: number;
}

/**
 * Key rotation result
 */
export interface HSMKeyRotationResult {
  /** Old key handle (now retired) */
  oldHandle: HSMKeyHandle;

  /** New key handle (now active) */
  newHandle: HSMKeyHandle;

  /** Grace period end (when old key becomes inactive) */
  gracePeriodEndsAt: Date;
}


/**
 * Single audit log entry
 */
export interface HSMAuditEntry {
  /** Entry ID */
  id: string;

  /** Timestamp of operation */
  timestamp: Date;

  /** Operation performed */
  operation: HSMAuditOperation;

  /** HSM provider */
  provider: HSMProviderType;

  /** Key ID involved (if applicable) */
  keyId?: string;

  /** Key label (denormalized for querying) */
  keyLabel?: string;

  /** User ID (if user-initiated) */
  userId?: number;

  /** Service identity (if service-initiated) */
  serviceIdentity?: string;

  /** Operation succeeded */
  success: boolean;

  /** Error code (if failed) */
  errorCode?: string;

  /** Error message (if failed) */
  errorMessage?: string;

  /** Client IP address */
  ipAddress?: string;

  /** Request correlation ID */
  requestId?: string;

  /** Additional context */
  metadata?: Record<string, unknown>;

  /** HMAC signature of this entry (tamper detection) */
  signature?: string;
}

/**
 * Audit log query options
 */
export interface HSMAuditQuery {
  /** Start timestamp (inclusive) */
  since?: Date;

  /** End timestamp (exclusive) */
  until?: Date;

  /** Filter by operation type */
  operation?: HSMAuditOperation;

  /** Filter by key ID */
  keyId?: string;

  /** Filter by user ID */
  userId?: number;

  /** Filter by success/failure */
  success?: boolean;

  /** Maximum entries to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}


/**
 * HSM health status
 */
export interface HSMHealthStatus {
  /** Overall health */
  healthy: boolean;

  /** Provider type */
  provider: HSMProviderType;

  /** Provider-specific status */
  providerStatus: string;

  /** Connection latency in milliseconds */
  latencyMs: number;

  /** Last successful operation timestamp */
  lastSuccessAt?: Date;

  /** Last error (if any) */
  lastError?: string;

  /** Last error timestamp */
  lastErrorAt?: Date;

  /** Number of active keys */
  activeKeyCount: number;

  /** HSM-specific diagnostics */
  diagnostics?: Record<string, unknown>;
}

/**
 * HSM initialization status
 */
export interface HSMInitializationStatus {
  /** Initialization complete */
  initialized: boolean;

  /** Root key exists */
  rootKeyExists: boolean;

  /** Server master key exists */
  serverMasterKeyExists: boolean;

  /** Required derived keys exist */
  derivedKeysExist: boolean;

  /** Audit key exists */
  auditKeyExists: boolean;

  /** Missing keys (if any) */
  missingKeys: string[];

  /** Initialization timestamp */
  initializedAt?: Date;
}


/**
 * HSM-specific error codes
 */
export const HSM_ERROR_CODES = {
  // Connection errors
  CONNECTION_FAILED: 'HSM_CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'HSM_CONNECTION_TIMEOUT',
  AUTHENTICATION_FAILED: 'HSM_AUTHENTICATION_FAILED',

  // Key errors
  KEY_NOT_FOUND: 'HSM_KEY_NOT_FOUND',
  KEY_ALREADY_EXISTS: 'HSM_KEY_ALREADY_EXISTS',
  KEY_DESTROYED: 'HSM_KEY_DESTROYED',
  KEY_WRONG_TYPE: 'HSM_KEY_WRONG_TYPE',
  KEY_NOT_EXTRACTABLE: 'HSM_KEY_NOT_EXTRACTABLE',

  // Operation errors
  OPERATION_NOT_PERMITTED: 'HSM_OPERATION_NOT_PERMITTED',
  INVALID_PARAMETER: 'HSM_INVALID_PARAMETER',
  CRYPTOGRAPHIC_ERROR: 'HSM_CRYPTOGRAPHIC_ERROR',
  INTEGRITY_CHECK_FAILED: 'HSM_INTEGRITY_CHECK_FAILED',

  // Capacity errors
  HSM_FULL: 'HSM_FULL',
  RATE_LIMITED: 'HSM_RATE_LIMITED',

  // Provider errors
  PROVIDER_NOT_AVAILABLE: 'HSM_PROVIDER_NOT_AVAILABLE',
  PROVIDER_ERROR: 'HSM_PROVIDER_ERROR',

  // Configuration errors
  INVALID_CONFIGURATION: 'HSM_INVALID_CONFIGURATION',
  NOT_INITIALIZED: 'HSM_NOT_INITIALIZED',
} as const;

export type HSMErrorCode = (typeof HSM_ERROR_CODES)[keyof typeof HSM_ERROR_CODES];

/**
 * HSM operation error
 */
export class HSMError extends Error {
  constructor(
    public readonly code: HSMErrorCode,
    message: string,
    public readonly provider?: HSMProviderType,
    public readonly operation?: HSMAuditOperation,
    public readonly keyId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'HSMError';

    // Maintains proper stack trace (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HSMError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      operation: this.operation,
      keyId: this.keyId,
      cause: this.cause?.message,
    };
  }
}


/**
 * HSM Provider Interface
 *
 * All HSM implementations must implement this interface.
 * Operations are designed to be atomic and auditable.
 *
 * SECURITY REQUIREMENTS:
 * 1. All operations MUST be logged to audit trail
 * 2. Keys with extractable=false MUST NOT be exportable
 * 3. Root keys MUST be generated inside HSM, never imported
 * 4. All network communication MUST use TLS 1.2+
 * 5. Credentials MUST NOT be logged
 */
export interface HSMProvider {

  /**
   * Initialize connection to HSM
   *
   * @param config - Provider-specific configuration
   * @throws HSMError if connection fails
   */
  initialize(config: HSMConfig): Promise<void>;

  /**
   * Check if HSM is available and responsive
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get detailed health status
   */
  getHealthStatus(): Promise<HSMHealthStatus>;

  /**
   * Gracefully close HSM connection
   * Should complete in-flight operations before closing
   */
  shutdown(): Promise<void>;


  /**
   * Generate a new key inside the HSM
   *
   * The key is generated using the HSM's secure RNG.
   * If extractable=false, the key can NEVER leave the HSM.
   *
   * @param spec - Key specification
   * @returns Handle to the new key
   * @throws HSMError if generation fails
   */
  generateKey(spec: HSMKeySpec): Promise<HSMKeyHandle>;

  /**
   * Import an existing key into the HSM
   *
   * WARNING: Only use for migration scenarios.
   * For new keys, always use generateKey().
   *
   * @param keyData - Raw key material
   * @param spec - Key specification
   * @returns Handle to the imported key
   * @throws HSMError if import fails
   */
  importKey(keyData: Uint8Array, spec: HSMKeySpec): Promise<HSMKeyHandle>;

  /**
   * Get a key handle by ID
   *
   * @param keyId - HSM key ID
   * @returns Key handle or null if not found
   */
  getKey(keyId: string): Promise<HSMKeyHandle | null>;

  /**
   * Get a key handle by label
   *
   * @param label - Key label
   * @returns Key handle or null if not found
   */
  getKeyByLabel(label: string): Promise<HSMKeyHandle | null>;

  /**
   * List all keys matching criteria
   *
   * @param filter - Optional filter criteria
   * @returns List of key info
   */
  listKeys(filter?: {
    status?: HSMKeyStatus;
    algorithm?: HSMKeyAlgorithm;
    labelPrefix?: string;
  }): Promise<HSMKeyInfo[]>;

  /**
   * Destroy a key (permanent, irreversible)
   *
   * WARNING: This operation is irreversible.
   * Any data encrypted with this key will be irrecoverable.
   *
   * @param handle - Key to destroy
   * @throws HSMError if destruction fails
   */
  destroyKey(handle: HSMKeyHandle): Promise<void>;


  /**
   * Wrap (encrypt) data with a wrapping key
   *
   * Used for protecting keys and secrets at rest.
   * The wrapping key must have 'wrap' purpose.
   *
   * @param plaintext - Data to wrap
   * @param wrappingKeyHandle - Key to use for wrapping
   * @returns Wrapped data
   * @throws HSMError if operation fails
   */
  wrap(plaintext: Uint8Array, wrappingKeyHandle: HSMKeyHandle): Promise<HSMWrapResult>;

  /**
   * Unwrap (decrypt) data with a wrapping key
   *
   * @param wrappedData - Data to unwrap
   * @param wrappingKeyHandle - Key to use for unwrapping
   * @returns Unwrapped plaintext
   * @throws HSMError if operation fails or integrity check fails
   */
  unwrap(wrappedData: Uint8Array, wrappingKeyHandle: HSMKeyHandle): Promise<Uint8Array>;

  /**
   * Encrypt data with AES-GCM
   *
   * The key must have 'encrypt' purpose.
   * IV is generated securely if not provided.
   *
   * @param plaintext - Data to encrypt
   * @param keyHandle - Encryption key
   * @param iv - Optional IV (generated if not provided)
   * @param aad - Optional additional authenticated data
   * @returns Encryption result with ciphertext, IV, and tag
   * @throws HSMError if operation fails
   */
  encrypt(
    plaintext: Uint8Array,
    keyHandle: HSMKeyHandle,
    iv?: Uint8Array,
    aad?: Uint8Array
  ): Promise<HSMEncryptResult>;

  /**
   * Decrypt data with AES-GCM
   *
   * @param ciphertext - Encrypted data
   * @param keyHandle - Decryption key
   * @param iv - IV used during encryption
   * @param tag - Authentication tag
   * @param aad - Additional authenticated data (must match encryption)
   * @returns Decrypted plaintext
   * @throws HSMError if decryption fails or authentication fails
   */
  decrypt(
    ciphertext: Uint8Array,
    keyHandle: HSMKeyHandle,
    iv: Uint8Array,
    tag: Uint8Array,
    aad?: Uint8Array
  ): Promise<Uint8Array>;

  /**
   * Sign data with a signing key
   *
   * The key must have 'sign' purpose.
   * Algorithm depends on key type (ECDSA for EC, RSA-PSS for RSA).
   *
   * @param data - Data to sign
   * @param keyHandle - Signing key
   * @returns Signature
   * @throws HSMError if operation fails
   */
  sign(data: Uint8Array, keyHandle: HSMKeyHandle): Promise<HSMSignResult>;

  /**
   * Verify a signature
   *
   * @param data - Original data
   * @param signature - Signature to verify
   * @param keyHandle - Verification key (public key or same as signing key)
   * @returns True if signature is valid
   * @throws HSMError if verification fails (not for invalid signature)
   */
  verify(data: Uint8Array, signature: Uint8Array, keyHandle: HSMKeyHandle): Promise<boolean>;


  /**
   * Rotate a key to a new version
   *
   * Creates a new key version while keeping the old one active
   * during the grace period. After grace period, old key is retired.
   *
   * @param handle - Key to rotate
   * @param newSpec - Optional new specification (defaults to same as current)
   * @returns Rotation result with old and new handles
   * @throws HSMError if rotation fails
   */
  rotateKey(handle: HSMKeyHandle, newSpec?: Partial<HSMKeySpec>): Promise<HSMKeyRotationResult>;


  /**
   * Query audit log
   *
   * Returns audit entries matching the query criteria.
   * Entries are ordered by timestamp descending (newest first).
   *
   * @param query - Query options
   * @returns Matching audit entries
   */
  getAuditLog(query?: HSMAuditQuery): Promise<HSMAuditEntry[]>;


  /**
   * Check if HSM is fully initialized with required keys
   */
  getInitializationStatus(): Promise<HSMInitializationStatus>;

  /**
   * Initialize HSM with required key hierarchy
   *
   * This is a one-time operation that:
   * 1. Generates root key (if not exists)
   * 2. Derives server master key
   * 3. Derives functional keys (Shamir, Hybrid, Internal)
   * 4. Generates audit signing key
   *
   * Should be run during first deployment or key ceremony.
   *
   * @param adminUserId - User performing initialization (for audit)
   * @throws HSMError if already initialized or initialization fails
   */
  initializeKeyHierarchy(adminUserId?: number): Promise<void>;
}

/**
 * Factory function type for creating HSM providers
 */
export type HSMProviderFactory = (config: HSMConfig) => HSMProvider;


/**
 * Validate HSM configuration
 *
 * @param config - Configuration to validate
 * @throws HSMError if configuration is invalid
 */
export function validateHSMConfig(config: HSMConfig): void {
  if (!config.provider) {
    throw new HSMError(
      HSM_ERROR_CODES.INVALID_CONFIGURATION,
      'HSM provider type is required'
    );
  }

  if (!HSM_CONSTANTS.PROVIDERS.includes(config.provider)) {
    throw new HSMError(
      HSM_ERROR_CODES.INVALID_CONFIGURATION,
      `Invalid HSM provider: ${config.provider}. Valid providers: ${HSM_CONSTANTS.PROVIDERS.join(', ')}`
    );
  }

  // Validate provider-specific config
  switch (config.provider) {
    case 'aws-cloudhsm':
      if (!config.awsCloudHsm) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'AWS CloudHSM configuration is required'
        );
      }
      if (!config.awsCloudHsm.clusterId || !config.awsCloudHsm.cryptoUser) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'AWS CloudHSM requires clusterId and cryptoUser'
        );
      }
      break;

    case 'azure-keyvault':
      if (!config.azureKeyVault) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'Azure Key Vault configuration is required'
        );
      }
      if (!config.azureKeyVault.vaultUrl || !config.azureKeyVault.tenantId) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'Azure Key Vault requires vaultUrl and tenantId'
        );
      }
      break;

    case 'yubihsm':
      if (!config.yubiHsm) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'YubiHSM configuration is required'
        );
      }
      if (!config.yubiHsm.connectorUrl || !config.yubiHsm.authKeyId) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'YubiHSM requires connectorUrl and authKeyId'
        );
      }
      break;

    case 'hashicorp-vault':
      if (!config.hashicorpVault) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'HashiCorp Vault configuration is required'
        );
      }
      if (!config.hashicorpVault.address) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'HashiCorp Vault requires address'
        );
      }
      if (!config.hashicorpVault.token && !config.hashicorpVault.roleId) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'HashiCorp Vault requires either token or roleId/secretId'
        );
      }
      break;

    case 'software':
      if (!config.software?.enabled) {
        throw new HSMError(
          HSM_ERROR_CODES.INVALID_CONFIGURATION,
          'Software HSM must be explicitly enabled'
        );
      }
      // Log warning about software HSM
      console.warn(
        'WARNING: Software HSM is enabled. This provides NO hardware security guarantees. ' +
        'Use ONLY for development and testing. NEVER use in production.'
      );
      break;
  }
}

/**
 * Validate key specification
 *
 * @param spec - Key specification to validate
 * @throws HSMError if specification is invalid
 */
export function validateKeySpec(spec: HSMKeySpec): void {
  if (!spec.algorithm || !HSM_CONSTANTS.KEY_ALGORITHMS.includes(spec.algorithm)) {
    throw new HSMError(
      HSM_ERROR_CODES.INVALID_PARAMETER,
      `Invalid key algorithm: ${spec.algorithm}. Valid algorithms: ${HSM_CONSTANTS.KEY_ALGORITHMS.join(', ')}`
    );
  }

  const purposes = Array.isArray(spec.purpose) ? spec.purpose : [spec.purpose];
  for (const purpose of purposes) {
    if (!HSM_CONSTANTS.KEY_PURPOSES.includes(purpose)) {
      throw new HSMError(
        HSM_ERROR_CODES.INVALID_PARAMETER,
        `Invalid key purpose: ${purpose}. Valid purposes: ${HSM_CONSTANTS.KEY_PURPOSES.join(', ')}`
      );
    }
  }

  if (!spec.label || spec.label.length === 0) {
    throw new HSMError(HSM_ERROR_CODES.INVALID_PARAMETER, 'Key label is required');
  }

  if (spec.label.length > HSM_CONSTANTS.MAX_LABEL_LENGTH) {
    throw new HSMError(
      HSM_ERROR_CODES.INVALID_PARAMETER,
      `Key label must be <= ${HSM_CONSTANTS.MAX_LABEL_LENGTH} characters`
    );
  }

  // Validate algorithm/purpose compatibility
  if (spec.algorithm.startsWith('AES')) {
    if (purposes.includes('sign')) {
      throw new HSMError(
        HSM_ERROR_CODES.INVALID_PARAMETER,
        'AES keys cannot be used for signing'
      );
    }
  }

  if (spec.algorithm.startsWith('EC') || spec.algorithm.startsWith('RSA')) {
    if (purposes.includes('wrap') && !purposes.includes('encrypt')) {
      // RSA/EC for wrapping typically also needs encrypt
      console.warn('Key with wrap purpose should typically also have encrypt purpose');
    }
  }
}

/**
 * Generate a secure random IV for AES-GCM
 *
 * @returns 12-byte IV
 */
export function generateSecureIV(): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Browser/Node.js with Web Crypto
    return crypto.getRandomValues(new Uint8Array(HSM_CONSTANTS.GCM_IV_SIZE));
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    return new Uint8Array(nodeCrypto.randomBytes(HSM_CONSTANTS.GCM_IV_SIZE));
  }
}

/**
 * Convert Uint8Array to hex string
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Note: constantTimeEqual is already exported from ../crypto/utils
// Import it from there: import { constantTimeEqual } from '@cloudvault/shared/platform/crypto';
