/**
 * Step-Up Header Injection
 *
 * The X-StepUp header is the transport for step-up tokens. tRPC's
 * httpBatchLink calls a `headers(opts)` function per outgoing batch —
 * we peek at this module-level slot AND inspect `opts.opList` to make
 * sure the batch actually carries a gated procedure before consuming.
 *
 * Why peek-then-consume: a stale-query refetch can race into the same
 * tick as `setPendingStepUpToken`. Without the path filter, that
 * background batch would steal the token and the gated mutation would
 * arrive header-less → 401 STEP_UP_REQUIRED for no security reason.
 *
 * Use:
 *   1. Hook calls `setPendingStepUpToken(token)` right before firing the
 *      gated mutation.
 *   2. main.tsx's headers(opts) checks opts.opList against
 *      GATED_PROCEDURE_PATHS — only then does it consume.
 *   3. The token is gone after that batch — accidentally re-firing a
 *      different mutation won't replay it.
 *
 * Single-token slot: the step-up dialog drives a single resolver, so
 * there is at most one gated mutation pending at any time. We do not
 * try to handle parallel-tab races — each tab keeps its own slot.
 */

let pendingStepUpToken: string | null = null;

export function setPendingStepUpToken(token: string): void {
    pendingStepUpToken = token;
}

/** Read without clearing — used to short-circuit headers() when no token is pending. */
export function peekPendingStepUpToken(): string | null {
    return pendingStepUpToken;
}

export function consumePendingStepUpToken(): string | null {
    const token = pendingStepUpToken;
    pendingStepUpToken = null;
    return token;
}

export function clearPendingStepUpToken(): void {
    pendingStepUpToken = null;
}

/**
 * tRPC procedure paths that require X-StepUp. Keep in lockstep with the
 * server-side `stepUpProcedure(scope)` call sites (see mfaRouter.ts and
 * passkeysRouter.ts). The list is the contract: a procedure not listed
 * here cannot consume the token even if one is pending — that's the
 * whole point of routing the slot through a path filter.
 */
export const GATED_PROCEDURE_PATHS: ReadonlySet<string> = new Set([
    "mfa.setup",
    "mfa.disable",
    "passkeys.generateRegistrationOptions",
    "passkeys.delete",
]);
