/**
 * Translate caught auth-flow errors into user-facing copy.
 *
 * The raw `error.message` from a tRPC mutation can be one of three things:
 *   1. A server-formatted TRPCError message ("Invalid verification code") — usable.
 *   2. A Zod validation issue — usable via `error.data.zodError`.
 *   3. A client-side parse / network failure (`JSON.parse: unexpected end of data…`,
 *      `Failed to fetch`, `NetworkError`) — leaks internal jargon to the toast.
 *
 * (3) happens when an upstream proxy returns an empty body, or when the
 * CSRF prefetch (`getCSRFToken` in `main.tsx`) hits a 200 with no body and
 * `res.json()` throws. Surfacing that string in a toast is bad UX.
 */
import { TRPCClientError } from '@trpc/client';

const PARSE_ERROR_PATTERNS = [
    /^JSON\.parse:/i,
    /^Unexpected token/i,
    /^Unexpected end of (JSON|input)/i,
    /^Failed to execute 'json'/i,
];

const NETWORK_ERROR_PATTERNS = [
    /^Failed to fetch/i,
    /^NetworkError/i,
    /^Load failed/i,
    /^Network request failed/i,
];

const CONNECTION_FALLBACK = "We couldn't reach the server. Check your connection and try again.";

export function extractAuthErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof TRPCClientError) {
        const fieldErrors = error.data?.zodError?.fieldErrors as
            | Record<string, string[] | undefined>
            | undefined;
        if (fieldErrors) {
            for (const key of Object.keys(fieldErrors)) {
                const first = fieldErrors[key]?.[0];
                if (first) return first;
            }
        }
        const formErrors = error.data?.zodError?.formErrors as string[] | undefined;
        if (formErrors?.[0]) return formErrors[0];

        const message = error.message;
        if (looksLikeRawClientFailure(message)) return CONNECTION_FALLBACK;
        if (message) return message;
        return fallback;
    }

    if (error instanceof Error) {
        if (looksLikeRawClientFailure(error.message)) return CONNECTION_FALLBACK;
        if (error.message) return error.message;
    }

    return fallback;
}

function looksLikeRawClientFailure(message: string | undefined): boolean {
    if (!message) return false;
    return (
        PARSE_ERROR_PATTERNS.some(p => p.test(message)) ||
        NETWORK_ERROR_PATTERNS.some(p => p.test(message))
    );
}
