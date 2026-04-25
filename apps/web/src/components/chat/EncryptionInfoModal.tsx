/**
 * Encryption details for an active chat. Opened from the caption link
 * under the peer name in the chat header. Per P2 this is where the
 * cryptographic primitives are named — the chrome stays plain-English.
 *
 * Layout (Research v2 Part 8.5):
 * ┌──────────────────────────────────────────┐
 * │ Your conversation with {name}            │
 * │                                          │
 * │ [prose reassurance]                      │
 * │                                          │
 * │ Protocol details:                        │
 * │   Key exchange:    X25519 + ML-KEM-768   │
 * │   Message cipher:  AES-256-GCM           │
 * │   Signing:         Ed25519 + ML-DSA-65   │
 * │                                          │
 * │ Key fingerprint:                         │
 * │   [Safety-number-style 8-group code]     │
 * │                                          │
 * │                            [Close]       │
 * └──────────────────────────────────────────┘
 *
 * The safety number binds BOTH halves of the hybrid exchange: each side
 * serializes its own (X25519 || ML-KEM-768) public-key pair, the two
 * serializations are sorted byte-wise, concatenated, and SHA-256'd —
 * both parties compute the same 32-hex-char code. Binding the PQC half
 * means a substituted ML-KEM public key would flip the number, not just
 * the classical one. Still not a Signal-grade safety-number protocol;
 * enough for a v1 "verify out-of-band" affordance.
 */

import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { Button } from '@stenvault/shared/ui/button';
import { Loader2 } from 'lucide-react';
import { base64ToUint8Array } from '@/lib/platform';

interface EncryptionInfoModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    peerName: string;
    /** Base64-encoded X25519 public key of the current user. */
    myX25519PublicKey: string | null;
    /** Base64-encoded ML-KEM-768 public key of the current user. */
    myMlkem768PublicKey: string | null;
    /** Base64-encoded X25519 public key of the peer. */
    peerX25519PublicKey: string | null;
    /** Base64-encoded ML-KEM-768 public key of the peer. */
    peerMlkem768PublicKey: string | null;
}

function uint8ToHex(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i] ?? 0;
        out += byte.toString(16).padStart(2, '0');
    }
    return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const ai = a[i] ?? 0;
        const bi = b[i] ?? 0;
        if (ai !== bi) return ai - bi;
    }
    return a.length - b.length;
}

function formatSafetyGroups(hex: string, groupSize = 4, groupCount = 8): string {
    const slice = hex.slice(0, groupSize * groupCount).toUpperCase();
    const groups: string[] = [];
    for (let i = 0; i < slice.length; i += groupSize) {
        groups.push(slice.slice(i, i + groupSize));
    }
    return groups.join(' ');
}

// TS 5.7 widened Uint8Array's buffer generic to `ArrayBufferLike`, which
// the crypto.subtle.digest DOM lib types reject. Pin the return to a
// Uint8Array over a concrete ArrayBuffer so callers can hand it straight
// to subtle.digest without a cast.
function concatBytes(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const buffer = new ArrayBuffer(total);
    const out = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

async function deriveSafetyNumber(
    myX25519Key: string,
    myMlkemKey: string,
    peerX25519Key: string,
    peerMlkemKey: string,
): Promise<string> {
    // Each side serializes its own hybrid bundle as (X25519 || ML-KEM-768).
    // The two bundles are then sorted byte-wise before concatenation so
    // Alice and Bob compute the same digest regardless of who initiated.
    const mine = concatBytes([
        base64ToUint8Array(myX25519Key),
        base64ToUint8Array(myMlkemKey),
    ]);
    const peer = concatBytes([
        base64ToUint8Array(peerX25519Key),
        base64ToUint8Array(peerMlkemKey),
    ]);
    const [first, second] = compareBytes(mine, peer) <= 0
        ? [mine, peer]
        : [peer, mine];
    const combined = concatBytes([first, second]);
    const digest = await crypto.subtle.digest('SHA-256', combined);
    return formatSafetyGroups(uint8ToHex(new Uint8Array(digest)));
}

export function EncryptionInfoModal({
    open,
    onOpenChange,
    peerName,
    myX25519PublicKey,
    myMlkem768PublicKey,
    peerX25519PublicKey,
    peerMlkem768PublicKey,
}: EncryptionInfoModalProps) {
    const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
    const [safetyError, setSafetyError] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (
            !myX25519PublicKey ||
            !myMlkem768PublicKey ||
            !peerX25519PublicKey ||
            !peerMlkem768PublicKey
        ) {
            setSafetyNumber(null);
            setSafetyError(false);
            return;
        }
        let cancelled = false;
        setSafetyError(false);
        deriveSafetyNumber(
            myX25519PublicKey,
            myMlkem768PublicKey,
            peerX25519PublicKey,
            peerMlkem768PublicKey,
        )
            .then((code) => {
                if (!cancelled) setSafetyNumber(code);
            })
            .catch(() => {
                if (!cancelled) setSafetyError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, myX25519PublicKey, myMlkem768PublicKey, peerX25519PublicKey, peerMlkem768PublicKey]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-[22px] leading-tight">
                        Your conversation with {peerName}
                    </DialogTitle>
                    <DialogDescription className="pt-1 text-sm">
                        Your messages with {peerName} are end-to-end encrypted. Neither StenVault nor anyone between you can read them.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <section className="space-y-2">
                        <h3 className="text-xs font-medium text-[var(--theme-fg-muted)] uppercase tracking-wide">
                            Protocol details
                        </h3>
                        <dl className="space-y-1.5 font-mono text-[13px]">
                            <div className="flex gap-3">
                                <dt className="w-36 text-[var(--theme-fg-muted)]">Key exchange</dt>
                                <dd className="text-[var(--theme-fg-secondary)]">X25519 + ML-KEM-768</dd>
                            </div>
                            <div className="flex gap-3">
                                <dt className="w-36 text-[var(--theme-fg-muted)]">Message cipher</dt>
                                <dd className="text-[var(--theme-fg-secondary)]">AES-256-GCM</dd>
                            </div>
                            <div className="flex gap-3">
                                <dt className="w-36 text-[var(--theme-fg-muted)]">Signing</dt>
                                <dd className="text-[var(--theme-fg-secondary)]">Ed25519 + ML-DSA-65</dd>
                            </div>
                        </dl>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-xs font-medium text-[var(--theme-fg-muted)] uppercase tracking-wide">
                            Key fingerprint
                        </h3>
                        {safetyError ? (
                            <p className="text-sm text-[var(--theme-warning)]">
                                Could not compute the safety number. Try reopening the modal.
                            </p>
                        ) : safetyNumber ? (
                            <p className="font-mono text-[13px] text-[var(--theme-fg-primary)] break-all leading-6">
                                {safetyNumber}
                            </p>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-[var(--theme-fg-muted)]">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Computing…</span>
                            </div>
                        )}
                        <p className="text-xs text-[var(--theme-fg-muted)]">
                            Read this number together over another channel to confirm no one is impersonating {peerName}.
                        </p>
                    </section>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
