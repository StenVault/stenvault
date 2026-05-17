/**
 * useAbortableEffect — wrapper-around-useEffect contract tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAbortableEffect } from './useAbortableEffect';

describe('useAbortableEffect', () => {
    it('passes a fresh AbortSignal to the effect each run', () => {
        const seenSignals: AbortSignal[] = [];

        const { rerender } = renderHook(
            ({ dep }: { dep: number }) => {
                useAbortableEffect((signal) => {
                    seenSignals.push(signal);
                }, [dep]);
            },
            { initialProps: { dep: 1 } },
        );

        rerender({ dep: 2 });
        rerender({ dep: 3 });

        expect(seenSignals).toHaveLength(3);
        // Each run gets a different signal instance.
        expect(seenSignals[0]).not.toBe(seenSignals[1]);
        expect(seenSignals[1]).not.toBe(seenSignals[2]);
    });

    it('aborts the previous signal before re-running on dep change', () => {
        const aborts: boolean[] = [];

        const { rerender } = renderHook(
            ({ dep }: { dep: number }) => {
                useAbortableEffect((signal) => {
                    // Capture the abort state asynchronously so we can check it
                    // after the next render's cleanup fires.
                    setTimeout(() => aborts.push(signal.aborted), 0);
                }, [dep]);
            },
            { initialProps: { dep: 1 } },
        );

        rerender({ dep: 2 });
        rerender({ dep: 3 });

        // After re-runs, the previous signals should all be aborted.
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                // Signals 1 and 2 (the ones replaced by re-runs) must be aborted.
                // Signal 3 (the latest) is still alive — its cleanup hasn't run.
                expect(aborts[0]).toBe(true);
                expect(aborts[1]).toBe(true);
                expect(aborts[2]).toBe(false);
                resolve();
            }, 10);
        });
    });

    it('aborts on unmount', () => {
        let capturedSignal: AbortSignal | null = null;

        const { unmount } = renderHook(() => {
            useAbortableEffect((signal) => {
                capturedSignal = signal;
            }, []);
        });

        expect(capturedSignal).not.toBeNull();
        expect(capturedSignal!.aborted).toBe(false);

        unmount();

        expect(capturedSignal!.aborted).toBe(true);
    });

    it('runs synchronous cleanup function alongside abort', () => {
        const cleanup = vi.fn();

        const { rerender } = renderHook(
            ({ dep }: { dep: number }) => {
                useAbortableEffect(() => {
                    return cleanup;
                }, [dep]);
            },
            { initialProps: { dep: 1 } },
        );

        expect(cleanup).not.toHaveBeenCalled();

        rerender({ dep: 2 });

        // Cleanup of the first run fires when deps change.
        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});
