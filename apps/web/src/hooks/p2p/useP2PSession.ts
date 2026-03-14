/**
 * useP2PSession Hook
 * Handles P2P session creation, joining, and cancellation
 */
import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { generateKeyPair, exportPublicKey, importPublicKey, generateKeyFingerprint } from "@/lib/p2pCrypto";
import type { P2PShareOptions } from "@/components/p2p/types";
import type { P2PSharedRefs, P2PStateSetters } from "./types";
import { INITIAL_TRANSFER_STATE } from "./constants";

interface UseP2PSessionParams {
    refs: P2PSharedRefs;
    setters: P2PStateSetters;
    startSignalPolling: (sessionId: string) => void;
    initializeWebRTC: (iceServers: RTCIceServer[], isInitiator: boolean) => Promise<void>;
    cleanup: () => void;
}

/**
 * Hook for managing P2P sessions
 */
export function useP2PSession({
    refs,
    setters,
    startSignalPolling,
    initializeWebRTC,
    cleanup,
}: UseP2PSessionParams) {
    const { setConnectionState, setTransferState, setSession, setError, setPeerFingerprint, setLocalFingerprint } = setters;

    // tRPC mutations
    const createSessionMutation = trpc.p2p.createSession.useMutation();
    const joinSessionMutation = trpc.p2p.joinSession.useMutation();
    const cancelSessionMutation = trpc.p2p.cancelSession.useMutation();

    /**
     * Ensure X25519 key pair exists
     */
    const ensureKeyPair = useCallback(async () => {
        if (!refs.myKeyPair.current) {
            const keyPair = await generateKeyPair();
            refs.myKeyPair.current = keyPair;
            const exported = await exportPublicKey(keyPair);
            refs.myFingerprint.current = exported.fingerprint;
            setLocalFingerprint(exported.fingerprint);
        }
        return refs.myKeyPair.current;
    }, [refs, setLocalFingerprint]);

    /**
     * Create a new P2P sharing session (sender side)
     */
    const createSession = useCallback(async (options: P2PShareOptions) => {
        try {
            setConnectionState("creating");
            setError(null);

            // Generate X25519 key pair for E2E encryption (if using double encryption)
            let senderPublicKeyBase64: string | undefined;
            if (options.encryptionMethod === "double" || options.encryptionMethod === "shamir") {
                const keyPair = await ensureKeyPair();
                senderPublicKeyBase64 = keyPair.publicKeyBase64;
            }

            const result = await createSessionMutation.mutateAsync({
                fileId: options.fileId,
                recipientEmail: options.recipientEmail,
                encryptionMethod: options.encryptionMethod,
                splitShares: options.splitShares,
                expiresInMinutes: options.expiresInMinutes,
                senderPublicKey: senderPublicKeyBase64,
            });

            // Store session for later use when recipient joins
            const newSession = {
                id: 0,
                sessionId: result.sessionId,
                senderId: 0,
                fileId: options.fileId,
                fileName: result.fileName,
                fileSize: result.fileSize,
                encryptionMethod: options.encryptionMethod,
                splitShares: options.splitShares,
                status: "waiting" as const,
                progress: 0,
                bytesTransferred: 0,
                expiresAt: result.expiresAt,
                createdAt: new Date(),
            };

            setSession(newSession);
            refs.session.current = newSession;

            // Set current user ID for signal filtering
            refs.currentUserId.current = result.senderId;

            setConnectionState("waiting");

            // Start polling for signals - sender will receive 'recipient_joined' when recipient connects
            startSignalPolling(result.sessionId);

            return {
                sessionId: result.sessionId,
                shareUrl: result.shareUrl,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create session";
            setError(message);
            setConnectionState("failed");
            throw err;
        }
    }, [refs, createSessionMutation, ensureKeyPair, setConnectionState, setSession, setError, startSignalPolling]);

    /**
     * Join an existing P2P session (receiver side)
     */
    const joinSession = useCallback(async (sessionId: string) => {
        try {
            setConnectionState("key_exchange");
            setError(null);

            // Generate our X25519 key pair for E2E encryption
            const keyPair = await ensureKeyPair();
            const recipientPublicKeyBase64 = keyPair.publicKeyBase64;

            const result = await joinSessionMutation.mutateAsync({
                sessionId,
                recipientPublicKey: recipientPublicKeyBase64,
            });

            setSession(result.session);
            refs.session.current = result.session;

            // Set current user ID for signal filtering (recipientId is the current user)
            refs.currentUserId.current = result.session.recipientId ?? null;

            setTransferState(prev => ({
                ...prev,
                totalBytes: result.session.fileSize || 0,
            }));

            // Import sender's public key if provided (for E2E encryption)
            if (result.session.senderPublicKey) {
                try {
                    const senderPublicKeyRaw = importPublicKey(result.session.senderPublicKey);
                    refs.peerPublicKey.current = senderPublicKeyRaw;

                    // Generate fingerprint for display
                    const fingerprint = await generateKeyFingerprint(senderPublicKeyRaw);
                    setPeerFingerprint(fingerprint);

                    setTransferState(prev => ({
                        ...prev,
                        isEncrypted: true,
                        peerFingerprint: fingerprint,
                    }));
                } catch (keyErr) {
                    console.error("Failed to import sender's public key:", keyErr);
                }
            }

            setConnectionState("connecting");

            // Initialize WebRTC connection
            await initializeWebRTC(result.iceServers, false);

            // Start polling for signals
            startSignalPolling(sessionId);

        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to join session";
            setError(message);
            setConnectionState("failed");
            throw err;
        }
    }, [refs, joinSessionMutation, ensureKeyPair, setConnectionState, setSession, setTransferState, setError, setPeerFingerprint, initializeWebRTC, startSignalPolling]);

    /**
     * Cancel the transfer
     */
    const cancelTransfer = useCallback(async () => {
        const currentSession = refs.session.current;
        if (currentSession?.sessionId) {
            try {
                await cancelSessionMutation.mutateAsync({ sessionId: currentSession.sessionId });
            } catch (err) {
                console.error("Error cancelling session:", err);
            }
        }
        cleanup();
        setConnectionState("idle");
        setTransferState(INITIAL_TRANSFER_STATE);
        setSession(null);
        refs.session.current = null;
        setError(null);
    }, [refs, cancelSessionMutation, cleanup, setConnectionState, setTransferState, setSession, setError]);

    return {
        createSession,
        joinSession,
        cancelTransfer,
        createSessionMutation,
        joinSessionMutation,
    };
}
