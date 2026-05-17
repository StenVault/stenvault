/**
 * UnlockBoundary — defense-in-depth render gate.
 *
 * Renders `fallback` when the vault is not yet configured or is locked,
 * `children` otherwise. Children's hooks therefore do not execute while
 * the vault is locked — making it structurally impossible for them to
 * trigger the vault-lock state-sync bug class.
 *
 * This is additive to per-hook AbortController/derived-state fixes — it
 * does not replace them. Callers that need to render content with locked
 * placeholders (file lists with `[Encrypted]` names) should NOT wrap in
 * UnlockBoundary; that would change UX. Wrap only subtrees where the
 * feature genuinely requires unlocked state (preview, decrypt-then-show).
 */

import { ReactNode } from 'react';
import { useMasterKey } from '@/hooks/useMasterKey';

interface Props {
    children: ReactNode;
    /** Rendered when vault is locked or not yet configured. */
    fallback: ReactNode;
}

export function UnlockBoundary({ children, fallback }: Props) {
    const { isConfigured, isUnlocked } = useMasterKey();
    if (!isConfigured || !isUnlocked) return <>{fallback}</>;
    return <>{children}</>;
}
