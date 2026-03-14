/**
 * useSaveToVault Hook
 *
 * Saves a decrypted file (Blob) to the user's vault by:
 * 1. Encrypting filename with user's filename key
 * 2. Encrypting file content with V4 hybrid encryption (PQC)
 * 3. Uploading encrypted blob to R2 via presigned URL
 * 4. Confirming upload with encryption metadata
 *
 * Used by ReceivePage to let authenticated users save received files.
 */

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { encryptFilename } from '@/lib/fileCrypto';
import { encryptFileV4 } from '@/lib/fileEncryptor';
import { useMasterKey } from '@/hooks/useMasterKey';

type SaveState = 'idle' | 'encrypting' | 'uploading' | 'confirming' | 'done' | 'error';

export function useSaveToVault() {
  const { isUnlocked, isConfigured, deriveFilenameKey, getHybridPublicKey } = useMasterKey();
  const getUploadUrl = trpc.files.getUploadUrl.useMutation();
  const confirmUpload = trpc.files.confirmUpload.useMutation();
  const cancelUpload = trpc.files.cancelUpload.useMutation();

  const [state, setState] = useState<SaveState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const saveToVault = useCallback(async (blob: Blob, fileName: string, mimeType: string) => {
    if (!isConfigured || !isUnlocked) {
      setError('Vault is locked. Unlock your vault first.');
      setState('error');
      return false;
    }

    setState('encrypting');
    setProgress(0);
    setError(null);

    let serverFileId: number | null = null;

    try {
      // 1. Encrypt filename
      const filenameKey = await deriveFilenameKey();
      const { encryptedFilename, iv: filenameIv } = await encryptFilename(fileName, filenameKey);
      const parts = fileName.split('.');
      const extension = parts.length > 1 ? `.${parts.pop()}` : '';
      const opaqueFilename = `encrypted${extension}`;

      // 2. Encrypt file content (V4 hybrid PQC)
      const file = new File([blob], opaqueFilename, { type: mimeType });
      const hybridPublicKey = await getHybridPublicKey();

      const hybridResult = await encryptFileV4(file, hybridPublicKey, {
        onProgress: (p) => setProgress(Math.round(p.percentage * 0.5)),
      });

      // 3. Get presigned upload URL (creates file record + reserves quota)
      setState('uploading');
      setProgress(50);

      const estimatedSize = hybridResult.blob.size;
      const urlResult = await getUploadUrl.mutateAsync({
        filename: opaqueFilename,
        contentType: 'application/octet-stream',
        size: estimatedSize,
        encryptedFilename,
        filenameIv,
        plaintextExtension: extension,
        originalMimeType: mimeType,
      });

      serverFileId = urlResult.fileId;

      // 4. Upload encrypted blob to R2
      const uploadResponse = await fetch(urlResult.uploadUrl, {
        method: 'PUT',
        body: hybridResult.blob,
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      setProgress(85);

      // 5. Confirm upload with encryption metadata
      setState('confirming');
      await confirmUpload.mutateAsync({
        fileId: urlResult.fileId,
        encryptionIv: hybridResult.metadata.iv,
        encryptionSalt: '',
        encryptionVersion: 4,
      });

      setProgress(100);
      setState('done');
      serverFileId = null; // Success — don't cleanup
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Failed to save to vault';
      setError(msg);
      setState('error');

      // Cleanup: rollback server record + quota if we got a fileId
      if (serverFileId) {
        cancelUpload.mutateAsync({ fileId: serverFileId }).catch(() => {});
      }

      return false;
    }
  }, [isUnlocked, isConfigured, deriveFilenameKey, getHybridPublicKey, getUploadUrl, confirmUpload, cancelUpload]);

  const reset = useCallback(() => {
    setState('idle');
    setProgress(0);
    setError(null);
  }, []);

  return {
    saveToVault,
    reset,
    state,
    progress,
    error,
    canSave: isConfigured && isUnlocked,
  };
}
