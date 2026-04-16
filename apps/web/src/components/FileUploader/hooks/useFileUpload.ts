// Barrel re-exports — all logic lives in useFileUpload/ modules.
// Existing imports from './hooks/useFileUpload' continue to work unchanged.

export { useFileUpload } from './useFileUpload/useFileUploadHook';

export type { UseFileUploadParams, UseFileUploadReturn, SigningContext } from './useFileUpload/types';
