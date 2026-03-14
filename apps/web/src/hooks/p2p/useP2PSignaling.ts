/**
 * useP2PSignaling Hook
 * Handles WebRTC signaling (offer/answer/ICE candidates) via tRPC
 * With optional Trystero serverless fallback
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { importPublicKey, generateKeyFingerprint } from "@/lib/p2pCrypto";
import type { P2PSharedRefs, P2PStateSetters, P2PSignal } from "./types";
import { DEFAULT_ICE_SERVERS } from "./types";
import { useTrysteroSignaling } from "./useTrysteroSignaling";
import { BACKEND_FAIL_THRESHOLD, SIGNAL_POLL_INTERVAL_MS } from "./constants";

interface UseP2PSignalingParams {
    refs: P2PSharedRefs;
    setters: P2PStateSetters;
    initializeWebRTC: (iceServers: RTCIceServer[], isInitiator: boolean) => Promise<void>;
    /** Enable Trystero serverless fallback (from admin config) */
    trysteroEnabled?: boolean;
}

/**
 * Hook for managing WebRTC signaling
 * Uses backend polling as primary, Trystero as fallback when enabled
 */
export function useP2PSignaling({
    refs,
    setters,
    initializeWebRTC,
    trysteroEnabled = false,
}: UseP2PSignalingParams) {
    const { setConnectionState, setTransferState, setPeerFingerprint } = setters;
    const sendSignalMutation = trpc.p2p.sendSignal.useMutation();
    const trpcUtils = trpc.useUtils();

    // Trystero room ID - using useState so changing it triggers re-render
    // This ensures useTrysteroSignaling gets the correct roomId
    const [trysteroRoomId, setTrysteroRoomId] = useState<string>("");

    // Trystero hook - only connects when roomId is non-empty
    const trystero = useTrysteroSignaling({
        appId: "cloudvault-quantum-mesh",
        roomId: trysteroRoomId,
        strategy: "bittorrent",
    });

    // Keep stable ref to trystero for cleanup and callbacks
    const trysteroRef = useRef(trystero);
    trysteroRef.current = trystero;

    // Track backend health for fallback decision
    const backendFailCount = useRef(0);
    const useBackendPrimary = useRef(true);

    // Signal deduplication to prevent processing same signal twice
    const processedSignals = useRef<Set<string>>(new Set());

    /**
     * Handle incoming signal with deduplication
     */
    const handleSignal = useCallback(async (signal: P2PSignal) => {
        // Deduplicate signals to prevent double processing when both channels active
        const signalKey = `${signal.signalType}-${signal.signalData.substring(0, 100)}-${signal.timestamp}`;
        if (processedSignals.current.has(signalKey)) {
            return;
        }
        processedSignals.current.add(signalKey);

        // Limit cache size to prevent memory leak
        if (processedSignals.current.size > 100) {
            const entries = Array.from(processedSignals.current);
            processedSignals.current = new Set(entries.slice(-50));
        }

        try {
            switch (signal.signalType) {
                case "recipient_joined":
                    await handleRecipientJoined(signal);
                    break;
                case "offer":
                    await handleOffer(signal);
                    break;
                case "answer":
                    await handleAnswer(signal);
                    break;
                case "ice_candidate":
                    await handleIceCandidate(signal);
                    break;
            }
        } catch {
            // Error handling signal - ignore
        }
    }, []);

    /**
     * Handle recipient_joined signal (sender receives this)
     */
    const handleRecipientJoined = useCallback(async (signal: P2PSignal) => {
        // Prevent multiple initializations
        if (refs.peerConnection.current) {
            return;
        }

        const data = JSON.parse(signal.signalData);

        // Import recipient's public key if provided (for E2E encryption)
        // Now base64url-encoded X25519 raw bytes
        if (data.recipientPublicKey) {
            try {
                const recipientPublicKeyRaw = importPublicKey(data.recipientPublicKey);
                refs.peerPublicKey.current = recipientPublicKeyRaw;

                // Generate fingerprint for display
                const fingerprint = await generateKeyFingerprint(recipientPublicKeyRaw);
                setPeerFingerprint(fingerprint);

                setTransferState(prev => ({
                    ...prev,
                    isEncrypted: true,
                    peerFingerprint: fingerprint,
                }));
            } catch {
                // Failed to import recipient's public key - ignore
            }
        }

        setConnectionState("connecting");

        // Initialize WebRTC as initiator (sender creates the offer)
        await initializeWebRTC(DEFAULT_ICE_SERVERS, true);
    }, [refs, setConnectionState, setTransferState, setPeerFingerprint, initializeWebRTC]);

    /**
     * Process any pending ICE candidates (call after setting remote description)
     */
    const processPendingIceCandidates = useCallback(async () => {
        const pc = refs.peerConnection.current;
        if (!pc || !pc.remoteDescription) return;

        const pending = refs.pendingIceCandidates.current;
        if (pending.length === 0) return;

        for (const candidate of pending) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
                // Failed to add pending ICE candidate - ignore
            }
        }

        // Clear the buffer
        refs.pendingIceCandidates.current = [];
    }, [refs]);

    /**
     * Handle SDP offer (receiver receives this)
     */
    const handleOffer = useCallback(async (signal: P2PSignal) => {
        const pc = refs.peerConnection.current;
        if (!pc) return;

        // Only process offer if we're in the correct state
        if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
            return;
        }

        const offer = JSON.parse(signal.signalData);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Process any ICE candidates that arrived before the offer
        await processPendingIceCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const currentSession = refs.session.current;
        if (currentSession?.sessionId) {
            await sendSignalMutation.mutateAsync({
                sessionId: currentSession.sessionId,
                signalType: "answer",
                signalData: JSON.stringify(answer),
            });
        }
    }, [refs, sendSignalMutation, processPendingIceCandidates]);

    /**
     * Handle SDP answer (sender receives this)
     */
    const handleAnswer = useCallback(async (signal: P2PSignal) => {
        const pc = refs.peerConnection.current;
        if (!pc) return;

        // Only process answer if we're in the correct state (have-local-offer)
        // This prevents the "Called in wrong state: stable" error
        if (pc.signalingState !== "have-local-offer") {
            return;
        }

        const answer = JSON.parse(signal.signalData);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        // Process any ICE candidates that arrived before the answer
        await processPendingIceCandidates();

        // Warning: Do NOT set connectionState("connected") here.
        // We must wait for the DataChannel to open (dc.onopen in useP2PWebRTC).
        // Setting it here causes race conditions where we try to send data before DC is ready.
    }, [refs, setConnectionState, processPendingIceCandidates]);

    /**
     * Handle ICE candidate
     * Buffers candidates if remote description is not yet set
     */
    const handleIceCandidate = useCallback(async (signal: P2PSignal) => {
        const pc = refs.peerConnection.current;
        if (!pc) return;

        const candidate = JSON.parse(signal.signalData) as RTCIceCandidateInit;

        // If remote description is not set yet, buffer the candidate
        if (!pc.remoteDescription) {
            refs.pendingIceCandidates.current.push(candidate);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
            // Failed to add ICE candidate - ignore
        }
    }, [refs]);

    /**
     * Start polling for signals
     * When trysteroEnabled, also joins Trystero room as fallback
     */
    const startSignalPolling = useCallback((sessionId: string) => {
        if (refs.pollingInterval.current) {
            clearInterval(refs.pollingInterval.current);
        }

        // Set Trystero room ID - this triggers re-render and useTrysteroSignaling joins
        if (trysteroEnabled) {
            setTrysteroRoomId(sessionId);
            // Note: useTrysteroSignaling will auto-join when roomId changes
        }

        const pollSignals = async () => {
            try {
                // Use fetch with fresh timestamp each time (fixes stale closure)
                const result = await trpcUtils.p2p.getSignals.fetch({
                    sessionId,
                    since: refs.lastSignalTimestamp.current,
                });

                // Backend responded - reset fail count
                backendFailCount.current = 0;
                useBackendPrimary.current = true;

                // Check if session no longer exists - stop polling gracefully
                if (result?.sessionNotFound) {
                    if (refs.pollingInterval.current) {
                        clearInterval(refs.pollingInterval.current);
                        refs.pollingInterval.current = null;
                    }
                    // Also leave Trystero
                    if (trysteroEnabled) {
                        trystero.leave();
                    }
                    return;
                }

                if (result?.signals && result.signals.length > 0) {
                    const currentUserId = refs.currentUserId.current;

                    for (const signal of result.signals) {
                        // Skip signals sent by ourselves to avoid processing our own messages
                        if (currentUserId && signal.senderId === currentUserId) {
                            continue;
                        }

                        await handleSignal(signal);
                        refs.lastSignalTimestamp.current = Math.max(
                            refs.lastSignalTimestamp.current,
                            signal.timestamp
                        );
                    }
                }
            } catch {
                // Track backend failures
                backendFailCount.current++;

                // If backend fails enough times and Trystero is enabled, switch to Trystero primary
                if (trysteroEnabled && backendFailCount.current >= BACKEND_FAIL_THRESHOLD) {
                    if (useBackendPrimary.current) {
                        useBackendPrimary.current = false;
                    }
                }
            }
        };

        // Initial fetch
        pollSignals();

        // Set up interval
        refs.pollingInterval.current = setInterval(pollSignals, SIGNAL_POLL_INTERVAL_MS);
    }, [refs, trpcUtils, handleSignal, trysteroEnabled, trystero]);

    /**
     * Process signals from Trystero (when enabled)
     * Validates signal type before processing
     */
    useEffect(() => {
        if (!trysteroEnabled || !trystero.lastSignal) return;

        const signal = trystero.lastSignal;

        // Validate signal type - only process known P2P signal types
        const validSignalTypes = ["recipient_joined", "offer", "answer", "ice_candidate"] as const;
        if (!validSignalTypes.includes(signal.type as typeof validSignalTypes[number])) {
            return;
        }

        // Convert Trystero signal to P2P signal format
        // Use senderId -1 to indicate Trystero source (prevents matching real user IDs)
        const p2pSignal: P2PSignal = {
            signalType: signal.type as P2PSignal["signalType"],
            signalData: signal.data,
            senderId: -1, // -1 indicates Trystero source
            timestamp: signal.timestamp,
        };

        // Process the signal
        handleSignal(p2pSignal).catch(() => {});
    }, [trysteroEnabled, trystero.lastSignal, handleSignal]);

    /**
     * Stop signal polling
     * Uses trysteroRef for stable reference
     */
    const stopSignalPolling = useCallback(() => {
        if (refs.pollingInterval.current) {
            clearInterval(refs.pollingInterval.current);
            refs.pollingInterval.current = null;
        }
        // Also leave Trystero using ref for stable reference
        if (trysteroEnabled) {
            trysteroRef.current.leave();
        }
        // Clear processed signals cache
        processedSignals.current.clear();
    }, [refs, trysteroEnabled]);

    return {
        handleSignal,
        startSignalPolling,
        stopSignalPolling,
        // Expose Trystero status for UI
        trysteroConnected: trysteroEnabled && trystero.isConnected,
        trysteroLatency: trystero.latency,
    };
}
