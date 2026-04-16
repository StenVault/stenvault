/**
 * Receiver-side transfer logic for Local Send.
 *
 * Handles chunk decryption, multi-file assembly, resume protocol,
 * and ECDH handshake completion on the receiver side.
 *
 * @module local-transfer/receiverTransfer
 */

import { FileAssembler, type FileManifest } from "@/lib/p2p/fileAssembler";
import {
  decryptChunk,
  importPublicKey,
  deriveSharedKey,
  generateVerificationCode,
} from "@/lib/localE2E";
import type { TransferProgress } from "../useLocalTransfer";

export interface ReceiverCallbacks {
  onProgress: (progress: TransferProgress) => void;
  onComplete: () => void;
  onFail: (msg: string) => void;
  releaseWakeLock: () => void;
  refreshResumable: () => void;
  getAssembler: () => FileAssembler | null;
  setAssembler: (a: FileAssembler | null) => void;
}

/**
 * Perform the receiver-side ECDH handshake.
 *
 * Queues any messages that arrive before the handshake completes,
 * then replays them once the shared key is derived.
 *
 * @returns A setup function to call once the DataChannel is received
 */
export function initReceiverDataChannel(
  dc: RTCDataChannel,
  ecdhPrivateKey: CryptoKey,
  myPubKeyB64: string,
  callbacks: ReceiverCallbacks & {
    onVerificationCode: (code: string) => void;
    onSharedKey: (key: CryptoKey) => void;
    onHandshakeComplete: () => void;
  },
): void {
  dc.binaryType = "arraybuffer";

  dc.onerror = () => callbacks.onFail("Connection error");
  dc.onclose = () => callbacks.onFail("Peer disconnected");

  dc.onopen = () => {
    dc.send(JSON.stringify({ type: "ecdh_pubkey", key: myPubKeyB64 }));
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
          const aesKey = await deriveSharedKey(ecdhPrivateKey, theirPub);
          callbacks.onSharedKey(aesKey);

          const code = await generateVerificationCode(myPubKeyB64, msg.key);
          callbacks.onVerificationCode(code);

          setupReceiveLoop(dc, aesKey, callbacks);
          callbacks.onHandshakeComplete();

          for (const queued of pendingMessages) {
            dc.onmessage!(queued);
          }
          pendingMessages.length = 0;
          return;
        }
      } catch {
        callbacks.onFail("Key exchange failed");
        return;
      }
    }

    pendingMessages.push(evt);
  };
}

/**
 * Install the message handler that receives encrypted chunks and control messages.
 *
 * Handles: session_manifest, manifest, binary chunks, file_complete, complete/session_complete.
 * Supports resume: on receiving a manifest, checks IndexedDB for partial state and
 * sends a "resume" message with already-received chunk indices.
 */
function setupReceiveLoop(
  dc: RTCDataChannel,
  aesKey: CryptoKey,
  callbacks: ReceiverCallbacks,
): void {
  let currentFileIndex = 0;
  let totalFiles = 1;
  let isMultiFile = false;
  let transferStartTime = 0;
  let totalSessionBytes = 0;
  let sessionBytesSent = 0;
  let fileComplete = false;
  let pendingDecrypts = 0;

  const tryDownload = () => {
    const assembler = callbacks.getAssembler();
    if (fileComplete && pendingDecrypts === 0 && assembler?.isComplete()) {
      assembler.downloadFile();
      assembler.deleteSavedState().catch(() => {});
      callbacks.setAssembler(null);
      fileComplete = false;
    }
  };

  dc.onmessage = async (event) => {
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
        callbacks.onProgress({
          percent: 0,
          bytesSent: 0,
          totalBytes: totalSessionBytes,
          speed: 0,
          eta: 0,
          currentFileIndex: 0,
          totalFiles,
          currentFileName: msg.files[0]?.name ?? "",
        });
      } else if (msg.type === "manifest") {
        const manifest: FileManifest = {
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          mimeType: msg.mimeType,
          totalChunks: msg.totalChunks,
        };

        let restored = false;
        try {
          const resumables = await FileAssembler.listResumableTransfers();
          const match = resumables.find(
            (r) => r.fileName === msg.fileName && r.totalBytes === msg.fileSize,
          );
          if (match) {
            const saved = await FileAssembler.restoreFromState(match.sessionId);
            if (saved) {
              callbacks.setAssembler(saved);
              restored = true;
              sessionBytesSent += saved.getProgress().bytesReceived;

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
          callbacks.setAssembler(
            new FileAssembler(manifest, {
              sessionId,
              autoPersist: true,
              isE2E: true,
            }),
          );
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
        callbacks.onProgress({
          percent: totalSessionBytes > 0
            ? Math.round((sessionBytesSent / totalSessionBytes) * 100)
            : 0,
          bytesSent: sessionBytesSent,
          totalBytes: totalSessionBytes,
          speed: 0,
          eta: 0,
          currentFileIndex,
          totalFiles,
          currentFileName: msg.fileName,
        });
      } else if (msg.type === "file_complete") {
        fileComplete = true;
        tryDownload();
      } else if (msg.type === "complete" || msg.type === "session_complete") {
        if (!isMultiFile) {
          fileComplete = true;
          tryDownload();
        }
        callbacks.onComplete();
        callbacks.releaseWakeLock();
        callbacks.refreshResumable();
      }
    } else {
      // Binary chunk: [4-byte chunkIdx BE][encrypted data]
      const buf = event.data as ArrayBuffer;
      const view = new DataView(buf);
      const idx = view.getUint32(0, false);
      const encryptedData = new Uint8Array(buf, 4);

      pendingDecrypts++;
      try {
        const fileIdx = isMultiFile ? currentFileIndex : 0;
        const decrypted = await decryptChunk(encryptedData, aesKey, idx, fileIdx);
        callbacks.getAssembler()?.addChunk({ index: idx, data: decrypted.buffer as ArrayBuffer });

        sessionBytesSent += decrypted.byteLength;
        const elapsed = (Date.now() - transferStartTime) / 1000;
        const speed = elapsed > 0 ? sessionBytesSent / elapsed : 0;
        callbacks.onProgress({
          percent: totalSessionBytes > 0
            ? Math.round((sessionBytesSent / totalSessionBytes) * 100)
            : 0,
          bytesSent: sessionBytesSent,
          totalBytes: totalSessionBytes,
          speed,
          eta: speed > 0 ? (totalSessionBytes - sessionBytesSent) / speed : 0,
          currentFileIndex,
          totalFiles,
          currentFileName: callbacks.getAssembler()?.getManifest().fileName ?? "",
        });
      } catch {
        // Decrypt failure — non-critical, chunk will be missing
      } finally {
        pendingDecrypts--;
        tryDownload();
      }
    }
  };
}
