import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Crypto Store
 * Manages E2E encryption state globally — hybrid PQC key cache
 */

interface HybridPublicKeyCache {
    [userId: number]: {
        x25519PublicKey: string;  // base64
        mlkem768PublicKey: string; // base64
        keyVersion: number;
        cachedAt: number;
    };
}

interface CryptoStore {
    // State
    hybridPublicKeyCache: HybridPublicKeyCache;

    // Actions
    cacheHybridPublicKey: (userId: number, x25519PublicKey: string, mlkem768PublicKey: string, keyVersion: number) => void;
    getCachedHybridPublicKey: (userId: number) => { x25519PublicKey: string; mlkem768PublicKey: string; keyVersion: number } | null;
    clearHybridPublicKeyCache: () => void;
    invalidateCachedHybridKey: (userId: number) => void;
}

export const useCryptoStore = create<CryptoStore>()(
    persist(
        (set, get) => ({
            // Initial state
            hybridPublicKeyCache: {},

            // Cache a user's hybrid public key
            cacheHybridPublicKey: (userId: number, x25519PublicKey: string, mlkem768PublicKey: string, keyVersion: number) => {
                set((state) => ({
                    hybridPublicKeyCache: {
                        ...state.hybridPublicKeyCache,
                        [userId]: {
                            x25519PublicKey,
                            mlkem768PublicKey,
                            keyVersion,
                            cachedAt: Date.now(),
                        },
                    },
                }));
            },

            // Get cached hybrid public key for a user
            getCachedHybridPublicKey: (userId: number) => {
                const cached = get().hybridPublicKeyCache[userId];

                if (!cached) return null;

                // Invalidate cache after 24 hours
                const MAX_CACHE_AGE = 24 * 60 * 60 * 1000;
                if (Date.now() - cached.cachedAt > MAX_CACHE_AGE) {
                    get().invalidateCachedHybridKey(userId);
                    return null;
                }

                return {
                    x25519PublicKey: cached.x25519PublicKey,
                    mlkem768PublicKey: cached.mlkem768PublicKey,
                    keyVersion: cached.keyVersion,
                };
            },

            // Clear all cached hybrid public keys
            clearHybridPublicKeyCache: () => {
                set({ hybridPublicKeyCache: {} });
            },

            // Invalidate a specific user's cached hybrid key
            invalidateCachedHybridKey: (userId: number) => {
                set((state) => {
                    const { [userId]: _, ...rest } = state.hybridPublicKeyCache;
                    return { hybridPublicKeyCache: rest };
                });
            },
        }),
        {
            name: "crypto-storage",
            // Don't persist key cache — fetch fresh keys each session
            partialize: () => ({}),
        }
    )
);
