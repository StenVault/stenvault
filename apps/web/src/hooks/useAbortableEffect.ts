/**
 * useAbortableEffect — wraps `useEffect` with an `AbortController` that is
 * aborted when the effect re-runs or unmounts.
 *
 * Why: a recurring bug class in this codebase came from `useEffect` callers
 * that did `asyncOp().then(setState)` without cancelling the prior promise
 * when the effect re-ran. When the effect's deps include reactive values
 * (e.g., `isUnlocked`, `decryptFilenames` whose identity flips with
 * `isUnlocked`), the older promise can resolve AFTER the new one and
 * overwrite fresh state with stale data.
 *
 * This helper makes the cancel-on-rerun pattern a single primitive so call
 * sites stay short and ESLint's `exhaustive-deps` rule (configured with
 * `additionalHooks: "(useAbortableEffect)"`) still validates the dep array.
 *
 * Usage:
 *   useAbortableEffect((signal) => {
 *       fetchSomething({ signal }).then(result => {
 *           if (!signal.aborted) setData(result);
 *       });
 *   }, [someDep]);
 *
 *   // Or with a synchronous cleanup function:
 *   useAbortableEffect((signal) => {
 *       const sub = subscribe(...);
 *       return () => sub.unsubscribe();
 *   }, [topic]);
 */

import { useEffect } from 'react';

export function useAbortableEffect(
    effect: (signal: AbortSignal) => void | (() => void),
    deps: ReadonlyArray<unknown>,
): void {
    useEffect(() => {
        const ac = new AbortController();
        const cleanup = effect(ac.signal);
        return () => {
            ac.abort();
            if (typeof cleanup === 'function') cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
