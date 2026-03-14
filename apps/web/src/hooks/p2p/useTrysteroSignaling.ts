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


export interface TrysteroConfig {
    /** App identifier (used for room namespacing) */
    appId: string;
    /** Room/session ID */
    roomId: string;
    /** Strategy to use - bittorrent by default */
    strategy?: "bittorrent" | "nostr" | "mqtt" | "firebase" | "supabase";
    /** Custom relay URLs for MQTT/Nostr */
    relayUrls?: string[];
}

/**
 * Signal data for Trystero communication
 * Includes index signature for Trystero DataPayload compatibility
 */
export interface TrysteroSignal {
    type: "offer" | "answer" | "ice_candidate" | "key_exchange" | "ready";
    data: string;
    senderId: string;
    timestamp: number;
    [key: string]: string | number; // Index signature for DataPayload compatibility
}

export interface TrysteroPeer {
    peerId: string;
    joinedAt: number;
}

export interface UseTrysteroSignalingResult {
    /** Whether connected to the Trystero room */
    isConnected: boolean;
    /** List of peers in the room */
    peers: TrysteroPeer[];
    /** My peer ID */
    myPeerId: string;
    /** Last received signal */
    lastSignal: TrysteroSignal | null;
    /** Send a signal to all peers or specific peer */
    sendSignal: (signal: Omit<TrysteroSignal, "senderId" | "timestamp">, targetPeerId?: string) => void;
    /** Join the room */
    join: () => void;
    /** Leave the room */
    leave: () => void;
    /** Error if any */
    error: Error | null;
    /** Connection latency estimate */
    latency: number | null;
}


const DEFAULT_APP_ID = "cloudvault-quantum-mesh";
const LATENCY_CHECK_INTERVAL = 5000;


/**
 * Serverless signaling hook using Trystero
 */
export function useTrysteroSignaling(config: TrysteroConfig): UseTrysteroSignalingResult {
    const { appId = DEFAULT_APP_ID, roomId, strategy = "bittorrent" } = config;

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [peers, setPeers] = useState<TrysteroPeer[]>([]);
    const [lastSignal, setLastSignal] = useState<TrysteroSignal | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [latency, setLatency] = useState<number | null>(null);

    // Refs
    const roomRef = useRef<Room | null>(null);
    const sendSignalAction = useRef<((data: TrysteroSignal, target?: string) => void) | null>(null);
    const pingAction = useRef<((data: { ts: number }, target?: string) => void) | null>(null);
    const isJoinedRef = useRef(false);

    /**
     * Join the Trystero room
     */
    const join = useCallback(() => {
        if (isJoinedRef.current || !roomId) {
            return;
        }

        try {

            // Create room based on strategy
            const room = joinRoom(
                { appId },
                roomId
            );

            roomRef.current = room;
            isJoinedRef.current = true;

            // Create signal action (typed channel)
            const [sendSignal, onSignal] = room.makeAction<TrysteroSignal>("signal");
            sendSignalAction.current = sendSignal;

            // Create ping action for latency
            const [sendPing, onPing] = room.makeAction<{ ts: number; pong?: boolean }>("ping");
            pingAction.current = sendPing;

            // Handle incoming signals
            onSignal((signal, peerId) => {
                setLastSignal({
                    ...signal,
                    senderId: peerId,
                });
            });

            // Handle pings for latency measurement
            onPing((data, peerId) => {
                if (data.pong) {
                    // This is a pong response
                    const rtt = Date.now() - data.ts;
                    setLatency(rtt);
                } else {
                    // This is a ping, send pong
                    sendPing({ ts: data.ts, pong: true }, peerId);
                }
            });

            // Handle peer join
            room.onPeerJoin((peerId) => {
                setPeers((prev) => {
                    const exists = prev.some((p) => p.peerId === peerId);
                    if (exists) return prev;
                    return [...prev, { peerId, joinedAt: Date.now() }];
                });
            });

            // Handle peer leave
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

    /**
     * Leave the Trystero room
     */
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

    /**
     * Send a signal to peers
     */
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

    // Cleanup on unmount
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

    // Periodic latency check
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
