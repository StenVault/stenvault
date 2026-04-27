/**
 * useStepUp — reusable hook for gating sensitive mutations behind a
 * step-up identity check.
 *
 * Usage:
 *
 *   const { requireStepUp, dialog } = useStepUp("mfa:enable");
 *   ...
 *   const handleEnable = () => {
 *     requireStepUp(async () => {
 *       await mutation.mutateAsync({ ... });
 *     });
 *   };
 *   return <>{dialog}{...your UI...}</>;
 *
 * The hook stages the step-up token in the tRPC link's pending slot
 * (see `lib/stepUpHeader.ts`) before invoking your resolver, so the
 * gated mutation automatically picks it up via the `X-StepUp` header.
 *
 * Hook discipline (memory `react-hook-discipline`):
 *  - resolver lives in a ref, never in deps
 *  - all hooks above any early return
 *  - no useMutation/useUtils objects in deps
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { StepUpDialog } from "@/components/auth/StepUpDialog";
import { setPendingStepUpToken, clearPendingStepUpToken } from "@/lib/stepUpHeader";

type StepUpScope =
    | "mfa:enable"
    | "mfa:disable"
    | "passkey:register"
    | "passkey:delete";

export type StepUpResolver = () => Promise<void> | void;

export interface UseStepUpReturn {
    requireStepUp: (resolver: StepUpResolver) => void;
    dialog: ReactNode;
}

export function useStepUp(scope: StepUpScope): UseStepUpReturn {
    const resolverRef = useRef<StepUpResolver | null>(null);
    const [open, setOpen] = useState(false);

    const requireStepUp = useCallback((resolver: StepUpResolver) => {
        resolverRef.current = resolver;
        setOpen(true);
    }, []);

    const handleSuccess = useCallback(async (token: string) => {
        const resolver = resolverRef.current;
        resolverRef.current = null;
        setOpen(false);
        // Stage the token so the very next tRPC mutation in the resolver
        // body picks it up via the `X-StepUp` header.
        setPendingStepUpToken(token);
        try {
            if (resolver) await resolver();
        } finally {
            // Defensive: if the resolver didn't actually fire a request
            // (caught error before mutation), clear the slot so a stray
            // future request can't accidentally consume it.
            clearPendingStepUpToken();
        }
    }, []);

    const handleCancel = useCallback(() => {
        resolverRef.current = null;
        setOpen(false);
    }, []);

    const dialog = (
        <StepUpDialog
            scope={scope}
            open={open}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
        />
    );

    return { requireStepUp, dialog };
}
