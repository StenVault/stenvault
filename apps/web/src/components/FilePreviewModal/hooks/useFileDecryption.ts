/**
 * Handles file decryption in the preview modal (V4 hybrid PQC) and —
 * when the file is signed — runs signature verification too.
 *
 * Internally driven by `previewReducer` (state machine). The hook's
 * public return shape (`state`, `signatureState`, `reset`) is preserved
 * verbatim so `FilePreviewModal/index.tsx` and `SignatureBadge.tsx`
 * don't change.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from '@stenvault/shared/lib/toast';
import { toUserMessage } from '@/lib/errorMessages';
import { uiDescription } from '@stenvault/shared/lib/uiMessage';
import { VaultError } from '@stenvault/shared/errors';
import { trpc } from '@/lib/trpc';
import { debugLog, debugError, debugWarn, devWarn } from '@/lib/debugLogger';
import { decryptFileHybrid, extractV4FileKey, deriveManifestHmacKey } from '@/lib/hybridFile';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { verifySignedFile } from '@/lib/signedFileCrypto';
import { base64ToArrayBuffer } from '@/lib/platform';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useOrgMasterKey } from '@/hooks/useOrgMasterKey';
import { unwrapOrgHybridSecretKey } from '@/lib/orgHybridCrypto';
import { initialPreviewState, previewReducer } from '../state/previewMachine';
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
    // 1. Use stored mimeType if it's a real type (not null/octet-stream)
    if (file.mimeType && file.mimeType !== 'application/octet-stream') {
        return file.mimeType;
    }
    // 2. Try to infer from plaintextExtension (stored separately for zero-knowledge)
    if (file.plaintextExtension) {
        const ext = file.plaintextExtension.toLowerCase().replace('.', '');
        if (EXTENSION_MIME_MAP[ext]) return EXTENSION_MIME_MAP[ext];
    }
    // 3. Try to infer from decryptedFilename or filename
    const name = file.decryptedFilename || file.filename;
    if (name) {
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx !== -1) {
            const ext = name.substring(dotIdx + 1).toLowerCase();
            if (EXTENSION_MIME_MAP[ext]) return EXTENSION_MIME_MAP[ext];
        }
    }
    // 4. Last resort
    return 'application/octet-stream';
}

/**
 * Verify file signature BEFORE decryption (defense-in-depth).
 * Returns true if decryption should proceed, false to block.
 * The reducer owns `isVerifying` (derived from state.kind) and the
 * `error` field, so those callbacks are no-ops in the hook's flow —
 * they are kept in the signature only because legacy verifyBeforeDecrypt
 * callers still rely on them.
 */
async function verifyBeforeDecrypt(
    encryptedData: ArrayBuffer,
    sigInfo: SignatureInfo,
    pubKeyData: { ed25519PublicKey: string; mldsa65PublicKey: string },
    callbacks: {
        setIsVerifying: (v: boolean) => void;
        setVerificationResult: (r: {
            valid: boolean;
            classicalValid: boolean;
            postQuantumValid: boolean;
            error?: string;
        } | null) => void;
        setError: (e: string) => void;
    },
): Promise<boolean> {
    callbacks.setIsVerifying(true);
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
        callbacks.setIsVerifying(false);

        if (result.valid) {
            toast.success('Signature verified');
            debugLog('[sig]', 'Signature verification passed — proceeding to decrypt');
            return true;
        } else {
            const msg = result.error || 'File signature is invalid — decryption blocked';
            callbacks.setError(msg);
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
        callbacks.setIsVerifying(false);
        const msg = 'Signature verification encountered an infrastructure error. Decryption blocked for security.';
        callbacks.setError(msg);
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
    const [machineState, dispatch] = useReducer(previewReducer, initialPreviewState);
    const blobUrlRef = useRef<string | null>(null);

    const [verificationResult, setVerificationResult] = useState<{
        valid: boolean;
        classicalValid: boolean;
        postQuantumValid: boolean;
        error?: string;
    } | null>(null);
    const [decryptionVerified, setDecryptionVerified] = useState(false);

    // Fetch signer's public key if signature info is present
    const { data: signerPublicKeyData, error: signerKeyError } = trpc.hybridSignature.getPublicKeyByUserId.useQuery(
        { userId: signatureInfo?.signerId ?? 0 },
        {
            enabled: !!signatureInfo?.signerId,
            staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        }
    );

    // Gate: don't auto-decrypt until signer key is resolved (loaded or failed)
    // If no signature, or key loaded, or query errored → ready to proceed
    const sigKeyReady = !signatureInfo?.signerId || !!signerPublicKeyData || !!signerKeyError;

    const signatureState = useMemo((): SignatureVerificationState => ({
        hasSignature: !!signatureInfo,
        isVerifying: machineState.kind === 'verifyingSignature',
        result: verificationResult,
        signerInfo: signatureInfo ?? null,
        decryptionVerified,
    }), [signatureInfo, machineState.kind, verificationResult, decryptionVerified]);

    const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
    const { unlockOrgVault } = useOrgMasterKey();
    const trpcUtils = trpc.useUtils();

    // Hybrid decryption handler for v4 files.
    // Unsigned V4: pure streaming (~128KB peak). Signed V4: full load for SHA-256 verify.
    // Dispatches reducer actions as it progresses; never calls setState directly for
    // anything covered by the machine.
    const handleHybridDecrypt = useCallback(async () => {
        if (!rawUrl || !file) {
            debugWarn('[crypto]', 'handleHybridDecrypt called with missing params', {
                rawUrl: !!rawUrl, file: !!file,
            });
            return;
        }

        try {
            const isOrgFile = !!file.organizationId;

            let hybridSecretKey: HybridSecretKey;
            if (isOrgFile) {
                debugLog('[crypto]', `Using V4 Org Hybrid PQC decryption (org=${file.organizationId})`);
                const omk = await unlockOrgVault(file.organizationId!);
                const orgSecretData = await trpcUtils.orgKeys.getOrgHybridSecretKey.fetch({
                    organizationId: file.organizationId!,
                    ...(file.orgKeyVersion ? { keyVersion: file.orgKeyVersion } : {}),
                });
                hybridSecretKey = await unwrapOrgHybridSecretKey(omk, orgSecretData);
            } else {
                debugLog('[crypto]', 'Using V4 Personal Hybrid PQC decryption');
                const personalKey = await getUnlockedHybridSecretKey();
                if (!personalKey) {
                    dispatch({
                        type: 'FAILED',
                        error: new VaultError('KEY_UNAVAILABLE', { op: 'hybrid_decrypt', fileId: file.id }),
                    });
                    return;
                }
                hybridSecretKey = personalKey;
            }

            if (signatureInfo?.signerId && !signerPublicKeyData) {
                dispatch({
                    type: 'FAILED',
                    error: new VaultError('SIGNATURE_INVALID', { reason: 'signer_key_unavailable' }),
                });
                toast.error('Signature verification unavailable', {
                    description: uiDescription('Could not fetch the signer\'s public key. Please try again.'),
                });
                return;
            }

            const isSigned = !!signatureInfo && !!signerPublicKeyData;

            if (isSigned) {
                dispatch({ type: 'VERIFY_STARTED' });

                const response = await fetch(rawUrl);
                if (!response.ok) {
                    throw new VaultError('INFRA_NETWORK', { op: 'fetch_signed_file', status: response.status });
                }
                const encryptedData = await response.arrayBuffer();

                const allowed = await verifyBeforeDecrypt(encryptedData, signatureInfo, signerPublicKeyData, {
                    setIsVerifying: () => { /* derived from state.kind */ },
                    setVerificationResult,
                    setError: () => { /* reducer FAILED handles this below */ },
                });
                if (!allowed) {
                    dispatch({
                        type: 'FAILED',
                        error: new VaultError('SIGNATURE_INVALID', { reason: 'signature_rejected' }),
                    });
                    return;
                }

                dispatch({ type: 'SIGNATURE_VERIFIED' });

                const signerPubKey: HybridSignaturePublicKey = {
                    classical: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData!.ed25519PublicKey)),
                    postQuantum: new Uint8Array(base64ToArrayBuffer(signerPublicKeyData!.mldsa65PublicKey)),
                };
                const decryptedData = await decryptFileHybrid(encryptedData, {
                    secretKey: hybridSecretKey,
                    signerPublicKey: signerPubKey,
                    onProgress: (p) => dispatch({ type: 'DECRYPT_PROGRESS', progress: p.percentage }),
                });
                const decryptedBlob = new Blob([decryptedData], { type: getEffectiveMimeType(file) });
                const blobUrl = URL.createObjectURL(decryptedBlob);
                dispatch({ type: 'DECRYPT_SUCCESS', blobUrl });
                setDecryptionVerified(true);
            } else {
                const { fileKeyBytes, zeroBytes } = await extractV4FileKey(rawUrl, hybridSecretKey);
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

                    const response = await fetch(rawUrl);
                    if (!response.ok || !response.body) {
                        throw new VaultError('INFRA_NETWORK', {
                            op: 'fetch_encrypted_file',
                            status: response.status,
                        });
                    }

                    dispatch({ type: 'URL_RESOLVED' });

                    const plaintextStream = decryptV4ChunkedToStream(response.body, {
                        fileKey,
                        hmacKey,
                        onProgress: (p) => dispatch({
                            type: 'DECRYPT_PROGRESS',
                            progress: Math.round((p.chunkIndex / Math.max(p.chunkCount, 1)) * 100),
                        }),
                    });

                    const rawBlob = await new Response(plaintextStream).blob();
                    const decryptedBlob = new Blob([rawBlob], { type: getEffectiveMimeType(file) });
                    const blobUrl = URL.createObjectURL(decryptedBlob);
                    dispatch({ type: 'DECRYPT_SUCCESS', blobUrl });
                    setDecryptionVerified(true);
                } finally {
                    zeroBytes();
                }
            }

            toast.success(isOrgFile ? 'File decrypted with Organization Hybrid PQC' : 'File decrypted with Hybrid PQC');
        } catch (err) {
            debugError('[crypto]', 'Hybrid decryption failed', err);
            const vaultErr = VaultError.isVaultError(err) ? err : VaultError.wrap(err, 'UNKNOWN');
            dispatch({ type: 'FAILED', error: vaultErr });
        }
    }, [rawUrl, file, getUnlockedHybridSecretKey, unlockOrgVault, trpcUtils, signatureInfo, signerPublicKeyData]);

    // Stable ref for the handler — its identity changes every render
    // (trpcUtils / getUnlockedHybridSecretKey are fresh refs each time),
    // but the side-effect runner below reads through the ref so the
    // effect itself only depends on machineState, not the handler id.
    const handleHybridDecryptRef = useRef(handleHybridDecrypt);
    handleHybridDecryptRef.current = handleHybridDecrypt;

    // File change → reset everything.
    useEffect(() => {
        dispatch({ type: 'FILE_CHANGED' });
        setVerificationResult(null);
        setDecryptionVerified(false);
    }, [file?.id]);

    // Orchestration: translate props into reducer actions. Each action the
    // reducer receives is a no-op unless the current state permits it, so
    // re-runs on unrelated prop changes can't duplicate work.
    useEffect(() => {
        if (!isOpen || !file) {
            dispatch({ type: 'MODAL_CLOSED' });
            return;
        }
        if (!isUnlocked) {
            dispatch({ type: 'VAULT_LOCKED' });
            return;
        }
        if (!sigKeyReady) {
            dispatch({ type: 'SIGNER_KEY_WAITING' });
            return;
        }
        if (encryptionVersion !== 4) {
            dispatch({
                type: 'FAILED',
                error: new VaultError('UNSUPPORTED_ENCRYPTION_VERSION', {
                    encryptionVersion,
                    fileId: file.id,
                }),
            });
            return;
        }
        if (!rawUrl || skipBlobDecryption) return;
        devWarn('[Decrypt] Auto-decrypt preconditions met — dispatching fetch', { fileId: file.id });
        // One of these three transitions to `fetchingMetadata` depending on
        // whether we were idle, awaitingUnlock, or awaitingSignerKey.
        // The reducer's guards make the other two no-ops, so firing them
        // in sequence is safe and keeps each action's semantics precise.
        dispatch({ type: 'VAULT_UNLOCKED' });
        dispatch({ type: 'SIGNER_KEY_READY' });
        dispatch({ type: 'MODAL_OPENED' });
    }, [isOpen, file, isUnlocked, sigKeyReady, encryptionVersion, rawUrl, skipBlobDecryption]);

    // Side-effect runner + blob-URL cleanup. When the machine enters
    // `fetchingMetadata`, invoke the handler through the ref (so the
    // handler's captured deps don't force this effect to re-run). When
    // it leaves `ready`, revoke the blob URL after the close animation.
    useEffect(() => {
        if (machineState.kind === 'fetchingMetadata') {
            handleHybridDecryptRef.current();
        }
        if (machineState.kind === 'ready') {
            blobUrlRef.current = machineState.blobUrl;
        }
        return () => {
            if (machineState.kind === 'ready' && blobUrlRef.current) {
                const url = blobUrlRef.current;
                blobUrlRef.current = null;
                setTimeout(() => URL.revokeObjectURL(url), 300);
            }
        };
    }, [machineState]);

    // Derive the external public shape from the reducer state, preserving
    // the exact DecryptionState contract that FilePreviewModal consumes.
    // `kind` is exposed so render paths can distinguish expected waits
    // (awaitingUnlock, awaitingSignerKey) from real failures, instead of
    // conflating them through the `error` field.
    const state = useMemo<DecryptionState>(() => {
        const isDecrypting =
            machineState.kind === 'fetchingMetadata'
            || machineState.kind === 'verifyingSignature'
            || machineState.kind === 'decrypting';
        const progress =
            machineState.kind === 'decrypting' ? machineState.progress :
            machineState.kind === 'ready' ? 100 : 0;
        const error =
            machineState.kind === 'failed' ? toUserMessage(machineState.error).description : null;
        const decryptedBlobUrl =
            machineState.kind === 'ready' ? machineState.blobUrl : null;
        return { kind: machineState.kind, isDecrypting, progress, error, decryptedBlobUrl };
    }, [machineState]);

    const reset = useCallback(() => {
        dispatch({ type: 'FILE_CHANGED' });
        setVerificationResult(null);
        setDecryptionVerified(false);
    }, []);

    return {
        state,
        signatureState,
        reset,
    };
}
