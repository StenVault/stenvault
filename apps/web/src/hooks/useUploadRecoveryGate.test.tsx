/**
 * Regression guard for the Trusted Circle upload soft-gate. The Deferred
 * pattern inside `useUploadRecoveryGate` is the tricky bit — unresolved
 * promises can dangle, stale calls can double-resolve, and unmount must
 * release waiters so the caller doesn't park forever.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const shamirStatusRef = { isConfigured: false };
// Cover the full TanStack Query surface the hook might read. Today it
// only touches `.data`, but if the hook later guards on isLoading /
// isError (like TrustedCircleNudge does), the mock shouldn't silently
// appear "loaded successfully" and mask the behavior change in tests.
vi.mock('@/lib/trpc', () => ({
    trpc: {
        shamirRecovery: {
            getStatus: {
                useQuery: () => ({
                    data: { isConfigured: shamirStatusRef.isConfigured },
                    isLoading: false,
                    isError: false,
                    error: null,
                }),
            },
        },
    },
}));

import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useUploadRecoveryGate } from './useUploadRecoveryGate';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
);

function setGateState(opts: {
    uploadCount?: number;
    dismissed?: boolean;
    shamirConfigured?: boolean;
}) {
    localStorage.clear();
    if (opts.uploadCount !== undefined) {
        localStorage.setItem('stenvault-upload-count', String(opts.uploadCount));
    }
    if (opts.dismissed) {
        localStorage.setItem('stenvault-upload-gate-dismissed', '1');
    }
    shamirStatusRef.isConfigured = opts.shamirConfigured ?? false;
}

beforeEach(() => {
    mockNavigate.mockReset();
    localStorage.clear();
    shamirStatusRef.isConfigured = false;
});

describe('useUploadRecoveryGate', () => {
    it('resolves beforeUpload(true) immediately when the count is below the threshold', async () => {
        setGateState({ uploadCount: 1 });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        const proceed = await result.current.beforeUpload();
        expect(proceed).toBe(true);
        expect(result.current.open).toBe(false);
    });

    it('resolves beforeUpload(true) when Shamir is configured, regardless of count', async () => {
        setGateState({ uploadCount: 10, shamirConfigured: true });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        const proceed = await result.current.beforeUpload();
        expect(proceed).toBe(true);
        expect(result.current.open).toBe(false);
    });

    it('resolves beforeUpload(true) when the gate was permanently dismissed', async () => {
        setGateState({ uploadCount: 10, dismissed: true });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        const proceed = await result.current.beforeUpload();
        expect(proceed).toBe(true);
        expect(result.current.open).toBe(false);
    });

    it('opens the modal and resolves(true) when the user chose "continue anyway"', async () => {
        setGateState({ uploadCount: 2 });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        let proceed: boolean | null = null;
        act(() => {
            result.current.beforeUpload().then((v) => {
                proceed = v;
            });
        });

        expect(result.current.open).toBe(true);

        act(() => {
            result.current.onContinue();
        });

        // Flush the microtask queue so the pending promise callback runs.
        await act(async () => {
            await Promise.resolve();
        });

        expect(proceed).toBe(true);
        expect(result.current.open).toBe(false);
        // "Continue anyway" permanently dismisses the gate.
        expect(localStorage.getItem('stenvault-upload-gate-dismissed')).toBe('1');
    });

    it('resolves(false) and navigates when the user picks "Set up recovery"', async () => {
        setGateState({ uploadCount: 2 });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        let proceed: boolean | null = null;
        act(() => {
            result.current.beforeUpload().then((v) => {
                proceed = v;
            });
        });

        act(() => {
            result.current.onSetupRecovery();
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(proceed).toBe(false);
        expect(result.current.open).toBe(false);
        expect(mockNavigate).toHaveBeenCalledWith('/settings/encryption?setup=shamir');
        // Pure "setup recovery" must NOT permanently dismiss — the gate
        // should re-arm if the user later leaves the flow without configuring.
        expect(localStorage.getItem('stenvault-upload-gate-dismissed')).toBeNull();
    });

    it('resolves(false) on dismiss (Escape / overlay close) without writing the dismissal flag', async () => {
        setGateState({ uploadCount: 2 });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        let proceed: boolean | null = null;
        act(() => {
            result.current.beforeUpload().then((v) => {
                proceed = v;
            });
        });

        act(() => {
            result.current.onDismiss();
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(proceed).toBe(false);
        expect(result.current.open).toBe(false);
        expect(localStorage.getItem('stenvault-upload-gate-dismissed')).toBeNull();
    });

    it('resolves the pending deferred(false) when the hook unmounts mid-decision', async () => {
        setGateState({ uploadCount: 2 });
        const { result, unmount } = renderHook(() => useUploadRecoveryGate(), {
            wrapper,
        });

        let proceed: boolean | null = null;
        act(() => {
            result.current.beforeUpload().then((v) => {
                proceed = v;
            });
        });

        expect(result.current.open).toBe(true);

        unmount();

        await act(async () => {
            await Promise.resolve();
        });

        expect(proceed).toBe(false);
    });

    it('cancels the stale deferred(false) when beforeUpload is called twice back-to-back', async () => {
        setGateState({ uploadCount: 2 });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        let firstProceed: boolean | null = null;
        let secondProceed: boolean | null = null;

        act(() => {
            result.current.beforeUpload().then((v) => {
                firstProceed = v;
            });
        });

        act(() => {
            result.current.beforeUpload().then((v) => {
                secondProceed = v;
            });
        });

        // Stale call must resolve(false) as soon as the second arms.
        await act(async () => {
            await Promise.resolve();
        });
        expect(firstProceed).toBe(false);
        expect(secondProceed).toBeNull();

        // Only the second deferred is live — continuing resolves it.
        act(() => {
            result.current.onContinue();
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(secondProceed).toBe(true);
    });

    it('noteUploadCompleted increments the persisted count so the gate fires after threshold crossings', () => {
        setGateState({ uploadCount: 0 });
        const { result } = renderHook(() => useUploadRecoveryGate(), { wrapper });

        act(() => {
            result.current.noteUploadCompleted();
            result.current.noteUploadCompleted();
        });

        expect(localStorage.getItem('stenvault-upload-count')).toBe('2');
    });
});
