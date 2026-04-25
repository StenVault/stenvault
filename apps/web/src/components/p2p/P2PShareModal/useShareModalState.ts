/**
 * useShareModalState Hook
 * Manages the form state for P2P share modal
 */
import { useState, useCallback } from "react";
import { toast } from "@/lib/toast";
import type { EncryptionMethod } from "../types";
import { generateAndSplitKey, type EncodedShare } from "@/lib/shamirSecretSharing";

interface ShareModalState {
    recipientEmail: string;
    encryptionMethod: EncryptionMethod;
    expiresInMinutes: number;
    shamirTotalShares: number;
    shamirThreshold: number;
    shamirShares: EncodedShare[];
    shareUrl: string | null;
}

const INITIAL_STATE: ShareModalState = {
    recipientEmail: "",
    encryptionMethod: "double",
    expiresInMinutes: 60,
    shamirTotalShares: 5,
    shamirThreshold: 3,
    shamirShares: [],
    shareUrl: null,
};

export function useShareModalState() {
    const [state, setState] = useState<ShareModalState>(INITIAL_STATE);

    const setRecipientEmail = useCallback((email: string) => {
        setState(prev => ({ ...prev, recipientEmail: email }));
    }, []);

    const setEncryptionMethod = useCallback((method: EncryptionMethod) => {
        setState(prev => ({ ...prev, encryptionMethod: method }));
    }, []);

    const setExpiresInMinutes = useCallback((minutes: number) => {
        setState(prev => ({ ...prev, expiresInMinutes: minutes }));
    }, []);

    const setShamirTotalShares = useCallback((total: number) => {
        setState(prev => ({
            ...prev,
            shamirTotalShares: total,
            // Ensure threshold doesn't exceed total
            shamirThreshold: Math.min(prev.shamirThreshold, total),
        }));
    }, []);

    const setShamirThreshold = useCallback((threshold: number) => {
        setState(prev => ({ ...prev, shamirThreshold: threshold }));
    }, []);

    const setShareUrl = useCallback((url: string | null) => {
        setState(prev => ({ ...prev, shareUrl: url }));
    }, []);

    const setShamirShares = useCallback((shares: EncodedShare[]) => {
        setState(prev => ({ ...prev, shamirShares: shares }));
    }, []);

    /**
     * Generate Shamir shares if using Shamir encryption
     */
    const generateShamirShares = useCallback(async (): Promise<EncodedShare[]> => {
        if (state.encryptionMethod !== "shamir") {
            return [];
        }

        try {
            const { shares } = await generateAndSplitKey(
                32,
                state.shamirTotalShares,
                state.shamirThreshold
            );
            setState(prev => ({ ...prev, shamirShares: shares }));
            return shares;
        } catch (error) {
            toast.error("Failed to generate Shamir shares");
            throw error;
        }
    }, [state.encryptionMethod, state.shamirTotalShares, state.shamirThreshold]);

    /**
     * Reset all state to initial values
     */
    const reset = useCallback(() => {
        setState(INITIAL_STATE);
    }, []);

    return {
        // State values
        ...state,

        // Setters
        setRecipientEmail,
        setEncryptionMethod,
        setExpiresInMinutes,
        setShamirTotalShares,
        setShamirThreshold,
        setShareUrl,
        setShamirShares,

        // Actions
        generateShamirShares,
        reset,

        // Computed
        isShamir: state.encryptionMethod === "shamir",
        isSessionActive: state.shareUrl !== null,
    };
}
