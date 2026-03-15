/**
 * P2P Transfer Constants
 * Shared constants for P2P transfer hooks
 */
import type { P2PTransferState } from "@/components/p2p/types";

/**
 * Threshold for using chunked transfer (100MB)
 * Files >= this size use ChunkSender (pull-based with SHA-256 verification)
 * Files < this size use FileSender (push-based, simpler)
 */
export const CHUNKED_THRESHOLD = 100 * 1024 * 1024;

// ============ Timing Constants ============

/**
 * Signaling poll interval in milliseconds
 * How often we check for new signals from the backend
 */
export const SIGNAL_POLL_INTERVAL_MS = 1000;

/**
 * Number of consecutive backend failures before switching to Trystero fallback
 */
export const BACKEND_FAIL_THRESHOLD = 3;

/**
 * Session timeout in milliseconds (for session not found detection)
 */
export const SESSION_NOT_FOUND_THRESHOLD = 5;

/**
 * WebRTC ICE gathering timeout in milliseconds
 */
export const ICE_GATHERING_TIMEOUT_MS = 10000;

/**
 * DataChannel buffer threshold for flow control (in bytes)
 * When bufferedAmount exceeds this, we pause sending
 */
export const DATA_CHANNEL_BUFFER_THRESHOLD = 16 * 1024 * 1024; // 16MB

/**
 * Initial transfer state
 */
export const INITIAL_TRANSFER_STATE: P2PTransferState = {
    status: "idle",
    progress: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    speed: 0,
    estimatedTimeRemaining: 0,
    isEncrypted: false,
    peerFingerprint: undefined,
    mode: "stream",
};
