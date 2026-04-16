/**
 * Sender-side transfer logic for Local Send.
 *
 * Handles multi-file chunk encryption, flow control, resume protocol,
 * and ECDH handshake initiation on the sender side.
 *
 * @module local-transfer/senderTransfer
 */

import { WEBRTC_CHUNK_SIZE } from "@stenvault/shared/core/transfer";
import {
  encryptChunk,
  importPublicKey,
  deriveSharedKey,
  generateVerificationCode,
} from "@/lib/localE2E";
import type { TransferProgress } from "../useLocalTransfer";

export interface SenderCallbacks {
  onProgress: (progress: TransferProgress) => void;
  onComplete: () => void;
  onFail: (msg: string) => void;
}

/**
 * Set up the sender-side DataChannel with ECDH handshake.
 *
 * When the DataChannel opens, the sender sends its ECDH public key.
 * When the receiver replies with its key, the shared AES key is derived,
 * a verification code is generated, and file sending begins.
 */
export function initSenderDataChannel(
  dc: RTCDataChannel,
  ecdhPrivateKey: CryptoKey,
  myPubKeyB64: string,
  files: File[],
  callbacks: SenderCallbacks & {
    onVerificationCode: (code: string) => void;
    onSharedKey: (key: CryptoKey) => void;
  },
): void {
  dc.binaryType = "arraybuffer";

  dc.onerror = () => callbacks.onFail("Connection error");
  dc.onclose = () => callbacks.onFail("Peer disconnected");

  dc.onopen = async () => {
    try {
      dc.send(JSON.stringify({ type: "ecdh_pubkey", key: myPubKeyB64 }));
    } catch (err) {
      callbacks.onFail(err instanceof Error ? err.message : "Key exchange failed");
    }
  };

  dc.onmessage = async (event) => {
    if (typeof event.data === "string") {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ecdh_pubkey") {
          const theirPub = await importPublicKey(msg.key);
          const aesKey = await deriveSharedKey(ecdhPrivateKey, theirPub);
          callbacks.onSharedKey(aesKey);

          const code = await generateVerificationCode(myPubKeyB64, msg.key);
          callbacks.onVerificationCode(code);

          await sendFiles(dc, files, aesKey, callbacks);
        }
      } catch {
        callbacks.onFail("Key exchange failed");
      }
    }
  };
}

/**
 * Send files over an encrypted DataChannel.
 *
 * Protocol:
 *   Multi-file (N > 1): session_manifest → (manifest + chunks + file_complete) × N → session_complete
 *   Single-file (N = 1): manifest + chunks + complete
 *
 * Resume: listens for "resume" messages from the receiver with chunk indices
 * to skip, reducing retransmission on reconnect.
 */
export async function sendFiles(
  dc: RTCDataChannel,
  files: File[],
  aesKey: CryptoKey,
  callbacks: SenderCallbacks,
): Promise<void> {
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

        if (fileSkip?.has(i)) {
          sessionBytesSent += chunkBytes;
          emitProgress(callbacks.onProgress, sessionBytesSent, totalSessionBytes, startTime, fi, files.length, file.name);
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

        // Flow control: wait if buffered amount exceeds 1MB
        while (dc.bufferedAmount > 1024 * 1024) {
          await new Promise((r) => setTimeout(r, 10));
        }

        dc.send(framed);
        sessionBytesSent += raw.byteLength;
        emitProgress(callbacks.onProgress, sessionBytesSent, totalSessionBytes, startTime, fi, files.length, file.name);
      }

      if (isMulti) {
        dc.send(JSON.stringify({ type: "file_complete", fileIndex: fi }));
      }
    }

    dc.send(JSON.stringify({ type: isMulti ? "session_complete" : "complete" }));
    callbacks.onComplete();
  } catch (err) {
    callbacks.onFail("Transfer failed: " + (err instanceof Error ? err.message : "unknown error"));
  }
}

function emitProgress(
  onProgress: (p: TransferProgress) => void,
  bytesSent: number,
  totalBytes: number,
  startTime: number,
  fileIndex: number,
  totalFiles: number,
  fileName: string,
): void {
  const elapsed = (Date.now() - startTime) / 1000;
  const speed = elapsed > 0 ? bytesSent / elapsed : 0;
  onProgress({
    percent: Math.round((bytesSent / totalBytes) * 100),
    bytesSent,
    totalBytes,
    speed,
    eta: speed > 0 ? (totalBytes - bytesSent) / speed : 0,
    currentFileIndex: fileIndex,
    totalFiles,
    currentFileName: fileName,
  });
}
