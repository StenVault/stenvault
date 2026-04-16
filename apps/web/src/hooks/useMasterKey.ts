// Barrel re-exports — all logic lives in masterKey/ modules.
// Existing imports from '@/hooks/useMasterKey' continue to work unchanged.

// The hook itself
export { useMasterKey } from './masterKey/useMasterKeyHook';

// Standalone functions used by external consumers
export { clearMasterKeyCache } from './masterKey/sessionCache';
export { clearDeviceWrappedMK } from './masterKey/deviceKeyStore';

// Types used by external consumers
export type { MasterKeyConfig, UseMasterKeyReturn } from './masterKey/types';

// Re-exports from masterKeyCrypto (backward compat)
export { deriveThumbnailKeyFromMaster } from './masterKeyCrypto';
export type { DerivedFileKeyWithBytes, MasterKeyBundle } from './masterKeyCrypto';
