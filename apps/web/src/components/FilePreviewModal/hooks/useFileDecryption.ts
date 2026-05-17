/**
 * Handles file decryption in the preview modal (V4 hybrid PQC) and —
 * when the file is signed — runs signature verification too.
 *
 * State split:
 *  - **External** (`DecryptionState`) — derived purely from inputs (isOpen,
 *    isUnlocked, sigKeyReady, encryptionVersion, skipBlobDecryption, internal).
 *    Cannot get stuck because there is no imperative dispatch path that might
 *    be missed in an early-return branch (the original "vault locked" banner
 *    over playing video bug was caused by exactly that).
 *  - **Internal** (`internalReducer`) — only the sequential async work
 *    (fetch → verify → decrypt → ready/failed). AbortController cancels
 *    in-flight work whenever the relevant inputs change (vault locks,
 *    file changes, modal closes, SW streaming activates mid-decrypt).
 *
 * The hook's public return shape (`state`, `signatureState`, `reset`) is
 * preserved verbatim so `FilePreviewModal/index.tsx` and `SignatureBadge.tsx`
 * don't change.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from '@stenvault/shared/lib/toast';
import { toUserMessage } from '@/lib/errorMessages';
import { uiDescription } from '@stenvault/shared/lib/uiMessage';
import { VaultError } from '@stenvault/shared/errors';
import { trpc } from '@/lib/trpc';
import { debugLog, debugError, debugWarn } from '@/lib/debugLogger';
import { decryptFileHybrid, extractV4FileKey, deriveManifestHmacKey } from '@/lib/hybridFile';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { verifySignedFile } from '@/lib/signedFileCrypto';
import { base64ToArrayBuffer } from '@/lib/platform';
import { useMasterKey } from '@/hooks/useMasterKey';
import { initialInternalState, internalReducer, type PreviewState } from '../state/previewMachine';
import type { DecryptionState, PreviewableFile, SignatureInfo, SignatureVerificationState } from '../types';
import type { HybridSecretKey, HybridSignaturePublicKey } from '@stenvault/shared/platform/crypto';

/** Common extension → MIME type map for when file.mimeType is null or octet-stream */
const EXTENSION_MIME_MAP: Record<string, string> = {
    // Images
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    avif: 'image/avif', tiff: 'image/tiff', tif: 'image/tiff',
    // Video
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg',
    mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    // Audio
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
    oga: 'audio/ogg', m4a: 'audio/mp4', wma: 'audio/x-ms-wma',
    // Documents
    pdf: 'application/pdf', txt: 'text/plain', html: 'text/html',
    css: 'text/css', js: 'text/javascript', json: 'application/json',
    xml: 'application/xml', csv: 'text/csv',
};

/**
 * Get the best available MIME type for a file.
 * Uses file.mimeType if valid, otherwise infers from extension.
 */
export function getEffectiveMimeType(file: PreviewableFile): string {
    if (file.mimeType && file.mimeType !== 'application/octet-stream') {
        return file.mimeType;
    }
    if (file.plaintextExtension) {
        const ext = file.plaintextExtension.toLowerCase().replace('.', '');
        if (EXTENSION_MIME_MAP[ext]) return EXTENSION_MIME_MAP[ext];
    }
    const name = file.decryptedFilename || file.filename;
    if (name) {
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx !== -1) {
            const ext = name.substring(dotIdx + 1).toLowerCase();
            if (EXTENSION_MIME_MAP[ext]) return EXTENSION_MIME_MAP[ext];
        }
    }
    return 'application/octet-stream';
}

/**
 * Verify file signature BEFORE decryption (defense-in-depth).
 * Returns true if decryption should proceed, false to block.
 */
async function verifyBeforeDecrypt(
    encryptedData: ArrayBuffer,
    sigInfo: SignatureInfo,
    pubKeyData: { ed25519PublicKey: string; mldsa65PublicKey: string },
    callbacks: {
        setVerificationResult: (r: {
            valid: boolean;
            classicalValid: boolean;
            postQuantumValid: boolean;
            error?: string;
        } | null) => void;
    },
): Promise<boolean> {
    debugLog('[sig]', 'Verifying signature BEFORE decryption', {
        signerId: sigInfo.signerId,
        signerFingerprint: sigInfo.signerFingerprint,
    });

    try {
        const encryptedBlob = new Blob([encryptedData]);
        const publicKey: HybridSignaturePublicKey = {
            classical: new Uint8Array(base64ToArrayBuffer(pubKeyData.ed25519PublicKey)),
            postQuantum: new Uint8Array(base64ToArrayBuffer(pubKeyData.mldsa65PublicKey)),
        };

        const result = await verifySignedFile(encryptedBlob, { publicKey });

        callbacks.setVerificationResult({
            valid: result.valid,
            classicalValid: result.classicalValid,
            postQuantumValid: result.postQuantumValid,
            error: result.error,
        });

        if (result.valid) {
            toast.success('Signature verified');
            debugLog('[sig]', 'Signature verification passed — proceeding to decrypt');
            return true;
        } else {
            toast.error('Signature verification failed', {
                description: uiDescription('The file signature could not be verified. Decryption blocked for security.'),
            });
            debugWarn('[sig]', 'Signature verification FAILED — blocking decrypt', result);
            return false;
        }
    } catch (verifyError) {
        debugError('[sig]', 'Signature verification infra error', verifyError);
        callbacks.setVerificationResult({
            valid: false,
            classicalValid: false,
            postQuantumValid: false,
            error: verifyError instanceof Error ? verifyError.message : 'Verification failed',
        });
        toast.error('Could not verify signature', {
            description: uiDescription('Decryption blocked — please try again. If the problem persists, contact support.'),
        });
        return false;
    }
}

interface UseFileDecryptionParams {
    file: PreviewableFile | null;
    isOpen: boolean;
    rawUrl: string | undefined;
    encryptionVersion: number;
    signatureInfo?: SignatureInfo | null;
    /** When true, skip blob decryption (SW streaming handles it) */
    skipBlobDecryption?: boolean;
}

interface UseFileDecryptionReturn {
    state: DecryptionState;
    signatureState: SignatureVerificationState;
    reset: () => void;
}

export function useFileDecryption({
    file,
    isOpen,
    rawUrl,
    encryptionVersion,
    signatureInfo,
    skipBlobDecryption,
}: UseFileDecryptionParams): UseFileDecryptionReturn {
    const [internal, internalDispatch] = useReducer(internalReducer, initialInternalState);
    const blobUrlRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const [verificationResult, setVerificationResult] = useState<{
        valid: boolean;
        classicalValid: boolean;
        postQuantumValid: boolean;
        error?: string;
    } | null>(null);
    const [decryptionVerified, setDecryptionVerified] = useState(false);

    // Fetch the signer's public key if the file is signed.
    // Single-user product: signer is always the current user, so we fetch
    // our own active key. Stale cache shared with useSignatureKeys.
    const { data: signerPublicKeyData, error: signerKeyError } = trpc.hybridSignature.getPublicKey.useQuery(
        undefined,
        {
            enabled: !!signatureInfo?.signerId,
            staleTime: 10 * 60 * 1000,
        }
    );

    // Gate: don't auto-decrypt until signer key is resolved (loaded or failed)
    const sigKeyReady = !signatureInfo?.signerId || !!signerPublicKeyData || !!signerKeyError;

    const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();

    // === EXTERNAL STATE DERIVATION ===
    // Pure projection from inputs + internal. Cannot get stuck.

    const externalKind: PreviewState['kind'] = (() => {
        if (!isOpen || !file) return 'idle';
        if (!isUnlocked) return 'awaitingUnlock';
        if (!sigKeyReady) return 'awaitingSignerKey';
        if (encryptionVersion !== 4) return 'failed';
        // SW streaming owns its own decrypt path; this hook has no work to do.
        if (skipBlobDecryption) return 'idle';
        // Tweak 1: if preconditions met but internal hasn't started yet (one
        // render before the side-effect runner fires FETCH_STARTED), surface
        // 'fetchingMetadata' so consumers see continuous progression instead
        // of a one-render 'idle' flash where isDecrypting=false.
        if (internal.kind === 'idle') return 'fetchingMetadata';
        return internal.kind;
    })();

    const externalError: VaultError | null = (() => {
        if (externalKind === 'failed' && encryptionVersion !== 4) {
            return new VaultError('UNSUPPORTED_ENCRYPTION_VERSION', {
                encryptionVersion,
                fileId: file?.id ?? -1,
            });
        }
        if (internal.kind === 'failed' && externalKind === 'failed') return internal.error;
        return null;
    })();

    const state = useMemo<DecryptionState>(() => {
        const isDecrypting =
            externalKind === 'fetchingMetadata' ||
            externalKind === 'verifyingSignature' ||
            externalKind === 'decrypting';
        const progress =
            externalKind === 'decrypting' && internal.kind === 'decrypting'
                ? internal.progress
                : externalKind === 'ready'
                    ? 100
                    : 0;
        const errorDescription = externalError ? toUserMessage(externalError).description : null;
        // Tweak 5: never expose internal's blob when external isn't truly 'ready'.
        const decryptedBlobUrl =
            externalKind === 'ready' && internal.kind === 'ready' ? internal.blobUrl : null;
        return { kind: externalKind, isDecrypting, progress, error: errorDescription, decryptedBlobUrl };
    }, [externalKind, externalError, internal]);

    // Tweak 6: signature state mirrors the internal pipeline directly,
    // not the merged external view (those can diverge — e.g., vault locks
    // while internal is still verifyingSignature; external is awaitingUnlock
    // but the badge should accurately say "verifying paused").
    const signatureState = useMemo<SignatureVerificationState>(() => ({
        hasSignature: !!signatureInfo,
        isVerifying: internal.kind === 'verifyingSignature',
        result: verificationResult,
        signerInfo: signatureInfo ?? null,
        decryptionVerified,
    }), [signatureInfo, internal.kind, verificationResult, decryptionVerified]);

    // === ASYNC HANDLER ===
    // Receives an AbortSignal so it can bail when inputs change mid-flight.

    const handleHybridDecrypt = useCallback(async (signal: AbortSignal) => {
        if (!rawUrl || !file) return;
        if (signal.aborted) return;

        try {
            debugLog('[crypto]', 'Using V4 Personal Hybrid PQC decryption');
            const personalKey = await getUnlockedHybridSecretKey();
            if (signal.aborted) return;
            if (!personalKey) {
                internalDispatch({
                    type: 'FAILED',
                    error: new VaultError('KEY_UNAVAILABLE', { op: 'hybrid_decrypt', fileId: file.id }),
                });
                return;
            }
            const hybridSecretKey: HybridSecretKey = personalKey;

            if (signatureInfo?.signerId && !signerPublicKeyData) {
                internalDispatch({
                    type: 'FAILED',
                    error: new VaultError('SIGNATURE_INVALID', { reason: 'signer_key_unavailable' }),
                });
                toast.error('Signature verification unavailable', {
                    description: uiDescription("Could not fetch the signer's public key. Please try again."),
                });
                return;
            }

            const isSigned = !!signatureInfo && !!signerPublicKeyData;

            if (isSigned) {
                internalDispatch({ type: 'VERIFY_STARTED' });

                const response = await fetch(rawUrl, { signal });
                if (signal.aborted) return;
                if (!response.ok) {
                    throw new VaultError('INFRA_NETWORK', { op: 'fetch_signed_file', status: response.status });
                }
                const encryptedData = await response.arrayBuffer();
                if (signal.aborted) return;

                const allowed = await verifyBeforeDecrypt(encryptedData, signatureInfo, signerPublicKeyData, {
                    setVerificationResult,
                });
                if (signal.aborted) return;
                if (!allowed) {
                    internalDispatch({
                        type: 'FAILED',
                        error: new VaultError('SIGNATURE_INVALID', { reason: 'signature_rejected' }),
                    });
                    return;
                }

                internalDispatch({ type: 'SIGNATURE_VERIFIED' });

                const signerPubKey: HybridSignaturePublicKey = {
                    classical: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData!.ed25519PublicKey)),
                    postQuantum: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData!.mldsa65PublicKey)),
                };
                const decryptedData = await decryptFileHybrid(encryptedData, {
                    secretKey: hybridSecretKey,
                    signerPublicKey: signerPubKey,
                    onProgress: (p) => {
                        if (!signal.aborted) {
                            internalDispatch({ type: 'DECRYPT_PROGRESS', progress: p.percentage });
                        }
                    },
                });
                if (signal.aborted) return;
                const decryptedBlob = new Blob([decryptedData], { type: getEffectiveMimeType(file) });
                const blobUrl = URL.createObjectURL(decryptedBlob);
                internalDispatch({ type: 'DECRYPT_SUCCESS', blobUrl });
                setDecryptionVerified(true);
            } else {
                const { fileKeyBytes, zeroBytes } = await extractV4FileKey(rawUrl, hybridSecretKey);
                if (signal.aborted) {
                    zeroBytes();
                    return;
                }
                try {
                    const hmacKey = await deriveManifestHmacKey(fileKeyBytes);
                    const fileKey = await crypto.subtle.importKey(
                        'raw',
                        fileKeyBytes.buffer.slice(
                            fileKeyBytes.byteOffset,
                            fileKeyBytes.byteOffset + fileKeyBytes.byteLength,
                        ) as ArrayBuffer,
                        { name: 'AES-GCM', length: 256 },
                        false,
                        ['decrypt'],
                    );
                    if (signal.aborted) return;

                    const response = await fetch(rawUrl, { signal });
                    if (signal.aborted) return;
                    if (!response.ok || !response.body) {
                        throw new VaultError('INFRA_NETWORK', {
                            op: 'fetch_encrypted_file',
                            status: response.status,
                        });
                    }

                    internalDispatch({ type: 'URL_RESOLVED' });

                    const plaintextStream = decryptV4ChunkedToStream(response.body, {
                        fileKey,
                        hmacKey,
                        onProgress: (p) => {
                            if (!signal.aborted) {
                                internalDispatch({
                                    type: 'DECRYPT_PROGRESS',
                                    progress: Math.round((p.chunkIndex / Math.max(p.chunkCount, 1)) * 100),
                                });
                            }
                        },
                    });

                    const rawBlob = await new Response(plaintextStream).blob();
                    if (signal.aborted) return;
                    const decryptedBlob = new Blob([rawBlob], { type: getEffectiveMimeType(file) });
                    const blobUrl = URL.createObjectURL(decryptedBlob);
                    internalDispatch({ type: 'DECRYPT_SUCCESS', blobUrl });
                    setDecryptionVerified(true);
                } finally {
                    zeroBytes();
                }
            }

            if (!signal.aborted) toast.success('File decrypted with Hybrid PQC');
        } catch (err) {
            if (signal.aborted) return;
            // AbortError from upstream fetch is expected when we cancel — drop it.
            if (err instanceof DOMException && err.name === 'AbortError') return;
            debugError('[crypto]', 'Hybrid decryption failed', err);
            const vaultErr = VaultError.isVaultError(err) ? err : VaultError.wrap(err, 'UNKNOWN');
            internalDispatch({ type: 'FAILED', error: vaultErr });
        }
    }, [rawUrl, file, getUnlockedHybridSecretKey, signatureInfo, signerPublicKeyData]);

    // Stable ref so the side-effect runner doesn't depend on the handler identity.
    const handlerRef = useRef(handleHybridDecrypt);
    handlerRef.current = handleHybridDecrypt;

    // === SIDE-EFFECT RUNNER ===
    // Single source of truth for "should we be running async work right now".
    // - On precondition change: cleanup aborts the previous in-flight request.
    // - When preconditions are met: dispatch FETCH_STARTED + invoke handler.
    // - When preconditions become false: cleanup runs, internal is reset by
    //   the lock/close effects below or by the next file change.
    //
    // Using `file?.id` (not `file`) avoids re-running when an unrelated field
    // on the same file changes.
    useEffect(() => {
        const shouldRun =
            isOpen &&
            !!file &&
            isUnlocked &&
            sigKeyReady &&
            encryptionVersion === 4 &&
            !!rawUrl &&
            !skipBlobDecryption;

        if (!shouldRun) return;

        const ac = new AbortController();
        abortRef.current = ac;
        // Reset stale results before starting a fresh request.
        setVerificationResult(null);
        setDecryptionVerified(false);
        internalDispatch({ type: 'RESET' });
        internalDispatch({ type: 'FETCH_STARTED' });
        handlerRef.current(ac.signal);

        return () => {
            ac.abort();
        };
    }, [isOpen, file?.id, isUnlocked, sigKeyReady, encryptionVersion, rawUrl, skipBlobDecryption]);

    // When preconditions become false (vault locks, modal closes, file
    // cleared, version unsupported, SW streaming activates), reset the
    // internal pipeline so a subsequent re-entry can fire FETCH_STARTED again.
    // The side-effect runner above only handles the start-side; this handles
    // the stop-side without coupling them in one effect.
    useEffect(() => {
        const shouldRun =
            isOpen &&
            !!file &&
            isUnlocked &&
            sigKeyReady &&
            encryptionVersion === 4 &&
            !!rawUrl &&
            !skipBlobDecryption;
        if (!shouldRun && internal.kind !== 'idle') {
            internalDispatch({ type: 'RESET' });
        }
    }, [isOpen, file?.id, isUnlocked, sigKeyReady, encryptionVersion, rawUrl, skipBlobDecryption, internal.kind]);

    // Tweak 4: blob URL revocation keyed on `internal`, not the derived
    // external view. Vault locking flips external to 'awaitingUnlock' but
    // internal stays 'ready' — revoking on external transitions would 404
    // the blob URL the moment the user re-unlocks.
    useEffect(() => {
        if (internal.kind === 'ready') {
            blobUrlRef.current = internal.blobUrl;
        }
        return () => {
            if (internal.kind === 'ready' && blobUrlRef.current) {
                const url = blobUrlRef.current;
                blobUrlRef.current = null;
                setTimeout(() => URL.revokeObjectURL(url), 300);
            }
        };
    }, [internal]);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        internalDispatch({ type: 'RESET' });
        setVerificationResult(null);
        setDecryptionVerified(false);
    }, []);

    return { state, signatureState, reset };
}
