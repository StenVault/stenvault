import { trpc } from "@/lib/trpc";
import { queryClient } from "@/lib/queryClient";
import { clearAllTokens, refreshSession } from "@/lib/auth";
import { consumePendingStepUpToken, peekPendingStepUpToken, GATED_PROCEDURE_PATHS } from "@/lib/stepUpHeader";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "./index.css";

// ═══════════════════════════════════════════════════════════════════════════════
// CSRF Token Management with TTL
// ═══════════════════════════════════════════════════════════════════════════════

const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_TTL_MS = 45 * 60 * 1000;

let csrfToken: string | null = null;
let csrfTokenExpiry: number | null = null;
let csrfTokenPromise: Promise<string> | null = null;

async function getCSRFToken(): Promise<string> {
  const now = Date.now();

  if (csrfToken && csrfTokenExpiry && now < csrfTokenExpiry) {
    return csrfToken;
  }

  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = fetch("/api/csrf-token", {
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        csrfToken = null;
        csrfTokenExpiry = null;
        throw new Error("Failed to fetch CSRF token");
      }
      // An empty 200 (proxy quirk / HMR race) makes res.json() throw
      // "JSON.parse: unexpected end of data" — that string would otherwise
      // surface raw in toasts. Convert it to a stable, generic error.
      let data: { csrfToken?: string };
      try {
        data = await res.json();
      } catch {
        csrfToken = null;
        csrfTokenExpiry = null;
        throw new Error("Failed to fetch CSRF token");
      }
      if (!data?.csrfToken) {
        csrfToken = null;
        csrfTokenExpiry = null;
        throw new Error("Failed to fetch CSRF token");
      }
      csrfToken = data.csrfToken;
      csrfTokenExpiry = Date.now() + CSRF_TOKEN_TTL_MS;
      return csrfToken!;
    })
    .catch((err) => {
      csrfToken = null;
      csrfTokenExpiry = null;
      throw err;
    })
    .finally(() => {
      csrfTokenPromise = null;
    });

  return csrfTokenPromise;
}

export async function refreshCSRFToken(): Promise<void> {
  csrfToken = null;
  csrfTokenExpiry = null;
  await getCSRFToken();
}

/** Shared refresh promise so concurrent 401s wait for the same refresh */
let refreshPromise: Promise<boolean> | null = null;

const redirectToLoginIfUnauthorized = async (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  const isEmailNotVerified = error.message === "EMAIL_NOT_VERIFIED" || error.message.includes("EMAIL_NOT_VERIFIED");

  // Step-up errors are handled by the StepUpDialog — the user sees a re-auth
  // prompt, not a logout redirect. The session is still valid; only the
  // sensitive mutation needs proof.
  const isStepUpError =
    error.message === "STEP_UP_REQUIRED" ||
    error.message === "STEP_UP_INVALID" ||
    error.message === "STEP_UP_FAILED" ||
    error.message === "STEP_UP_METHOD_NOT_ALLOWED";
  if (isStepUpError) return;

  if (isUnauthorized) {
    const path = window.location.pathname;
    const publicPrefixes = ['/send', '/s/', '/recover', '/terms', '/privacy', '/auth/'];
    if (publicPrefixes.some(p => path === p || path.startsWith(p))) return;

    // All concurrent 401s share the same refresh attempt
    if (!refreshPromise) {
      refreshPromise = refreshSession()
        .catch(() => false)
        .finally(() => { refreshPromise = null; });
    }

    const refreshed = await refreshPromise;

    if (refreshed) {
      await refreshCSRFToken().catch(() => {});
      queryClient.invalidateQueries();
      return;
    }

    clearAllTokens();
    window.location.href = '/auth/login';
    return;
  }

  if (isEmailNotVerified) {
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
      async headers(opts) {
        const csrfToken = await getCSRFToken();
        const headers: Record<string, string> = {
          [CSRF_HEADER_NAME]: csrfToken,
          // Auth is handled by HttpOnly cookies (credentials: 'include')
        };
        // Only attach (and consume) the stepUpToken if this batch carries a
        // gated procedure. Otherwise a stale-query refetch racing into a
        // batch right after `setPendingStepUpToken` would steal the token,
        // leaving the actual gated mutation header-less.
        if (peekPendingStepUpToken() && opts.opList.some(op => GATED_PROCEDURE_PATHS.has(op.path))) {
          const token = consumePendingStepUpToken();
          if (token) headers["x-stepup"] = token;
        }
        return headers;
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
