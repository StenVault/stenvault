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
import { FileAssembler } from "@/lib/p2p/fileAssembler";
import { generateECDHKeyPair, exportPublicKey } from "@/lib/localE2E";
import { hapticSuccess } from "@/lib/haptics";
import type { SignalData, TransferRequest } from "./useLocalSSE";

import { createPeerConnection, processSignal } from "./local-transfer/signalingProtocol";
import { initSenderDataChannel } from "./local-transfer/senderTransfer";
import { initReceiverDataChannel } from "./local-transfer/receiverTransfer";

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
  sendToReceiver: (receiverId: string, files: File[], peerId: string) => void;
  acceptTransfer: (request: TransferRequest, peerId: string) => void;
  rejectTransfer: (sessionId: string, peerId: string) => void;
  cancelTransfer: () => void;
  handleTransferCancelled: (sessionId: string) => void;
  handleSignal: (signal: SignalData) => void;
  reset: () => void;
  discardResumable: (sessionId: string) => Promise<void>;
  refreshResumable: () => void;
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

const WAITING_ACCEPT_TIMEOUT = 60_000;
const CONNECTING_TIMEOUT = 15_000;

export function useLocalTransfer(): UseLocalTransferReturn {
  const [state, setState] = useState<TransferState>("idle");
  const [progress, setProgress] = useState<TransferProgress>(INITIAL_PROGRESS);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumableTransfers, setResumableTransfers] = useState<ResumableTransfer[]>([]);

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
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResetRef = useRef<(() => void) | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (state === "completed") {
      playCompletionSound();
      hapticSuccess();
    }
  }, [state]);

  const refreshResumable = useCallback(() => {
    FileAssembler.listResumableTransfers()
      .then((transfers) => setResumableTransfers(transfers))
      .catch(() => setResumableTransfers([]));
  }, []);

  useEffect(() => { refreshResumable(); }, [refreshResumable]);

  const requestTransferMut = trpc.localSend.requestTransfer.useMutation();
  const respondTransferMut = trpc.localSend.respondTransfer.useMutation();
  const sendSignalMut = trpc.localSend.sendSignal.useMutation();
  const cancelTransferMut = trpc.localSend.cancelTransfer.useMutation();

  // ─── Lifecycle helpers ───

  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch { /* Not critical */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const failTransfer = useCallback(
    (msg: string) => {
      if (stateRef.current === "completed") return;

      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }

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

  const discardResumable = useCallback(
    async (sessionId: string) => {
      const assembler = await FileAssembler.restoreFromState(sessionId);
      if (assembler) await assembler.deleteSavedState();
      refreshResumable();
    },
    [refreshResumable],
  );

  const reset = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
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

  const setupECDH = useCallback(async () => {
    const keys = await generateECDHKeyPair();
    ecdhKeysRef.current = keys;
    myPubKeyB64Ref.current = await exportPublicKey(keys.publicKey);
    return myPubKeyB64Ref.current;
  }, []);

  // ─── Signaling helper ───

  const sendSignal = useCallback(
    (params: { sessionId: string; peerId: string; type: "offer" | "answer" | "ice"; data: string }) => {
      sendSignalMut.mutate(params);
    },
    [sendSignalMut],
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
          files: files.map((f) => ({ name: f.name, size: f.size, type: f.type || "application/octet-stream" })),
        });

        sessionIdRef.current = result.sessionId;
        setState("waiting_accept");

        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "waiting_accept") failTransfer("No response — request timed out");
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

        const pc = createPeerConnection(
          sendSignal,
          {
            onFail: failTransfer,
            getSessionId: () => sessionIdRef.current,
            getPeerId: () => peerIdRef.current,
          },
          disconnectTimerRef,
        );
        pcRef.current = pc;

        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "connecting") failTransfer("Connection timed out");
        }, CONNECTING_TIMEOUT);

        respondTransferMut.mutate({ sessionId: request.sessionId, peerId, accept: true });
      } catch (err) {
        failTransfer(err instanceof Error ? err.message : "Failed to accept transfer");
      }
    },
    [setupECDH, respondTransferMut, sendSignal, failTransfer],
  );

  const rejectTransfer = useCallback(
    (sessionId: string, peerId: string) => {
      respondTransferMut.mutate({ sessionId, peerId, accept: false });
    },
    [respondTransferMut],
  );

  const cancelTransfer = useCallback(() => {
    const sid = sessionIdRef.current;
    const pid = peerIdRef.current;
    if (sid && pid) cancelTransferMut.mutate({ sessionId: sid, peerId: pid });
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
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

  const handleTransferCancelled = useCallback(
    (sessionId: string) => {
      if (sessionIdRef.current === sessionId || !sessionIdRef.current) {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
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
  // SIGNAL HANDLER
  // ═══════════════════════════════════════════════════════════════════

  const handleSignal = useCallback(
    async (signal: SignalData) => {
      const pc = pcRef.current;

      // Sender receives "transfer_accepted" → starts WebRTC
      if (!pc && roleRef.current === "sender") {
        const newPc = createPeerConnection(
          sendSignal,
          {
            onFail: failTransfer,
            getSessionId: () => sessionIdRef.current,
            getPeerId: () => peerIdRef.current,
          },
          disconnectTimerRef,
        );
        pcRef.current = newPc;

        const dc = newPc.createDataChannel("file-transfer", { ordered: true });
        dcRef.current = dc;

        initSenderDataChannel(dc, ecdhKeysRef.current!.privateKey, myPubKeyB64Ref.current!, filesRef.current, {
          onProgress: setProgress,
          onVerificationCode: setVerificationCode,
          onSharedKey: (key) => { sharedKeyRef.current = key; },
          onComplete: () => { setState("completed"); releaseWakeLock(); },
          onFail: failTransfer,
        });

        setState("connecting");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "connecting") failTransfer("Connection timed out");
        }, CONNECTING_TIMEOUT);

        const offer = await newPc.createOffer();
        await newPc.setLocalDescription(offer);
        sendSignal({
          sessionId: sessionIdRef.current!,
          peerId: peerIdRef.current!,
          type: "offer",
          data: JSON.stringify(offer),
        });
        return;
      }

      if (!pc) return;

      // Receiver gets offer → handle signaling + set up DataChannel reception
      if (signal.type === "offer") {
        await processSignal(pc, signal, sendSignal, sessionIdRef.current!, peerIdRef.current!);

        pc.ondatachannel = (event) => {
          const dc = event.channel;
          dcRef.current = dc;

          initReceiverDataChannel(dc, ecdhKeysRef.current!.privateKey, myPubKeyB64Ref.current!, {
            onProgress: setProgress,
            onVerificationCode: setVerificationCode,
            onSharedKey: (key) => { sharedKeyRef.current = key; },
            onComplete: () => { setState("completed"); },
            onHandshakeComplete: () => {
              setState("transferring");
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
              acquireWakeLock();
            },
            onFail: failTransfer,
            releaseWakeLock,
            refreshResumable,
            getAssembler: () => assemblerRef.current,
            setAssembler: (a) => { assemblerRef.current = a; },
          });
        };
      } else {
        await processSignal(pc, signal, sendSignal, sessionIdRef.current!, peerIdRef.current!);
      }
    },
    [sendSignal, acquireWakeLock, releaseWakeLock, failTransfer, refreshResumable],
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
