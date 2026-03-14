/**
 * P2P Utilities - Barrel Exports
 * 
 * Centralized exports for P2P file transfer utilities.
 */

export {
    FileAssembler,
    type FileManifest,
    type ChunkData,
    type AssemblyProgress,
} from "./fileAssembler";

// Re-export crypto utils from platform (previously duplicated in fileAssembler)
export { base64ToArrayBuffer, arrayBufferToBase64 } from "@/lib/platform";

export {
    FileSender,
    type SendProgress,
    type FileSenderOptions,
} from "./fileSender";

export {
    initE2ESenderSession,
    initE2EReceiverSession,
    encryptChunk,
    decryptChunk,
    createE2EManifestData,
    requiresE2E,
    type E2ESession,
    type E2EManifestData,
} from "./e2eEncryption";

export {
    E2EFileSender,
    type E2EFileSenderOptions,
} from "./e2eFileSender";

export {
    IndexedDBTransferStorage,
    getTransferStorage,
    createTransferState,
    type ITransferStateStorage,
    type SavedTransferState,
    type TransferStateMetadata,
    type TransferProtocol,
    type TransferDirection,
} from "./transferStateStorage";
