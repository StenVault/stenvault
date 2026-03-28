/**
 * useLocalTransfer — Transfer Orchestration Hook for Local Send
 *
 * Manages the full lifecycle:
 *   Sender: selectFiles → requestTransfer → exchange signals → ECDH key exchange
 *           → setup WebRTC DataChannel → encrypt+send chunks (multi-file)
 *   Receiver: acceptTransfer → exchange signals → ECDH key exchange
 *             → receive chunks → decrypt → assemble → save (per file)
 *
 * Multi-file protocol (N > 1):
 *   session_manifest → (manifest + chunks + file_complete) × N → session_complete
 * Single-file optimization (N = 1):
 *   manifest + chunks + complete (backward compatible)
 *
 * Resume: Receiver saves decrypted chunks to IndexedDB on disconnect. When sender
 * retries the same file, receiver restores from IndexedDB and sends a resume message
 * so the sender skips already-received chunks.
 *
 * Reuses FileAssembler from the P2P module for chunked WebRTC transfer.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { FileAssembler, type FileManifest } from "@/lib/p2p/fileAssembler";
import { WEBRTC_CHUNK_SIZE } from "@stenvault/shared/core/transfer";
import {
  generateECDHKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKey,
  encryptChunk,
  decryptChunk,
  generateVerificationCode,
} from "@/lib/localE2E";
import { hapticSuccess } from "@/lib/haptics";
import type { SignalData, TransferRequest } from "./useLocalSSE";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type TransferState =
  | "idle"
  | "requesting"
  | "waiting_accept"
  | "connecting"
  | "transferring"
  | "completed"
  | "error";

export interface TransferProgress {
  percent: number;
  bytesSent: number;
  totalBytes: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
}

export interface ResumableTransfer {
  sessionId: string;
  fileName: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  updatedAt: number;
}

export interface UseLocalTransferReturn {
  state: TransferState;
  progress: TransferProgress;
  verificationCode: string | null;
  error: string | null;
  resumableTransfers: ResumableTransfer[];
  /** Sender: initiate transfer to a receiver */
  sendToReceiver: (receiverId: string, files: File[], peerId: string) => void;
  /** Receiver: accept incoming transfer */
  acceptTransfer: (request: TransferRequest, peerId: string) => void;
  /** Receiver: reject incoming transfer */
  rejectTransfer: (sessionId: string) => void;
  /** Cancel an in-progress transfer (either side) */
  cancelTransfer: () => void;
  /** Handle transfer_cancelled SSE event from peer */
  handleTransferCancelled: (sessionId: string) => void;
  /** Handle incoming signal from SSE */
  handleSignal: (signal: SignalData) => void;
  /** Reset to idle */
  reset: () => void;
  /** Discard a resumable transfer from IndexedDB */
  discardResumable: (sessionId: string) => Promise<void>;
  /** Refresh the list of resumable transfers */
  refreshResumable: () => void;
  /** Callback invoked when transfer resets to idle (for re-registration) */
  onReset: React.MutableRefObject<(() => void) | null>;
}

// ═══════════════════════════════════════════════════════════════════
// COMPLETION SOUND
// ═══════════════════════════════════════════════════════════════════

function playCompletionSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // Audio not available — non-critical
  }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════

const INITIAL_PROGRESS: TransferProgress = {
  percent: 0,
  bytesSent: 0,
  totalBytes: 0,
  speed: 0,
  eta: 0,
  currentFileIndex: 0,
  totalFiles: 0,
  currentFileName: "",
};

const WAITING_ACCEPT_TIMEOUT = 60_000; // 60s for receiver to accept
const CONNECTING_TIMEOUT = 15_000; // 15s for WebRTC connection

export function useLocalTransfer(): UseLocalTransferReturn {
  const [state, setState] = useState<TransferState>("idle");
  const [progress, setProgress] = useState<TransferProgress>(INITIAL_PROGRESS);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumableTransfers, setResumableTransfers] = useState<ResumableTransfer[]>([]);

  // Refs for WebRTC/crypto state (not in React state to avoid re-renders)
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const ecdhKeysRef = useRef<CryptoKeyPair | null>(null);
  const sharedKeyRef = useRef<CryptoKey | null>(null);
  const myPubKeyB64Ref = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const roleRef = useRef<"sender" | "receiver">("sender");
  const filesRef = useRef<File[]>([]);
  const assemblerRef = useRef<FileAssembler | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<TransferState>("idle");

  // Keep stateRef in sync with state (avoids stale closures in WebRTC callbacks)
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Completion feedback
  useEffect(() => {
    if (state === "completed") {
      playCompletionSound();
      hapticSuccess();
    }
  }, [state]);

  // Load resumable transfers on mount
  const refreshResumable = useCallback(() => {
    FileAssembler.listResumableTransfers()
      .then(setResumableTransfers)
      .catch(() => setResumableTransfers([]));
  }, []);

  useEffect(() => {
    refreshResumable();
  }, [refreshResumable]);

  // tRPC mutations
  const requestTransferMut = trpc.localSend.requestTransfer.useMutation();
  const respondTransferMut = trpc.localSend.respondTransfer.useMutation();
  const sendSignalMut = trpc.localSend.sendSignal.useMutation();
  const cancelTransferMut = trpc.localSend.cancelTransfer.useMutation();

  // Callback ref for re-registration after reset
  const onResetRef = useRef<(() => void) | null>(null);

  // Ref for WebRTC disconnected grace period timer
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── WakeLock ───
  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Not critical
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ─── Fail Transfer (DRY error setter) ───
  const failTransfer = useCallback(
    (msg: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }

      // Save receiver assembler state on unexpected disconnect
      if (roleRef.current === "receiver" && assemblerRef.current) {
        const assembler = assemblerRef.current;
        if (!assembler.isComplete() && assembler.getProgress().completedChunks > 0) {
          assembler.saveState().catch(() => {});
          refreshResumable();
        }
      }

      setError(msg);
      setState("error");
      releaseWakeLock();
      dcRef.current?.close();
      pcRef.current?.close();
      pcRef.current = null;
      dcRef.current = null;
    },
    [releaseWakeLock, refreshResumable],
  );

  // ─── Discard resumable transfer ───
  const discardResumable = useCallback(
    async (sessionId: string) => {
      const assembler = await FileAssembler.restoreFromState(sessionId);
      if (assembler) {
        await assembler.deleteSavedState();
      }
      refreshResumable();
    },
    [refreshResumable],
  );

  // ─── Reset ───
  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    dcRef.current?.close();
    pcRef.current?.close();
    pcRef.current = null;
    dcRef.current = null;
    ecdhKeysRef.current = null;
    sharedKeyRef.current = null;
    myPubKeyB64Ref.current = null;
    sessionIdRef.current = null;
    peerIdRef.current = null;
    filesRef.current = [];
    assemblerRef.current = null;
    releaseWakeLock();
    setState("idle");
    setProgress(INITIAL_PROGRESS);
    setVerificationCode(null);
    setError(null);
    refreshResumable();
    onResetRef.current?.();
  }, [releaseWakeLock, refreshResumable]);

  // ─── ECDH setup ───
  const setupECDH = useCallback(async () => {
    const keys = await generateECDHKeyPair();
    ecdhKeysRef.current = keys;
    myPubKeyB64Ref.current = await exportPublicKey(keys.publicKey);
    return myPubKeyB64Ref.current;
  }, []);

  // ─── Create RTCPeerConnection ───
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && sessionIdRef.current && peerIdRef.current) {
        sendSignalMut.mutate({
          sessionId: sessionIdRef.current,
          peerId: peerIdRef.current,
          type: "ice",
          data: JSON.stringify(event.candidate),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        failTransfer("Connection lost");
      } else if (pc.connectionState === "disconnected") {
        // Grace period: WebRTC may recover from transient disconnects
        disconnectTimerRef.current = setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            failTransfer("Connection lost");
          }
        }, 2000);
      } else if (pc.connectionState === "connected") {
        // Clear grace period timer if connection recovers
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
      }
    };

    return pc;
  }, [sendSignalMut, failTransfer]);

  // ─── Handle received data on DataChannel (receiver side) ───
  const setupReceiverDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dcRef.current = dc;
      dc.binaryType = "arraybuffer";

      let currentFileIndex = 0;
      let totalFiles = 1;
      let isMultiFile = false;
      let transferStartTime = 0;
      let totalSessionBytes = 0;
      let sessionBytesSent = 0;
      let fileComplete = false;
      let pendingDecrypts = 0;

      dc.onerror = () => failTransfer("Connection error");
      dc.onclose = () => {
        if (stateRef.current === "transferring" || stateRef.current === "connecting") {
          failTransfer("Peer disconnected");
        }
      };

      const tryDownload = () => {
        if (fileComplete && pendingDecrypts === 0 && assemblerRef.current?.isComplete()) {
          assemblerRef.current.downloadFile();
          // Clean up saved state for this file (it's complete)
          assemblerRef.current.deleteSavedState().catch(() => {});
          assemblerRef.current = null;
          fileComplete = false;
        }
      };

      dc.onmessage = async (event) => {
        const aesKey = sharedKeyRef.current;
        if (!aesKey) return;

        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);

          if (msg.type === "session_manifest") {
            isMultiFile = true;
            totalFiles = msg.totalFiles;
            totalSessionBytes = msg.files.reduce(
              (sum: number, f: { size: number }) => sum + f.size,
              0,
            );
            currentFileIndex = 0;
            sessionBytesSent = 0;
            transferStartTime = Date.now();
            setProgress((p) => ({
              ...p,
              totalBytes: totalSessionBytes,
              totalFiles,
              currentFileIndex: 0,
              currentFileName: msg.files[0]?.name ?? "",
            }));
          } else if (msg.type === "manifest") {
            const manifest: FileManifest = {
              fileName: msg.fileName,
              fileSize: msg.fileSize,
              mimeType: msg.mimeType,
              totalChunks: msg.totalChunks,
            };

            // Check for resumable state matching this file
            let restored = false;
            try {
              const resumables = await FileAssembler.listResumableTransfers();
              const match = resumables.find(
                (r) => r.fileName === msg.fileName && r.totalBytes === msg.fileSize,
              );
              if (match) {
                const saved = await FileAssembler.restoreFromState(match.sessionId);
                if (saved) {
                  assemblerRef.current = saved;
                  restored = true;
                  sessionBytesSent += saved.getProgress().bytesReceived;

                  // Tell sender which chunks we already have
                  const receivedChunks = Array.from(
                    { length: msg.totalChunks },
                    (_, i) => i,
                  ).filter((i) => !saved.getMissingChunks().includes(i));

                  if (receivedChunks.length > 0) {
                    dc.send(
                      JSON.stringify({
                        type: "resume",
                        fileIndex: msg.fileIndex ?? 0,
                        receivedChunks,
                      }),
                    );
                  }
                }
              }
            } catch {
              // IndexedDB not available — no resume
            }

            if (!restored) {
              const sessionId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              assemblerRef.current = new FileAssembler(manifest, {
                sessionId,
                autoPersist: true,
                isE2E: true,
              });
            }
            fileComplete = false;

            if (!isMultiFile) {
              totalFiles = 1;
              totalSessionBytes = msg.fileSize;
              transferStartTime = Date.now();
              if (!restored) sessionBytesSent = 0;
            }
            if (msg.fileIndex !== undefined) {
              currentFileIndex = msg.fileIndex;
            }
            setProgress((p) => ({
              ...p,
              totalBytes: totalSessionBytes,
              totalFiles,
              currentFileIndex,
              currentFileName: msg.fileName,
            }));
          } else if (msg.type === "file_complete") {
            fileComplete = true;
            tryDownload();
          } else if (msg.type === "complete" || msg.type === "session_complete") {
            if (!isMultiFile) {
              fileComplete = true;
              tryDownload();
            }
            setState("completed");
            releaseWakeLock();
            refreshResumable();
          }
        } else {
          // Binary chunk: [4-byte chunkIdx][encrypted data]
          const buf = event.data as ArrayBuffer;
          const view = new DataView(buf);
          const idx = view.getUint32(0, false);
          const encryptedData = new Uint8Array(buf, 4);

          pendingDecrypts++;
          try {
            const fileIdx = isMultiFile ? currentFileIndex : 0;
            const decrypted = await decryptChunk(encryptedData, aesKey, idx, fileIdx);
            assemblerRef.current?.addChunk({ index: idx, data: decrypted.buffer as ArrayBuffer });

            sessionBytesSent += decrypted.byteLength;
            const elapsed = (Date.now() - transferStartTime) / 1000;
            const speed = elapsed > 0 ? sessionBytesSent / elapsed : 0;
            setProgress({
              percent: totalSessionBytes > 0
                ? Math.round((sessionBytesSent / totalSessionBytes) * 100)
                : 0,
              bytesSent: sessionBytesSent,
              totalBytes: totalSessionBytes,
              speed,
              eta: speed > 0 ? (totalSessionBytes - sessionBytesSent) / speed : 0,
              currentFileIndex,
              totalFiles,
              currentFileName: assemblerRef.current?.getManifest().fileName ?? "",
            });
          } catch (err) {
            // Decrypt failure — non-critical, chunk will be missing
          } finally {
            pendingDecrypts--;
            tryDownload();
          }
        }
      };
    },
    [releaseWakeLock, failTransfer, refreshResumable],
  );

  // ─── Sender: send files via DataChannel ───
  const startSending = useCallback(
    async (dc: RTCDataChannel, files: File[], aesKey: CryptoKey) => {
      setState("transferring");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      await acquireWakeLock();

      // Track chunks to skip per file (populated by resume messages from receiver)
      const skipChunks = new Map<number, Set<number>>();

      // Listen for resume messages from receiver
      dc.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "resume" && Array.isArray(msg.receivedChunks)) {
              skipChunks.set(msg.fileIndex ?? 0, new Set(msg.receivedChunks));
            }
          } catch {
            // Ignore invalid messages
          }
        }
      };

      try {
        const chunkSize = WEBRTC_CHUNK_SIZE;
        const totalSessionBytes = files.reduce((sum, f) => sum + f.size, 0);
        const startTime = Date.now();
        let sessionBytesSent = 0;
        const isMulti = files.length > 1;

        if (isMulti) {
          dc.send(
            JSON.stringify({
              type: "session_manifest",
              totalFiles: files.length,
              files: files.map((f) => ({
                name: f.name,
                size: f.size,
                type: f.type || "application/octet-stream",
              })),
            }),
          );
        }

        for (let fi = 0; fi < files.length; fi++) {
          const file = files[fi]!;
          const totalChunks = Math.ceil(file.size / chunkSize) || 1;

          dc.send(
            JSON.stringify({
              type: "manifest",
              fileIndex: fi,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type || "application/octet-stream",
              totalChunks,
            }),
          );

          // Brief yield to allow receiver to send resume message
          await new Promise((r) => setTimeout(r, 50));

          const fileSkip = skipChunks.get(isMulti ? fi : 0);

          for (let i = 0; i < totalChunks; i++) {
            const chunkStart = i * chunkSize;
            const chunkEnd = Math.min(chunkStart + chunkSize, file.size);
            const chunkBytes = chunkEnd - chunkStart;

            // Skip chunks the receiver already has (resume)
            if (fileSkip?.has(i)) {
              sessionBytesSent += chunkBytes;
              // Update progress for skipped chunks
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = elapsed > 0 ? sessionBytesSent / elapsed : 0;
              setProgress({
                percent: Math.round((sessionBytesSent / totalSessionBytes) * 100),
                bytesSent: sessionBytesSent,
                totalBytes: totalSessionBytes,
                speed,
                eta: speed > 0 ? (totalSessionBytes - sessionBytesSent) / speed : 0,
                currentFileIndex: fi,
                totalFiles: files.length,
                currentFileName: file.name,
              });
              continue;
            }

            const blob = file.slice(chunkStart, chunkEnd);
            const raw = await blob.arrayBuffer();

            const encrypted = await encryptChunk(
              new Uint8Array(raw),
              aesKey,
              i,
              isMulti ? fi : 0,
            );

            const framed = new ArrayBuffer(4 + encrypted.byteLength);
            new DataView(framed).setUint32(0, i, false);
            new Uint8Array(framed).set(encrypted, 4);

            // Flow control
            while (dc.bufferedAmount > 1024 * 1024) {
              await new Promise((r) => setTimeout(r, 10));
            }

            dc.send(framed);
            sessionBytesSent += raw.byteLength;

            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? sessionBytesSent / elapsed : 0;
            const remaining = totalSessionBytes - sessionBytesSent;
            setProgress({
              percent: Math.round((sessionBytesSent / totalSessionBytes) * 100),
              bytesSent: sessionBytesSent,
              totalBytes: totalSessionBytes,
              speed,
              eta: speed > 0 ? remaining / speed : 0,
              currentFileIndex: fi,
              totalFiles: files.length,
              currentFileName: file.name,
            });
          }

          if (isMulti) {
            dc.send(JSON.stringify({ type: "file_complete", fileIndex: fi }));
          }
        }

        dc.send(JSON.stringify({ type: isMulti ? "session_complete" : "complete" }));
        setState("completed");
        releaseWakeLock();
      } catch (err) {
        failTransfer(
          "Transfer failed: " + (err instanceof Error ? err.message : "unknown error"),
        );
      }
    },
    [acquireWakeLock, releaseWakeLock, failTransfer],
  );

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API: SENDER FLOW
  // ═══════════════════════════════════════════════════════════════════

  const sendToReceiver = useCallback(
    async (receiverId: string, files: File[], peerId: string) => {
      if (stateRef.current !== "idle") return;
      if (files.length === 0) return;

      try {
        setState("requesting");
        roleRef.current = "sender";
        filesRef.current = files;
        peerIdRef.current = peerId;

        await setupECDH();

        const result = await requestTransferMut.mutateAsync({
          peerId,
          receiverId,
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type || "application/octet-stream",
          })),
        });

        sessionIdRef.current = result.sessionId;
        setState("waiting_accept");

        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "waiting_accept") {
            failTransfer("No response — request timed out");
          }
        }, WAITING_ACCEPT_TIMEOUT);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transfer request failed");
        setState("error");
      }
    },
    [setupECDH, requestTransferMut, failTransfer],
  );

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API: RECEIVER FLOW
  // ═══════════════════════════════════════════════════════════════════

  const acceptTransfer = useCallback(
    async (request: TransferRequest, peerId: string) => {
      if (stateRef.current !== "idle") return;

      try {
        setState("connecting");
        roleRef.current = "receiver";
        peerIdRef.current = peerId;
        sessionIdRef.current = request.sessionId;

        await setupECDH();

        await respondTransferMut.mutateAsync({
          sessionId: request.sessionId,
          accept: true,
        });

        createPeerConnection();

        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "connecting") {
            failTransfer("Connection timed out");
          }
        }, CONNECTING_TIMEOUT);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Accept failed",
        );
        setState("error");
      }
    },
    [setupECDH, respondTransferMut, createPeerConnection, failTransfer],
  );

  const rejectTransfer = useCallback(
    (sessionId: string) => {
      respondTransferMut.mutate({ sessionId, accept: false });
    },
    [respondTransferMut],
  );

  // ─── Cancel Transfer (either side) ───
  const cancelTransfer = useCallback(() => {
    const sid = sessionIdRef.current;
    const pid = peerIdRef.current;
    if (sid && pid) {
      cancelTransferMut.mutate({ sessionId: sid, peerId: pid });
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    dcRef.current?.close();
    pcRef.current?.close();
    pcRef.current = null;
    dcRef.current = null;
    releaseWakeLock();
    setState("idle");
    setProgress(INITIAL_PROGRESS);
    setVerificationCode(null);
    setError(null);
    sessionIdRef.current = null;
    onResetRef.current?.();
  }, [cancelTransferMut, releaseWakeLock]);

  // ─── Handle transfer_cancelled from peer ───
  const handleTransferCancelled = useCallback(
    (sessionId: string) => {
      if (sessionIdRef.current === sessionId || !sessionIdRef.current) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        dcRef.current?.close();
        pcRef.current?.close();
        pcRef.current = null;
        dcRef.current = null;
        releaseWakeLock();
        setState("idle");
        setProgress(INITIAL_PROGRESS);
        setVerificationCode(null);
        setError(null);
        sessionIdRef.current = null;
        onResetRef.current?.();
      }
    },
    [releaseWakeLock],
  );

  // ═══════════════════════════════════════════════════════════════════
  // SIGNAL HANDLER (called from SSE events)
  // ═══════════════════════════════════════════════════════════════════

  const handleSignal = useCallback(
    async (signal: SignalData) => {
      const pc = pcRef.current;

      // ─── SENDER receives "transfer_accepted" SSE → starts WebRTC ───
      if (!pc && roleRef.current === "sender") {
        const newPc = createPeerConnection();

        const dc = newPc.createDataChannel("file-transfer", {
          ordered: true,
        });
        dcRef.current = dc;
        dc.binaryType = "arraybuffer";

        dc.onerror = () => failTransfer("Connection error");
        dc.onclose = () => {
          if (stateRef.current === "transferring" || stateRef.current === "connecting") {
            failTransfer("Peer disconnected");
          }
        };

        dc.onopen = async () => {
          try {
            dc.send(
              JSON.stringify({
                type: "ecdh_pubkey",
                key: myPubKeyB64Ref.current,
              }),
            );
          } catch (err) {
            failTransfer(
              err instanceof Error ? err.message : "Key exchange failed",
            );
          }
        };

        dc.onmessage = async (event) => {
          if (typeof event.data === "string") {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "ecdh_pubkey") {
                const theirPub = await importPublicKey(msg.key);
                const aesKey = await deriveSharedKey(
                  ecdhKeysRef.current!.privateKey,
                  theirPub,
                );
                sharedKeyRef.current = aesKey;

                const code = await generateVerificationCode(
                  myPubKeyB64Ref.current!,
                  msg.key,
                );
                setVerificationCode(code);

                if (filesRef.current.length > 0) {
                  // Don't null out onmessage — startSending installs its own
                  // resume handler that needs to receive messages from receiver
                  await startSending(dc, filesRef.current, aesKey);
                }
              }
            } catch (err) {
              failTransfer("Key exchange failed");
            }
          }
        };

        setState("connecting");
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "connecting") {
            failTransfer("Connection timed out");
          }
        }, CONNECTING_TIMEOUT);

        const offer = await newPc.createOffer();
        await newPc.setLocalDescription(offer);

        sendSignalMut.mutate({
          sessionId: sessionIdRef.current!,
          peerId: peerIdRef.current!,
          type: "offer",
          data: JSON.stringify(offer),
        });

        return;
      }

      if (!pc) return;

      // ─── Process signal ───
      if (signal.type === "offer") {
        await pc.setRemoteDescription(JSON.parse(signal.data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendSignalMut.mutate({
          sessionId: sessionIdRef.current!,
          peerId: peerIdRef.current!,
          type: "answer",
          data: JSON.stringify(answer),
        });

        pc.ondatachannel = (event) => {
          const dc = event.channel;
          dcRef.current = dc;
          dc.binaryType = "arraybuffer";

          dc.onerror = () => failTransfer("Connection error");
          dc.onclose = () => {
            if (stateRef.current === "transferring" || stateRef.current === "connecting") {
              failTransfer("Peer disconnected");
            }
          };

          dc.onopen = () => {
            dc.send(
              JSON.stringify({
                type: "ecdh_pubkey",
                key: myPubKeyB64Ref.current,
              }),
            );
          };

          const pendingMessages: MessageEvent[] = [];
          let handshakeDone = false;

          dc.onmessage = async (evt) => {
            if (handshakeDone) {
              pendingMessages.push(evt);
              return;
            }

            if (typeof evt.data === "string") {
              try {
                const msg = JSON.parse(evt.data);
                if (msg.type === "ecdh_pubkey") {
                  handshakeDone = true;

                  const theirPub = await importPublicKey(msg.key);
                  const aesKey = await deriveSharedKey(
                    ecdhKeysRef.current!.privateKey,
                    theirPub,
                  );
                  sharedKeyRef.current = aesKey;

                  const code = await generateVerificationCode(
                    myPubKeyB64Ref.current!,
                    msg.key,
                  );
                  setVerificationCode(code);

                  setupReceiverDataChannel(dc);
                  setState("transferring");
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                  }
                  acquireWakeLock();

                  for (const queued of pendingMessages) {
                    dc.onmessage!(queued);
                  }
                  pendingMessages.length = 0;
                  return;
                }
              } catch (err) {
                failTransfer("Key exchange failed");
                return;
              }
            }

            pendingMessages.push(evt);
          };
        };
      } else if (signal.type === "answer") {
        await pc.setRemoteDescription(JSON.parse(signal.data));
      } else if (signal.type === "ice") {
        const candidate = JSON.parse(signal.data);
        await pc.addIceCandidate(candidate).catch(() => {
          // Non-critical: some candidates arrive after connection established
        });
      }
    },
    [
      createPeerConnection,
      sendSignalMut,
      startSending,
      setupReceiverDataChannel,
      acquireWakeLock,
      failTransfer,
    ],
  );

  return {
    state,
    progress,
    verificationCode,
    error,
    resumableTransfers,
    sendToReceiver,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    handleTransferCancelled,
    handleSignal,
    reset,
    discardResumable,
    refreshResumable,
    onReset: onResetRef,
  };
}
