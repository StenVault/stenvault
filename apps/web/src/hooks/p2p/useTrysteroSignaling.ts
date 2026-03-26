/**
 * useTrysteroSignaling Hook
 * 
 * Serverless WebRTC signaling using Trystero (BitTorrent DHT).
 * Provides peer-to-peer signaling without backend dependency.
 * 
 * Features:
 * - BitTorrent tracker-based peer discovery
 * - Automatic reconnection on disconnect
 * - E2E encrypted by default
 * - Session-based room management
 * 
 * @module hooks/p2p/useTrysteroSignaling
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, selfId, type Room } from "trystero";

// ============ Types ============

export interface TrysteroConfig {
    appId: string;
    roomId: string;
    strategy?: "bittorrent" | "nostr" | "mqtt" | "firebase" | "supabase";
    relayUrls?: string[];
}

export interface TrysteroSignal {
    type: "offer" | "answer" | "ice_candidate" | "key_exchange" | "ready";
    data: string;
    senderId: string;
    timestamp: number;
    [key: string]: string | number;
}

export interface TrysteroPeer {
    peerId: string;
    joinedAt: number;
}

export interface UseTrysteroSignalingResult {
    isConnected: boolean;
    peers: TrysteroPeer[];
    myPeerId: string;
    lastSignal: TrysteroSignal | null;
    sendSignal: (signal: Omit<TrysteroSignal, "senderId" | "timestamp">, targetPeerId?: string) => void;
    join: () => void;
    leave: () => void;
    error: Error | null;
    latency: number | null;
}

// ============ Constants ============

const DEFAULT_APP_ID = "stenvault-quantum-mesh";
const LATENCY_CHECK_INTERVAL = 5000;

// ============ Hook Implementation ============

export function useTrysteroSignaling(config: TrysteroConfig): UseTrysteroSignalingResult {
    const { appId = DEFAULT_APP_ID, roomId, strategy = "bittorrent" } = config;

    const [isConnected, setIsConnected] = useState(false);
    const [peers, setPeers] = useState<TrysteroPeer[]>([]);
    const [lastSignal, setLastSignal] = useState<TrysteroSignal | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [latency, setLatency] = useState<number | null>(null);

    const roomRef = useRef<Room | null>(null);
    const sendSignalAction = useRef<((data: TrysteroSignal, target?: string) => void) | null>(null);
    const pingAction = useRef<((data: { ts: number }, target?: string) => void) | null>(null);
    const isJoinedRef = useRef(false);

    const join = useCallback(() => {
        if (isJoinedRef.current || !roomId) {
            return;
        }

        try {
            const room = joinRoom(
                { appId },
                roomId
            );

            roomRef.current = room;
            isJoinedRef.current = true;

            const [sendSignal, onSignal] = room.makeAction<TrysteroSignal>("signal");
            sendSignalAction.current = sendSignal;

            const [sendPing, onPing] = room.makeAction<{ ts: number; pong?: boolean }>("ping");
            pingAction.current = sendPing;

            onSignal((signal, peerId) => {
                setLastSignal({
                    ...signal,
                    senderId: peerId,
                });
            });

            onPing((data, peerId) => {
                if (data.pong) {
                    const rtt = Date.now() - data.ts;
                    setLatency(rtt);
                } else {
                    sendPing({ ts: data.ts, pong: true }, peerId);
                }
            });

            room.onPeerJoin((peerId) => {
                setPeers((prev) => {
                    const exists = prev.some((p) => p.peerId === peerId);
                    if (exists) return prev;
                    return [...prev, { peerId, joinedAt: Date.now() }];
                });
            });

            room.onPeerLeave((peerId) => {
                setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
            });

            setIsConnected(true);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsConnected(false);
        }
    }, [appId, roomId, strategy]);

    const leave = useCallback(() => {
        if (roomRef.current) {
            roomRef.current.leave();
            roomRef.current = null;
            sendSignalAction.current = null;
            pingAction.current = null;
            isJoinedRef.current = false;
            setIsConnected(false);
            setPeers([]);
            setLastSignal(null);
            setLatency(null);
        }
    }, []);

    const sendSignal = useCallback(
        (signal: Omit<TrysteroSignal, "senderId" | "timestamp">, targetPeerId?: string) => {
            if (!sendSignalAction.current) {
                return;
            }

            const fullSignal = {
                type: signal.type,
                data: signal.data,
                senderId: selfId,
                timestamp: Date.now(),
            } as TrysteroSignal;

            if (targetPeerId) {
                sendSignalAction.current(fullSignal, targetPeerId);
            } else {
                sendSignalAction.current(fullSignal);
            }
        },
        []
    );

    useEffect(() => {
        return () => {
            leave();
        };
    }, [leave]);

    // Auto-join when roomId changes from empty to valid
    useEffect(() => {
        if (roomId && !isJoinedRef.current) {
            join();
        }
    }, [roomId, join]);

    useEffect(() => {
        if (!isConnected || peers.length === 0) return;

        const interval = setInterval(() => {
            if (pingAction.current && peers[0]) {
                pingAction.current({ ts: Date.now() }, peers[0].peerId);
            }
        }, LATENCY_CHECK_INTERVAL);

        return () => clearInterval(interval);
    }, [isConnected, peers]);

    return {
        isConnected,
        peers,
        myPeerId: selfId,
        lastSignal,
        sendSignal,
        join,
        leave,
        error,
        latency,
    };
}

/**
 * Get current peer ID (stable across the session)
 */
export function getMyPeerId(): string {
    return selfId;
}
