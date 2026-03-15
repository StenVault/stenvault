/**
 * File System Access API Provider (Tier 1)
 *
 * Uses the File System Access API (showSaveFilePicker) available in
 * Chrome/Edge (~78% of users) to stream decrypted data directly to disk
 * with ~0 memory overhead.
 */

import type { StreamingDownloadOptions, StreamingDownloadResult } from '@stenvault/shared/platform/download';

/** Check if File System Access API is available */
export function isFileSystemAccessAvailable(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/** Infer MIME accept type for the save dialog */
function inferAcceptType(mimeType?: string): Record<string, string[]> | undefined {
  if (!mimeType || mimeType === 'application/octet-stream') return undefined;
  const ext = mimeTypeToExtension(mimeType);
  if (!ext) return undefined;
  return { [mimeType]: [`.${ext}`] };
}

function mimeTypeToExtension(mime: string): string | null {
  const map: Record<string, string> = {
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'application/pdf': 'pdf', 'text/plain': 'txt',
  };
  return map[mime] ?? null;
}

/**
 * Stream a ReadableStream<Uint8Array> to disk via File System Access API.
 * Opens the native save dialog, then pipes chunks to disk.
 */
export async function streamToFileSystem(
  decryptedStream: ReadableStream<Uint8Array>,
  options: StreamingDownloadOptions,
): Promise<StreamingDownloadResult> {
  const accept = inferAcceptType(options.mimeType);
  const fileHandle = await (window as any).showSaveFilePicker({
    suggestedName: options.filename,
    ...(accept ? { types: [{ accept }] } : {}),
  });

  const writable: FileSystemWritableFileStream = await fileHandle.createWritable();
  const reader = decryptedStream.getReader();
  let bytesWritten = 0;

  try {
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException('Download aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      // Copy to clean ArrayBuffer for TypeScript strict mode (ArrayBufferLike vs ArrayBuffer)
      const buf = new ArrayBuffer(value.byteLength);
      new Uint8Array(buf).set(value);
      await writable.write(buf);
      bytesWritten += value.byteLength;

      if (options.onProgress && options.totalSize) {
        options.onProgress({
          bytesWritten,
          totalBytes: options.totalSize,
          percentage: Math.round((bytesWritten / options.totalSize) * 100),
        });
      }
    }

    await writable.close();
  } catch (err) {
    reader.releaseLock();
    await writable.abort().catch(() => {});
    throw err;
  }

  return { tier: 'file-system-access', bytesWritten };
}
