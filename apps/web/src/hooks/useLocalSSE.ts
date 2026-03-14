/**
 * useLocalSSE — SSE Connection Hook for Local Send
 *
 * Connects to /api/local-send/events, auto-reconnects with exponential backoff,
 * and dispatches typed events to callbacks.
 *
 * Dual-address reporting: After SSE connects, fetches GET /api/local-send/my-ip
 * to detect IPv4/IPv6 mismatch (Happy Eyeballs). If different, calls
 * reportAlternateIp to join both IP rooms.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";

// TYPES

export interface LocalReceiver {
  peerId: string;
  displayName: string;
  browserName: string;
  osName: string;
}

export interface TransferRequest {
  sessionId: string;
  senderId: string;
  senderName: string;
  files: Array<{ name: string; size: number; type: string }>;
}

export interface SignalData {
  sessionId: string;
  peerId: string;
  type: "offer" | "answer" | "ice";
  data: string;
}

export interface UseLocalSSECallbacks {
  onReceiverJoined?: (receiver: LocalReceiver) => void;
  onReceiverLeft?: (peerId: string) => void;
  onPeerLeft?: (peerId: string) => void;
  onTransferRequest?: (request: TransferRequest) => void;
  onTransferAccepted?: (sessionId: string) => void;
  onTransferRejected?: (sessionId: string) => void;
  onTransferCancelled?: (sessionId: string) => void;
  onSignal?: (signal: SignalData) => void;
  onRoomCodeJoined?: (data: { code: string; receivers: LocalReceiver[] }) => void;
}

export interface UseLocalSSEReturn {
  peerId: string | null;
  displayName: string | null;
  connected: boolean;
  receivers: LocalReceiver[];
  error: string | null;
  sseIpHash: string | null;
}

// HOOK

const SSE_URL = "/api/local-send/events";
const MY_IP_URL = "/api/local-send/my-ip";
const MAX_BACKOFF_MS = 10_000;

function safeParse(data: string): any | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function useLocalSSE(callbacks: UseLocalSSECallbacks): UseLocalSSEReturn {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [receivers, setReceivers] = useState<LocalReceiver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sseIpHash, setSseIpHash] = useState<string | null>(null);

  // Refs to avoid stale closure in EventSource handlers
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);

  const reportAlternateIp = trpc.localSend.reportAlternateIp.useMutation();

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current!);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const es = new EventSource(SSE_URL);
    eventSourceRef.current = es;

    // ─── connected ───
    es.addEventListener("connected", (e: MessageEvent) => {
      const data = safeParse(e.data);
      if (!data) return;
      setPeerId(data.peerId);
      setDisplayName(data.displayName);
      setSseIpHash(data.ipHash);
      setConnected(true);
      setError(null);
      // Clear stale receivers from previous connection
      setReceivers([]);
      backoffRef.current = 1000; // reset backoff

      // Dual-address detection: fetch our IP via separate HTTP request
      // If it differs from the SSE connection's IP, report the alternate
      fetch(MY_IP_URL)
        .then((res) => res.json())
        .then((myIpData: { ipHash: string }) => {
          if (myIpData.ipHash !== data.ipHash) {
            reportAlternateIp.mutate({ peerId: data.peerId });
          }
        })
        .catch(() => {});
    });

    // ─── receiver_joined ───
    es.addEventListener("receiver_joined", (e: MessageEvent) => {
      const data = safeParse(e.data) as LocalReceiver | null;
      if (!data) return;
      setReceivers((prev) => {
        if (prev.some((r) => r.peerId === data.peerId)) return prev;
        return [...prev, data];
      });
      callbacksRef.current.onReceiverJoined?.(data);
    });

    // ─── receiver_left ───
    es.addEventListener("receiver_left", (e: MessageEvent) => {
      const data = safeParse(e.data);
      if (!data) return;
      const { peerId: leftId } = data;
      setReceivers((prev) => prev.filter((r) => r.peerId !== leftId));
      callbacksRef.current.onReceiverLeft?.(leftId);
    });

    // ─── peer_left ───
    es.addEventListener("peer_left", (e: MessageEvent) => {
      const data = safeParse(e.data);
      if (!data) return;
      const { peerId: leftId } = data;
      setReceivers((prev) => prev.filter((r) => r.peerId !== leftId));
      callbacksRef.current.onPeerLeft?.(leftId);
    });

    // ─── transfer_request ───
    es.addEventListener("transfer_request", (e: MessageEvent) => {
      const data = safeParse(e.data) as TransferRequest | null;
      if (!data) return;
      callbacksRef.current.onTransferRequest?.(data);
    });

    // ─── transfer_accepted ───
    es.addEventListener("transfer_accepted", (e: MessageEvent) => {
      const data = safeParse(e.data);
      if (!data) return;
      const { sessionId } = data;
      callbacksRef.current.onTransferAccepted?.(sessionId);
    });

    // ─── transfer_rejected ───
    es.addEventListener("transfer_rejected", (e: MessageEvent) => {
      const data = safeParse(e.data);
      if (!data) return;
      const { sessionId } = data;
      callbacksRef.current.onTransferRejected?.(sessionId);
    });

    // ─── transfer_cancelled ───
    es.addEventListener("transfer_cancelled", (e: MessageEvent) => {
      const data = safeParse(e.data);
      if (!data) return;
      const { sessionId } = data;
      callbacksRef.current.onTransferCancelled?.(sessionId);
    });

    // ─── signal ───
    es.addEventListener("signal", (e: MessageEvent) => {
      const data = safeParse(e.data) as SignalData | null;
      if (!data) return;
      callbacksRef.current.onSignal?.(data);
    });

    // ─── room_code_joined ───
    es.addEventListener("room_code_joined", (e: MessageEvent) => {
      const data = safeParse(e.data) as { code: string; receivers: LocalReceiver[] } | null;
      if (!data) return;
      // Merge new receivers into state (deduplicated)
      if (data.receivers?.length) {
        setReceivers((prev) => {
          const existing = new Set(prev.map((r) => r.peerId));
          const newReceivers = data.receivers.filter((r) => !existing.has(r.peerId));
          return newReceivers.length > 0 ? [...prev, ...newReceivers] : prev;
        });
      }
      callbacksRef.current.onRoomCodeJoined?.(data);
    });

    // ─── open (EventSource successfully connected to server) ───
    es.onopen = () => {};

    // ─── error / reconnect ───
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
      setError("Connection lost. Reconnecting...");

      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return { peerId, displayName, connected, receivers, error, sseIpHash };
}
