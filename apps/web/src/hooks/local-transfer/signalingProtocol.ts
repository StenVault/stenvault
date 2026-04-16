/**
 * WebRTC signaling and connection management for Local Send.
 *
 * Handles PeerConnection creation with STUN servers, ICE candidate
 * exchange, and connection state monitoring with a grace period
 * for transient disconnects.
 *
 * @module local-transfer/signalingProtocol
 */

import type { SignalData } from "../useLocalSSE";

export interface SignalSender {
  (params: { sessionId: string; peerId: string; type: "offer" | "answer" | "ice"; data: string }): void;
}

export interface PeerConnectionCallbacks {
  onFail: (msg: string) => void;
  getSessionId: () => string | null;
  getPeerId: () => string | null;
}

/**
 * Create an RTCPeerConnection with STUN servers, ICE candidate
 * forwarding, and connection state monitoring.
 *
 * Disconnects have a 2-second grace period before being treated
 * as failures (WebRTC sometimes recovers from transient drops).
 */
export function createPeerConnection(
  sendSignal: SignalSender,
  callbacks: PeerConnectionCallbacks,
  disconnectTimerRef: { current: ReturnType<typeof setTimeout> | null },
): RTCPeerConnection {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onicecandidate = (event) => {
    const sessionId = callbacks.getSessionId();
    const peerId = callbacks.getPeerId();
    if (event.candidate && sessionId && peerId) {
      sendSignal({
        sessionId,
        peerId,
        type: "ice",
        data: JSON.stringify(event.candidate),
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      callbacks.onFail("Connection lost");
    } else if (pc.connectionState === "disconnected") {
      disconnectTimerRef.current = setTimeout(() => {
        if (pc.connectionState === "disconnected") {
          callbacks.onFail("Connection lost");
        }
      }, 2000);
    } else if (pc.connectionState === "connected") {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    }
  };

  return pc;
}

/**
 * Process an incoming WebRTC signal (offer, answer, or ICE candidate).
 *
 * - offer: sets remote description, creates and sends answer
 * - answer: sets remote description
 * - ice: adds ICE candidate
 */
export async function processSignal(
  pc: RTCPeerConnection,
  signal: SignalData,
  sendSignal: SignalSender,
  sessionId: string,
  peerId: string,
): Promise<void> {
  if (signal.type === "offer") {
    await pc.setRemoteDescription(JSON.parse(signal.data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ sessionId, peerId, type: "answer", data: JSON.stringify(answer) });
  } else if (signal.type === "answer") {
    await pc.setRemoteDescription(JSON.parse(signal.data));
  } else if (signal.type === "ice") {
    const candidate = JSON.parse(signal.data);
    await pc.addIceCandidate(candidate).catch(() => {
      // Non-critical: some candidates arrive after connection established
    });
  }
}
