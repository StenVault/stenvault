/**
 * Tracks the Trusted Circle soft-gate state across the Drive upload flow.
 *
 * The gate fires once the user is about to start their 3rd upload on an
 * account that still has no Shamir recovery configured, unless they
 * permanently dismissed it on this device. The gate is decoupled from
 * the uploader — the consumer wraps each upload-triggering action with
 * `beforeUpload()` and awaits the returned promise; the hook owns the
 * modal state, the deferred that the modal resolves, and the counters
 * that localStorage persists.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

const UPLOAD_COUNT_KEY = 'stenvault-upload-count';
const GATE_DISMISSED_KEY = 'stenvault-upload-gate-dismissed';
const GATE_THRESHOLD = 2; // block the 3rd upload (count of completed uploads ≥ 2)

function readUploadCount(): number {
    try {
        const raw = localStorage.getItem(UPLOAD_COUNT_KEY);
        if (!raw) return 0;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    } catch {
        return 0;
    }
}

function writeUploadCount(count: number): void {
    try {
        localStorage.setItem(UPLOAD_COUNT_KEY, String(Math.max(0, Math.floor(count))));
    } catch {
        // Private mode — gate just re-arms next session, acceptable.
    }
}

function readDismissed(): boolean {
    try {
        return localStorage.getItem(GATE_DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

function writeDismissed(): void {
    try {
        localStorage.setItem(GATE_DISMISSED_KEY, '1');
    } catch {
        // Acceptable — the user will see the gate once more and can
        // dismiss again.
    }
}

export interface UploadRecoveryGateState {
    /** `true` while the gate modal is visible. */
    open: boolean;
    /**
     * Resolves `true` if the upload should proceed (no gate, or user chose
     * "continue anyway"). Resolves `false` if the user chose "set up
     * recovery" (we navigate away) or dismissed the modal without a choice.
     */
    beforeUpload: () => Promise<boolean>;
    /** Increment the count after a successful upload. */
    noteUploadCompleted: () => void;
    /** Modal handler — user chose to continue without setting up recovery. */
    onContinue: () => void;
    /** Modal handler — user chose to set up Trusted Circle now. */
    onSetupRecovery: () => void;
    /** Modal handler — Escape / overlay / any non-choice close. */
    onDismiss: () => void;
}

export function useUploadRecoveryGate(): UploadRecoveryGateState {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const pendingResolveRef = useRef<((proceed: boolean) => void) | null>(null);

    const { data: status } = trpc.shamirRecovery.getStatus.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });
    const shamirConfigured = status?.isConfigured === true;

    // Resolve any in-flight gate promise if the consumer unmounts mid-decision.
    useEffect(() => {
        return () => {
            const resolve = pendingResolveRef.current;
            pendingResolveRef.current = null;
            resolve?.(false);
        };
    }, []);

    const shouldGate = useCallback((): boolean => {
        if (shamirConfigured) return false;
        if (readDismissed()) return false;
        return readUploadCount() >= GATE_THRESHOLD;
    }, [shamirConfigured]);

    const beforeUpload = useCallback((): Promise<boolean> => {
        if (!shouldGate()) return Promise.resolve(true);
        // If a previous deferred is still pending (rare — double click),
        // cancel it as "did not proceed" before arming a new one.
        const stale = pendingResolveRef.current;
        pendingResolveRef.current = null;
        stale?.(false);

        return new Promise<boolean>((resolve) => {
            pendingResolveRef.current = resolve;
            setOpen(true);
        });
    }, [shouldGate]);

    const noteUploadCompleted = useCallback(() => {
        writeUploadCount(readUploadCount() + 1);
    }, []);

    const resolvePending = useCallback((proceed: boolean) => {
        const resolve = pendingResolveRef.current;
        pendingResolveRef.current = null;
        resolve?.(proceed);
    }, []);

    const onContinue = useCallback(() => {
        writeDismissed();
        setOpen(false);
        resolvePending(true);
    }, [resolvePending]);

    const onSetupRecovery = useCallback(() => {
        setOpen(false);
        resolvePending(false);
        navigate('/settings/encryption?setup=shamir');
    }, [navigate, resolvePending]);

    const onDismiss = useCallback(() => {
        setOpen(false);
        resolvePending(false);
    }, [resolvePending]);

    return {
        open,
        beforeUpload,
        noteUploadCompleted,
        onContinue,
        onSetupRecovery,
        onDismiss,
    };
}
