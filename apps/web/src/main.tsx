import { trpc } from "@/lib/trpc";
import { queryClient } from "@/lib/queryClient";
import { getValidAccessToken, clearAllTokens } from "@/lib/auth";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

// QueryClient is now imported from @/lib/queryClient

// CSRF Token Management with TTL
// PURPOSE: Prevents stale token errors when server rotates tokens

const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * CSRF Token TTL: 45 minutes (in milliseconds)
 * This should be less than the server token rotation period (typically 1 hour)
 * to ensure we refresh before the token becomes invalid
 */
const CSRF_TOKEN_TTL_MS = 45 * 60 * 1000;

/** Cached CSRF token */
let csrfToken: string | null = null;

/** Expiry timestamp for cached token */
let csrfTokenExpiry: number | null = null;

/** Singleton promise to prevent concurrent token requests */
let csrfTokenPromise: Promise<string> | null = null;

/**
 * Fetches CSRF token from the server
 * Uses a singleton promise to prevent concurrent requests
 * Implements TTL to prevent stale token errors
 */
async function getCSRFToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (not expired)
  if (csrfToken && csrfTokenExpiry && now < csrfTokenExpiry) {
    return csrfToken;
  }

  // If already fetching, return existing promise
  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = fetch("/api/csrf-token", {
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error("Failed to fetch CSRF token");
      }
      const data = await res.json();
      csrfToken = data.csrfToken;
      csrfTokenExpiry = Date.now() + CSRF_TOKEN_TTL_MS;
      return csrfToken!;
    })
    .finally(() => {
      csrfTokenPromise = null;
    });

  return csrfTokenPromise;
}

/**
 * Refreshes CSRF token (call after auth state changes)
 */
export async function refreshCSRFToken(): Promise<void> {
  csrfToken = null;
  csrfTokenExpiry = null;
  await getCSRFToken();
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  const isEmailNotVerified = error.message === "EMAIL_NOT_VERIFIED" || error.message.includes("EMAIL_NOT_VERIFIED");

  if (isUnauthorized) {
    // Don't redirect on public routes — UNAUTHORIZED is from optional features (e.g. useMasterKey on ReceivePage)
    const path = window.location.pathname;
    const publicPrefixes = ['/send', '/s/', '/landing', '/pricing', '/recover', '/p2p/', '/ops-deck', '/terms', '/privacy', '/auth/'];
    if (publicPrefixes.some(p => path === p || path.startsWith(p))) return;

    // Clear tokens on unauthorized (they might be revoked)
    clearAllTokens();
    window.location.href = '/auth/login';
    return;
  }

  // Handle email not verified - trigger custom event that EmailVerificationProvider can listen to
  if (isEmailNotVerified) {
    // Dispatch custom event for email verification modal
    window.dispatchEvent(new CustomEvent('email-not-verified'));
    return;
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        // Get CSRF token for mutations
        const csrfToken = await getCSRFToken();

        // Get access token with auto-refresh
        const accessToken = await getValidAccessToken();

        return {
          [CSRF_HEADER_NAME]: csrfToken,
          // Add Bearer token for new refresh token system
          // Cookies still work as primary auth for backward compatibility
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        };
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
