/**
 * useVideoStream Hook
 *
 * Activates Service Worker streaming for large video/audio files.
 * Instead of accumulating the entire decrypted file as a Blob (OOM for >2GB),
 * sends the file key + metadata to the SW, which fetches and decrypts
 * chunks on demand with Range request support.
 *
 * Activation criteria:
 * - File size >= SW_THRESHOLD (100MB)
 * - File type is video or audio
 * - Encryption version is 4 (V4 CVEF)
 * - File is NOT signed (signed files need full-file SHA-256 verification)
 * - Service Worker API is available
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { debugLog, debugError } from '@/lib/debugLogger';
import { extractV4FileKeyWithMetadata } from '@/lib/hybridFileCrypto';
import { isSwStreamAvailable, registerStream, updateStreamUrl, getStreamIdFromUrl } from '@/lib/platform';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useOrgMasterKey } from '@/hooks/useOrgMasterKey';
import { unwrapOrgHybridSecretKey } from '@/lib/orgHybridCrypto';
import { trpc } from '@/lib/trpc';
import { getEffectiveMimeType } from './useFileDecryption';
import { STREAMING_VIDEO } from '@/lib/constants';
import type { PreviewableFile, SignatureInfo } from '../types';
import { isCVEFMetadataV1_4 } from '@stenvault/shared/platform/crypto';
import type { HybridSecretKey } from '@stenvault/shared/platform/crypto';

export interface UseVideoStreamOptions {
  file: PreviewableFile | null;
  isOpen: boolean;
  rawUrl: string | undefined;
  encryptionVersion: number;
  signatureInfo?: SignatureInfo | null;
  effectiveFileType: string;
}

export interface UseVideoStreamReturn {
  /** URL for <video src="...">, or null if not streaming */
  streamUrl: string | null;
  /** Whether the stream is being set up */
  isRegistering: boolean;
  /** Error message, if any */
  error: string | null;
  /** Whether SW streaming is active for this file */
  isStreamActive: boolean;
  /** Synchronous: true when this file qualifies for SW streaming (blocks blob path immediately) */
  shouldStream: boolean;
  /** Call when the <video> element errors while using SW stream — falls back to blob decryption */
  resetOnError: () => void;
}

export function useVideoStream({
  file,
  isOpen,
  rawUrl,
  encryptionVersion,
  signatureInfo,
  effectiveFileType,
}: UseVideoStreamOptions): UseVideoStreamReturn {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unregisterRef = useRef<(() => void) | null>(null);
  const registeredFileIdRef = useRef<number | null>(null);
  const refreshingUrlRef = useRef(false);

  const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
  const { unlockOrgVault } = useOrgMasterKey();
  const trpcUtils = trpc.useUtils();
  const trpcUtilsRef = useRef(trpcUtils);
  trpcUtilsRef.current = trpcUtils;

  // Determine if this file should use SW streaming
  const isMediaType = effectiveFileType === 'video' || effectiveFileType === 'audio';
  const isSigned = !!signatureInfo;
  const isLargeEnough = !!file && file.size >= STREAMING_VIDEO.SW_THRESHOLD_BYTES;
  const swAvailable = isSwStreamAvailable();
  const shouldStream = (
    isOpen &&
    isMediaType &&
    isLargeEnough &&
    encryptionVersion === 4 &&
    !isSigned &&
    swAvailable
  );

  debugLog('[stream]', 'shouldStream: ' + shouldStream, { fileId: file?.id, size: file?.size });

  const registerVideoStream = useCallback(async () => {
    if (!file || !rawUrl) return;

    debugLog('[stream]', 'registerVideoStream START', { fileId: file.id, size: file.size });
    setIsRegistering(true);
    setError(null);

    try {
      const isOrgFile = !!file.organizationId;

      let hybridSecretKey: HybridSecretKey;
      if (isOrgFile) {
        const omk = await unlockOrgVault(file.organizationId!);
        const orgSecretData = await trpcUtilsRef.current.orgKeys.getOrgHybridSecretKey.fetch({
          organizationId: file.organizationId!,
          ...(file.orgKeyVersion ? { keyVersion: file.orgKeyVersion } : {}),
        });
        hybridSecretKey = await unwrapOrgHybridSecretKey(omk, orgSecretData);
      } else {
        const personalKey = await getUnlockedHybridSecretKey();
        if (!personalKey) {
          throw new Error('Hybrid secret key not available. Please unlock your vault.');
        }
        hybridSecretKey = personalKey;
      }

      debugLog('[stream]', 'Extracting file key...');

      const { fileKeyBytes, metadata, headerBytes, zeroBytes } = await extractV4FileKeyWithMetadata(
        rawUrl,
        hybridSecretKey,
      );

      try {
        const mimeType = getEffectiveMimeType(file);

        // file.size is the encrypted R2 object size, not the original plaintext size.
        // Encrypted CVEF structure: [header] [N chunk frames] [integrity manifest]
        // Each chunk frame: 4B length prefix + ciphertext + 16B GCM tag = plaintext + 20B
        // v1.4 manifest: 4B len + (32B HMAC + 4B count + 32B headerHash) + 16B tag = 88B
        // v1.2/v1.3 manifest: 4B len + (32B HMAC + 4B count) + 16B tag = 56B
        const chunkCount = metadata.chunked!.count;
        const isV14 = isCVEFMetadataV1_4(metadata);
        const CHUNK_OVERHEAD = 20; // LENGTH_PREFIX(4) + GCM_TAG(16)
        const MANIFEST_SIZE = isV14 ? 88 : 56;
        const plaintextSize = file.size - headerBytes.byteLength - chunkCount * CHUNK_OVERHEAD - MANIFEST_SIZE;

        debugLog('[stream]', 'File key extracted, registering stream', { fileId: file.id, chunkCount, plaintextSize });

        const { streamUrl: url, unregister } = await registerStream({
          fileKeyBytes,
          metadata,
          headerBytes,
          r2Url: rawUrl,
          plaintextSize,
          mimeType,
        });

        unregisterRef.current = unregister;
        registeredFileIdRef.current = file.id;
        setStreamUrl(url);

        debugLog('[stream]', 'SW stream registered OK', { url, fileId: file.id });
      } finally {
        zeroBytes();
      }
    } catch (err) {
      debugError('[stream]', 'REGISTER FAILED', err);
      const message = err instanceof Error ? err.message : 'Failed to set up video streaming';
      setError(message);
      toast.error('Video streaming failed', {
        description: 'Falling back to standard decryption.',
      });
    } finally {
      setIsRegistering(false);
    }
  }, [file, rawUrl, getUnlockedHybridSecretKey, unlockOrgVault]);

  // Register stream when conditions are met
  useEffect(() => {
    const shouldRegister = shouldStream && rawUrl && file && isUnlocked && !streamUrl && !isRegistering && !error && registeredFileIdRef.current !== file?.id;

    if (shouldRegister) {
      registerVideoStream();
    }
  }, [shouldStream, rawUrl, file, isUnlocked, streamUrl, isRegistering, error, registerVideoStream]);

  // Cleanup on close or file change
  useEffect(() => {
    if (!isOpen || (file && registeredFileIdRef.current !== null && registeredFileIdRef.current !== file.id)) {
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
      setStreamUrl(null);
      setError(null);
      setIsRegistering(false);
      if (!isOpen) {
        registeredFileIdRef.current = null;
      }
    }
  }, [isOpen, file?.id]);

  // Reset stream on playback failure so blob decryption can take over
  const resetOnError = useCallback(() => {
    if (unregisterRef.current) {
      unregisterRef.current();
      unregisterRef.current = null;
    }
    setStreamUrl(null);
    setError('Stream playback failed — falling back to standard decryption');
    registeredFileIdRef.current = null;
  }, []);

  // Listen for URL_EXPIRED messages from SW and refresh the presigned URL
  useEffect(() => {
    if (!streamUrl || !file) return;

    const streamId = getStreamIdFromUrl(streamUrl);
    if (!streamId) return;

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'URL_EXPIRED' || event.data.streamId !== streamId) return;
      if (refreshingUrlRef.current) return;
      refreshingUrlRef.current = true;

      debugLog('[stream]', 'Presigned URL expired, refreshing...', { fileId: file.id });
      try {
        const fresh = await trpcUtilsRef.current.files.getStreamUrl.fetch({ fileId: file.id });
        if (fresh?.url) {
          await updateStreamUrl(streamId, fresh.url);
          debugLog('[stream]', 'Stream URL refreshed', { fileId: file.id });
        }
      } catch (err) {
        debugError('[stream]', 'Failed to refresh stream URL', err);
        toast.error('Stream link expired', {
          description: 'Please close and reopen the preview.',
        });
      } finally {
        refreshingUrlRef.current = false;
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [streamUrl, file?.id]);

  return {
    streamUrl,
    isRegistering,
    error,
    isStreamActive: !!streamUrl,
    shouldStream,
    resetOnError,
  };
}
