/**
 * P2P Transfer Hooks
 * Barrel exports for P2P transfer functionality
 */

// Main hook - primary export
export { useP2PTransfer } from "./useP2PTransfer";

// Sub-hooks (for advanced usage or testing)
export { useP2PSession } from "./useP2PSession";
export { useP2PWebRTC } from "./useP2PWebRTC";
export { useP2PSignaling } from "./useP2PSignaling";
export { useP2PDataHandler } from "./useP2PDataHandler";
export { useP2PFileSender } from "./useP2PFileSender";

// Resumable transfers hook and utilities
export {
    useResumableTransfers,
    restoreFileAssembler,
    restoreChunkAssembler,
    getAllResumableTransfers,
    hasResumableState,
    formatBytes,
    formatRelativeTime,
} from "./useResumableTransfers";

// Serverless signaling hooks
export {
    useTrysteroSignaling,
    getMyPeerId,
    type TrysteroConfig,
    type TrysteroSignal,
    type TrysteroPeer,
} from "./useTrysteroSignaling";

// NOTE: useHybridSignaling is deprecated and moved to _archive/
// The simpler Trystero integration in useP2PSignaling.ts is the active implementation

// Types and constants
export * from "./types";
export * from "./constants";
