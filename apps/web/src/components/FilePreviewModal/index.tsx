/**
 * FilePreviewModal Component
 *
 * Main orchestrator component for file previews.
 * Supports video, audio, image, and document files with encryption handling.
 * V4 (Hybrid PQC) files auto-decrypt when vault is unlocked.
 *
 * Architecture: outer shell handles the large-file warning + Dialog wrapper;
 * `<UnlockBoundary>` gates the heavy decrypt subtree so its hooks (and the
 * `useFileDecryption` state machine) only run when the vault is unlocked.
 * Defense-in-depth on top of the per-hook abort/derived-state fixes.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useOperationStore } from '@/stores/operationStore';
import { toast } from '@stenvault/shared/lib/toast';
import { uiDescription } from '@stenvault/shared/lib/uiMessage';
import { Loader2, AlertTriangle, Download, Lock, Unlock, X } from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@stenvault/shared/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@stenvault/shared/ui/alert-dialog';
import { formatBytes } from '@stenvault/shared';
import { debugWarn, devWarn } from '@/lib/debugLogger';
import { useMasterKey } from '@/hooks/useMasterKey';
import { extractV4FileKey } from '@/lib/hybridFile';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';
import { useBatchTimestampStatus } from '@/hooks/useTimestamp';
import { UnlockBoundary } from '@/components/UnlockBoundary';

// Hooks
import { useMediaControls } from './hooks/useMediaControls';
import { useFileDecryption, getEffectiveMimeType } from './hooks/useFileDecryption';
import { useImageControls } from './hooks/useImageControls';
import { useVideoStream } from './hooks/useVideoStream';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';

// Components
import { PreviewHeader } from './components/PreviewHeader';
import { VideoPlayer } from './components/VideoPlayer';
import { AudioPlayer } from './components/AudioPlayer';
import { ImageViewer } from './components/ImageViewer';
import { DocumentViewer, UnsupportedFile } from './components/DocumentViewer';
import { MediaControls } from './components/MediaControls';
import { ImageControls } from './components/ImageControls';
import { InlineUnlockPrompt } from './components/InlineUnlockPrompt';
import { TimestampProofModal } from '@/components/files/components/TimestampProofModal';

// Types
import type { FilePreviewModalProps } from './types';
import type { FileItem, PreviewableFile } from '@/components/files/types';

/** Try to infer file type from extension when mimeType is null/octet-stream */
const EXTENSION_TYPE_MAP: Record<string, string> = {
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
    svg: 'image', bmp: 'image', avif: 'image', tiff: 'image', tif: 'image', ico: 'image',
    mp4: 'video', webm: 'video', ogg: 'video', ogv: 'video', mov: 'video',
    avi: 'video', mkv: 'video',
    mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', oga: 'audio',
    m4a: 'audio', wma: 'audio',
    pdf: 'document', txt: 'document', html: 'document', csv: 'document',
    doc: 'document', docx: 'document', xls: 'document', xlsx: 'document',
};

function inferTypeFromExtension(file: { plaintextExtension?: string | null; decryptedFilename?: string; filename?: string }): string | null {
    if (file.plaintextExtension) {
        const ext = file.plaintextExtension.toLowerCase().replace('.', '');
        if (EXTENSION_TYPE_MAP[ext]) return EXTENSION_TYPE_MAP[ext];
    }
    const name = file.decryptedFilename || file.filename;
    if (name) {
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx !== -1) {
            const ext = name.substring(dotIdx + 1).toLowerCase();
            if (EXTENSION_TYPE_MAP[ext]) return EXTENSION_TYPE_MAP[ext];
        }
    }
    return null;
}

const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024; // 200 MB

export function FilePreviewModal({ file, open, onClose, mode = 'preview' }: FilePreviewModalProps) {
    // ===== LARGE FILE WARNING (lives outside UnlockBoundary so it works on
    // either side of the unlock state) =====
    const isLargeFile = !!file && file.size > LARGE_FILE_THRESHOLD;
    const [largeFileConfirmed, setLargeFileConfirmed] = useState(false);
    const [showLargeFileWarning, setShowLargeFileWarning] = useState(false);

    useEffect(() => {
        setLargeFileConfirmed(false);
        setShowLargeFileWarning(false);
    }, [file?.id]);

    useEffect(() => {
        if (open && isLargeFile && !largeFileConfirmed) {
            setShowLargeFileWarning(true);
        }
        // largeFileConfirmed deliberately omitted to avoid re-firing the
        // warning after the user dismisses it for the same file.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, file?.id]);

    const canFetchUrl = !isLargeFile || largeFileConfirmed;
    const fileForCopy = file;

    if (!file) return null;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                className="max-w-5xl w-full h-[100dvh] md:h-[90vh] p-0 overflow-hidden rounded-none md:rounded-xl"
                showCloseButton={false}
                aria-describedby={undefined}
            >
                <UnlockBoundary fallback={<LockedPreview onClose={onClose} />}>
                    <FilePreviewModalContent
                        file={file}
                        open={open}
                        onClose={onClose}
                        mode={mode}
                        canFetchUrl={canFetchUrl}
                    />
                </UnlockBoundary>
            </DialogContent>

            {/* Large file warning — lives at outer layer because the user must
                see it whether or not the vault is unlocked. */}
            <AlertDialog open={showLargeFileWarning} onOpenChange={setShowLargeFileWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Large file</AlertDialogTitle>
                        <AlertDialogDescription>
                            {fileForCopy && (fileForCopy.fileType === 'video' || fileForCopy.fileType === 'audio')
                                ? `This file is ${formatBytes(fileForCopy.size)}. It will be streamed progressively — no large memory usage.`
                                : `This file is ${formatBytes(fileForCopy?.size ?? 0)}. Preview may use significant memory and take a while to decrypt.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setShowLargeFileWarning(false); onClose(); }}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setLargeFileConfirmed(true); setShowLargeFileWarning(false); }}>
                            Preview Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}

/**
 * Locked-state fallback rendered by `<UnlockBoundary>` when vault is locked
 * or not configured. The decrypt subtree (queries, useFileDecryption,
 * useVideoStream) is unmounted while this is shown — no hooks fire,
 * no state can drift.
 */
function LockedPreview({ onClose }: { onClose: () => void }) {
    return (
        <div className="flex flex-col h-full bg-background safe-top safe-bottom">
            <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
                <div className="flex items-center justify-between">
                    <DialogTitle className="truncate">Preview</DialogTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </DialogHeader>
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-black/90 relative">
                <InlineUnlockPrompt />
            </div>
        </div>
    );
}

interface FilePreviewModalContentProps {
    file: PreviewableFile;
    open: boolean;
    onClose: () => void;
    mode: 'preview' | 'download';
    canFetchUrl: boolean;
}

function FilePreviewModalContent({ file, open, onClose, mode, canFetchUrl }: FilePreviewModalContentProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // ===== TRPC QUERIES =====
    // Stream URL for video/audio files
    const { data: streamData, isLoading: streamLoading } = trpc.files.getStreamUrl.useQuery(
        { fileId: file.id },
        { enabled: canFetchUrl && (file.fileType === 'video' || file.fileType === 'audio') }
    );

    // Download URL for everything else
    const { data: downloadData, isLoading: downloadLoading } = trpc.files.getDownloadUrl.useQuery(
        { fileId: file.id },
        { enabled: canFetchUrl && file.fileType !== 'video' && file.fileType !== 'audio' }
    );

    // ===== ENCRYPTION METADATA =====
    const encryptionIv = streamData?.encryptionIv || downloadData?.encryptionIv;
    const apiVersion = streamData?.encryptionVersion ?? downloadData?.encryptionVersion;
    const encryptionVersion = apiVersion ?? 4;
    const isUnsupportedVersion = encryptionVersion !== 4;
    const rawUrl = streamData?.url || downloadData?.url;

    // Log encryption metadata once when available (not on every re-render)
    const loggedFileIdRef = useRef<number | null>(null);
    useEffect(() => {
        if (rawUrl && !streamLoading && !downloadLoading && loggedFileIdRef.current !== file.id) {
            loggedFileIdRef.current = file.id;
            devWarn('[Preview] Encryption metadata:', {
                fileId: file.id,
                apiVersion,
                encryptionVersion,
                hasIv: !!encryptionIv,
                fileType: file.fileType,
                source: streamData ? 'stream' : downloadData ? 'download' : 'none',
            });
        }
    }, [rawUrl, file.id, streamLoading, downloadLoading, apiVersion, encryptionVersion, encryptionIv, streamData, downloadData, file.fileType]);

    // ===== SIGNATURE INFO =====
    const signatureInfo = downloadData?.signatureInfo ?? null;

    // ===== FILENAME DECRYPTION (Zero-Knowledge) =====
    const { getDisplayName } = useFilenameDecryption();
    const displayFilename = getDisplayName(file as FileItem);

    // ===== TIMESTAMP STATUS =====
    const fileIdArray = useMemo(() => [file.id], [file.id]);
    const { getStatus: getTimestampStatus } = useBatchTimestampStatus(fileIdArray);
    const timestampStatus = getTimestampStatus(file.id);
    const [showTimestampModal, setShowTimestampModal] = useState(false);

    // ===== MASTER KEY (for streaming download) =====
    const { getUnlockedHybridSecretKey } = useMasterKey();
    const [isStreamingDownload, setIsStreamingDownload] = useState(false);

    // ===== EFFECTIVE FILE TYPE =====
    const effectiveFileType = (() => {
        if (file.fileType !== 'other') return file.fileType;
        const mime = file.mimeType;
        if (mime && mime !== 'application/octet-stream') {
            if (mime.startsWith('image/')) return 'image';
            if (mime.startsWith('video/')) return 'video';
            if (mime.startsWith('audio/')) return 'audio';
            if (
                mime.startsWith('application/pdf') ||
                mime.startsWith('application/msword') ||
                mime.startsWith('application/vnd.openxmlformats') ||
                mime.startsWith('application/vnd.ms-') ||
                mime.startsWith('text/')
            ) return 'document';
        }
        const inferred = inferTypeFromExtension(file);
        if (inferred) return inferred;
        return 'other';
    })();

    // ===== EFFECTIVE MIME TYPE =====
    const effectiveMimeType = getEffectiveMimeType(file);

    // ===== SIGNER PUBLIC KEY (for video stream signature verification) =====
    const { data: signerPublicKeyData } = trpc.hybridSignature.getPublicKey.useQuery(
        undefined,
        { enabled: !!signatureInfo?.signerId },
    );

    // ===== VIDEO STREAMING (Service Worker) =====
    const videoStream = useVideoStream({
        file,
        isOpen: open,
        rawUrl,
        encryptionVersion,
        signatureInfo,
        signerPublicKeyData: signerPublicKeyData ?? null,
        effectiveFileType,
    });

    // ===== HOOKS =====
    const mediaControls = useMediaControls();
    const imageControls = useImageControls();
    const decryption = useFileDecryption({
        file,
        isOpen: open,
        rawUrl,
        encryptionVersion,
        signatureInfo,
        skipBlobDecryption: (videoStream.shouldStream && !videoStream.error) || videoStream.isStreamActive || videoStream.isRegistering,
    });

    // ===== ACTIVE PREVIEW OPERATION =====
    const opStore = useOperationStore();
    const previewOpIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (open && (decryption.state.decryptedBlobUrl || videoStream.streamUrl) && !previewOpIdRef.current) {
            previewOpIdRef.current = opStore.addOperation({
                type: 'preview',
                filename: displayFilename || 'preview',
                status: 'downloading',
            });
        }
        if (!open && previewOpIdRef.current) {
            opStore.removeOperation(previewOpIdRef.current);
            previewOpIdRef.current = null;
        }
        return () => {
            if (previewOpIdRef.current) {
                opStore.removeOperation(previewOpIdRef.current);
                previewOpIdRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, !!decryption.state.decryptedBlobUrl, !!videoStream.streamUrl]);

    // If video errors while SW streaming, fall back to blob decryption
    useEffect(() => {
        if (videoStream.isStreamActive && mediaControls.state.error) {
            videoStream.resetOnError();
            mediaControls.reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoStream.isStreamActive, mediaControls.state.error]);

    const mediaUrl = videoStream.streamUrl || decryption.state.decryptedBlobUrl || null;

    // ===== RESET ON FILE CHANGE =====
    useEffect(() => {
        mediaControls.reset();
        imageControls.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file.id]);

    // ===== IMAGE ERROR HANDLER =====
    const { setError: setImageError } = imageControls;
    const { setLoading: setMediaLoading } = mediaControls;
    const handleImageError = useCallback((message: string) => {
        setImageError(message);
        setMediaLoading(false);
    }, [setImageError, setMediaLoading]);

    // ===== DOWNLOAD HANDLER =====
    const handleDownload = useCallback(async () => {
        try {
            if (decryption.state.decryptedBlobUrl) {
                const link = document.createElement('a');
                link.href = decryption.state.decryptedBlobUrl;
                link.download = displayFilename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('File downloaded successfully');
                return;
            }

            if (encryptionVersion === 4 && rawUrl) {
                setIsStreamingDownload(true);
                try {
                    const secretKey = await getUnlockedHybridSecretKey();
                    if (!secretKey) {
                        toast.error('Please unlock your vault first');
                        return;
                    }

                    const { fileKeyBytes, zeroBytes } = await extractV4FileKey(rawUrl, secretKey);
                    const fileKey = await crypto.subtle.importKey(
                        'raw',
                        fileKeyBytes.buffer.slice(fileKeyBytes.byteOffset, fileKeyBytes.byteOffset + fileKeyBytes.byteLength) as ArrayBuffer,
                        { name: 'AES-GCM', length: 256 },
                        false,
                        ['decrypt'],
                    );
                    zeroBytes();

                    const response = await fetch(rawUrl);
                    if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);

                    const plaintextStream = decryptV4ChunkedToStream(response.body, { fileKey });

                    const result = await streamDownloadToDisk(plaintextStream, {
                        filename: displayFilename,
                        totalSize: file.size,
                        mimeType: effectiveMimeType || 'application/octet-stream',
                    });

                    toast.success(`File downloaded (${result.tier})`);
                    return;
                } catch (err) {
                    if (err instanceof DOMException && err.name === 'AbortError') return;
                    throw err;
                } finally {
                    setIsStreamingDownload(false);
                }
            }

            toast.info('Waiting for decryption to complete...');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            debugWarn('[Preview]', 'Download failed', err);
            toast.error('Failed to download file', {
                description: uiDescription(
                    message.includes('expired')
                        ? 'The download link may have expired. Please close and reopen the preview.'
                        : 'Please check your connection and try again.',
                ),
            });
        }
    }, [decryption, displayFilename, encryptionVersion, rawUrl, getUnlockedHybridSecretKey, effectiveMimeType, file.size]);

    // ===== AUTO-DOWNLOAD MODE =====
    const autoDownloadTriggeredRef = useRef(false);
    useEffect(() => {
        autoDownloadTriggeredRef.current = false;
    }, [file.id]);

    useEffect(() => {
        if (mode !== 'download' || !open || autoDownloadTriggeredRef.current) return;

        if (decryption.state.decryptedBlobUrl) {
            autoDownloadTriggeredRef.current = true;
            handleDownload().then(() => onClose());
            return;
        }

        if (encryptionVersion === 4 && rawUrl && !decryption.state.isDecrypting) {
            autoDownloadTriggeredRef.current = true;
            handleDownload().then(() => onClose());
        }
    }, [mode, open, decryption.state.decryptedBlobUrl, decryption.state.isDecrypting, encryptionVersion, rawUrl, handleDownload, onClose]);

    // ===== RENDER GATES =====
    const isQueryLoading = streamLoading || downloadLoading;
    const showMediaControls = (effectiveFileType === 'video' || effectiveFileType === 'audio');
    const hasDecryptionError = decryption.state.kind === 'failed';
    const isAwaitingUnlock = decryption.state.kind === 'awaitingUnlock';
    const isAwaitingSignerKey = decryption.state.kind === 'awaitingSignerKey';

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-background safe-top safe-bottom">
            {/* Header */}
            <PreviewHeader
                filename={displayFilename}
                signatureState={decryption.signatureState}
                timestampStatus={timestampStatus}
                onTimestampClick={() => setShowTimestampModal(true)}
                onDownload={handleDownload}
                onClose={onClose}
            />

            {/* Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-black/90 relative">
                {/* Unsupported encryption version */}
                {isUnsupportedVersion && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
                        <AlertTriangle className="w-12 h-12 text-red-400" />
                        <p className="text-sm text-red-500 font-medium">Unsupported encryption version: {encryptionVersion}</p>
                        <p className="text-xs text-white/60 mt-1">This file uses an encryption format that is not supported by this client.</p>
                    </div>
                )}

                {/* Waiting for API to return URL */}
                {isQueryLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-white" />
                        <p className="text-white/70">Loading file metadata...</p>
                    </div>
                )}

                {/* Vault locked — should be unreachable here because UnlockBoundary
                    swaps the whole subtree out, but kept as a safety net for any
                    transient state (e.g. derive-time mismatch). */}
                {isAwaitingUnlock && <InlineUnlockPrompt />}

                {/* Waiting for signer public key lookup before we can verify */}
                {isAwaitingSignerKey && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-white" />
                        <p className="text-white/70">Verifying signer...</p>
                    </div>
                )}

                {/* Decryption / stream setup in progress */}
                {!isQueryLoading && !mediaUrl && !hasDecryptionError && !isAwaitingUnlock && !isAwaitingSignerKey && rawUrl && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
                        {videoStream.isRegistering ? (
                            <>
                                <div className="relative w-16 h-16">
                                    <Lock className="w-16 h-16 text-white/20 absolute inset-0" />
                                    <Unlock className="w-16 h-16 text-white absolute inset-0 animate-pulse" />
                                </div>
                                <p className="text-white/70">Preparing secure stream</p>
                                <p className="text-white/40 text-xs">Extracting encryption key</p>
                            </>
                        ) : (
                            <>
                                <Loader2 className="w-12 h-12 animate-spin text-white" />
                                <p className="text-white/70">Decrypting file...</p>
                                {decryption.state.progress > 0 && (
                                    <p className="text-white/50 text-sm">{Math.round(decryption.state.progress)}%</p>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Decryption failed */}
                {hasDecryptionError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
                        <AlertTriangle className="w-12 h-12 text-red-400" />
                        <p className="text-red-400 text-lg font-medium">Decryption failed</p>
                        <p className="text-red-400/80 text-sm text-center max-w-md px-4">{decryption.state.error}</p>
                        <p className="text-white/40 text-xs">{displayFilename}</p>
                        <Button onClick={handleDownload} variant="outline" className="mt-2">
                            <Download className="w-4 h-4 mr-2" />
                            Download encrypted file
                        </Button>
                    </div>
                )}

                {/* API returned no URL (unexpected) */}
                {!isQueryLoading && !rawUrl && !hasDecryptionError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
                        <AlertTriangle className="w-12 h-12 text-yellow-400" />
                        <p className="text-yellow-400 text-lg font-medium">Unable to load file</p>
                        <p className="text-white/60 text-sm">The file URL could not be retrieved. Please close and try again.</p>
                    </div>
                )}

                {/* Video Player */}
                {effectiveFileType === 'video' && mediaUrl && (
                    <VideoPlayer
                        ref={mediaControls.videoRef}
                        mediaUrl={mediaUrl}
                        filename={displayFilename}
                        mimeType={effectiveMimeType}
                        state={mediaControls.state}
                        videoContainerRef={mediaControls.videoContainerRef}
                        onLoadedMetadata={mediaControls.handleLoadedMetadata}
                        onTimeUpdate={mediaControls.handleTimeUpdate}
                        onEnded={mediaControls.handleEnded}
                        onError={mediaControls.handleMediaError}
                        onTogglePlay={mediaControls.togglePlay}
                        onToggleFullscreen={mediaControls.toggleFullscreen}
                        onSeek={mediaControls.handleSeek}
                        onDownload={handleDownload}
                        onStalled={() => debugWarn('[Preview]', 'Video stalled: ' + displayFilename)}
                    />
                )}

                {/* Audio Player */}
                {effectiveFileType === 'audio' && mediaUrl && (
                    <AudioPlayer
                        ref={mediaControls.audioRef}
                        mediaUrl={mediaUrl}
                        filename={displayFilename}
                        mimeType={effectiveMimeType}
                        state={mediaControls.state}
                        onLoadedMetadata={mediaControls.handleLoadedMetadata}
                        onTimeUpdate={mediaControls.handleTimeUpdate}
                        onEnded={mediaControls.handleEnded}
                        onError={mediaControls.handleMediaError}
                        onDownload={handleDownload}
                    />
                )}

                {/* Image Viewer */}
                {effectiveFileType === 'image' && mediaUrl && (
                    <ImageViewer
                        mediaUrl={mediaUrl}
                        filename={displayFilename}
                        imageState={imageControls.state}
                        onLoad={() => mediaControls.setLoading(false)}
                        onError={handleImageError}
                        onDownload={handleDownload}
                        onZoomTo={imageControls.zoomTo}
                        onResetZoom={imageControls.reset}
                    />
                )}

                {/* Document Viewer */}
                {effectiveFileType === 'document' && mediaUrl && (
                    <DocumentViewer
                        mediaUrl={mediaUrl}
                        mimeType={file.mimeType ?? undefined}
                        onLoad={() => mediaControls.setLoading(false)}
                        onDownload={handleDownload}
                    />
                )}

                {/* Unsupported file type */}
                {effectiveFileType === 'other' && (
                    <UnsupportedFile onDownload={handleDownload} />
                )}
            </div>

            {/* Media Controls (video/audio) */}
            {showMediaControls && (
                <MediaControls
                    state={mediaControls.state}
                    fileType={effectiveFileType}
                    onTogglePlay={mediaControls.togglePlay}
                    onToggleMute={mediaControls.toggleMute}
                    onVolumeChange={mediaControls.handleVolumeChange}
                    onSeek={mediaControls.handleSeek}
                    onSkip={mediaControls.skip}
                    onToggleFullscreen={mediaControls.toggleFullscreen}
                />
            )}

            {/* Image Controls (only show when no error) */}
            {effectiveFileType === 'image' && !imageControls.state.error && (
                <ImageControls
                    state={imageControls.state}
                    onZoomIn={imageControls.zoomIn}
                    onZoomOut={imageControls.zoomOut}
                    onRotate={imageControls.rotate}
                />
            )}

            {/* Timestamp Proof Modal */}
            {showTimestampModal && (
                <TimestampProofModal
                    fileId={file.id}
                    filename={displayFilename}
                    open={showTimestampModal}
                    onClose={() => setShowTimestampModal(false)}
                />
            )}
        </div>
    );
}

// Re-export types for convenience
export type { FilePreviewModalProps } from './types';
