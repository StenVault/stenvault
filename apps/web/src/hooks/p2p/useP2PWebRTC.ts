/**
 * useP2PWebRTC Hook
 * Handles WebRTC connection setup and data channel management
 */
import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { P2PSharedRefs, P2PStateSetters } from "./types";

interface UseP2PWebRTCParams {
    refs: P2PSharedRefs;
    setters: P2PStateSetters;
    onDataChannelMessage: (data: ArrayBuffer | string) => void;
}

export function useP2PWebRTC({
    refs,
    setters,
    onDataChannelMessage,
}: UseP2PWebRTCParams) {
    const { setConnectionState, setError } = setters;
    const sendSignalMutation = trpc.p2p.sendSignal.useMutation();

    const initializeWebRTC = useCallback(async (
        iceServers: RTCIceServer[],
        isInitiator: boolean
    ) => {
        try {
            const pc = new RTCPeerConnection({ iceServers });
            refs.peerConnection.current = pc;

            // Use ref to avoid stale closure
            pc.onicecandidate = async (event) => {
                const currentSession = refs.session.current;
                if (event.candidate && currentSession?.sessionId) {
                    try {
                        await sendSignalMutation.mutateAsync({
                            sessionId: currentSession.sessionId,
                            signalType: "ice_candidate",
                            signalData: JSON.stringify(event.candidate),
                        });
                    } catch (err) {
                        // Don't crash on ICE candidate send failure - connection may still work
                        console.warn("[P2P] Failed to send ICE candidate:", err);
                    }
                }
            };

            pc.onconnectionstatechange = () => {
                // If transfer already completed, don't change state
                if (refs.isTransferComplete.current) {
                    return;
                }

                switch (pc.connectionState) {
                    // case "connected":
                    //     // Don't set connected here. Wait for DataChannel.onopen
                    //     // setConnectionState("connected");
                    //     break;
                    case "disconnected":
                    case "closed":
                        setConnectionState("disconnected");
                        break;
                    case "failed":
                        setError("Connection failed");
                        setConnectionState("failed");
                        break;
                }
            };

            if (isInitiator) {
                const dc = pc.createDataChannel("fileTransfer", {
                    ordered: true,
                });
                setupDataChannel(dc);
            } else {
                pc.ondatachannel = (event) => {
                    setupDataChannel(event.channel);
                };
            }

            // Use ref to avoid stale closure
            const currentSession = refs.session.current;
            if (isInitiator && currentSession?.sessionId) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                await sendSignalMutation.mutateAsync({
                    sessionId: currentSession.sessionId,
                    signalType: "offer",
                    signalData: JSON.stringify(offer),
                });
            }

        } catch (err) {
            const message = err instanceof Error ? err.message : "WebRTC initialization failed";
            setError(message);
            setConnectionState("failed");
        }
    }, [refs, sendSignalMutation, setConnectionState, setError]);

    const setupDataChannel = useCallback((dc: RTCDataChannel) => {
        refs.dataChannel.current = dc;

        dc.onopen = () => {
            setConnectionState("connected");
        };

        dc.onclose = () => {
            // If transfer already completed successfully, maintain completed state
            if (refs.isTransferComplete.current) {
                setConnectionState("completed");
                return;
            }

            // Fallback check using progress ref
            if (refs.transferProgress.current >= 100) {
                setConnectionState("completed");
            } else {
                setConnectionState("disconnected");
            }
        };

        dc.onerror = () => {
            // If transfer already completed, ignore errors
            if (refs.isTransferComplete.current) {
                return;
            }

            setError("Data channel error");
            setConnectionState("failed");
        };

        dc.onmessage = (event) => {
            onDataChannelMessage(event.data);
        };
    }, [refs, setConnectionState, setError, onDataChannelMessage]);

    return {
        initializeWebRTC,
        setupDataChannel,
        sendSignalMutation,
    };
}
