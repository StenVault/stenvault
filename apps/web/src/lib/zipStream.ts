/**
 * Streaming ZIP Creation
 *
 * Bridges fflate's streaming Zip class to a Web ReadableStream<Uint8Array>
 * via TransformStream. Allows producing ZIP archives without buffering
 * the entire archive in memory.
 *
 * Usage:
 *   const zip = createZipStream();
 *   // Consumer reads zip.readable (e.g. streamDownloadToDisk)
 *   await zip.addFile("folder/file.txt", uint8array);
 *   await zip.addFile("folder/large.bin", readableStream);
 *   zip.end();
 */

import { Zip, ZipPassThrough } from 'fflate';

export interface ZipStreamHandle {
  /** ReadableStream that emits ZIP bytes as they are produced */
  readable: ReadableStream<Uint8Array>;
  /** Add a file to the ZIP archive. Resolves when all data has been fed to the entry. */
  addFile: (path: string, data: Uint8Array | ReadableStream<Uint8Array>) => Promise<void>;
  /** Finalize the ZIP archive (writes central directory). */
  end: () => void;
  /** Abort — terminates the writable side with an error. */
  terminate: (reason?: string) => void;
}

export function createZipStream(): ZipStreamHandle {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  let errored = false;
  /** Track the last write so addFile can await backpressure before pushing more data */
  let lastWrite = Promise.resolve();

  const zip = new Zip((err, chunk, final) => {
    if (errored) return;
    if (err) {
      errored = true;
      writer.abort(err).catch((abortErr) => {
        console.warn('[ZipStream] Failed to abort writer after fflate error:', abortErr);
      });
      return;
    }

    const p = chunk.length > 0
      ? writer.write(chunk)
      : Promise.resolve();

    lastWrite = p
      .then(() => {
        if (final) {
          writer.close().catch((closeErr) => {
            console.error('[ZipStream] Failed to close writer after final chunk:', closeErr);
          });
        }
      })
      .catch((writeErr) => {
        // Write failed — mark errored so no more data is pushed, and abort the stream
        errored = true;
        console.error('[ZipStream] Writer.write() failed, ZIP may be corrupt:', writeErr);
        writer.abort(writeErr).catch(() => {});
      });
  });

  async function addFile(
    path: string,
    data: Uint8Array | ReadableStream<Uint8Array>,
  ): Promise<void> {
    if (errored) throw new Error('ZIP stream already errored');

    const entry = new ZipPassThrough(path);
    zip.add(entry);

    try {
      if (data instanceof ReadableStream) {
        const reader = data.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Await backpressure before pushing next chunk
            await lastWrite;
            if (errored) throw new Error('ZIP stream errored during write');
            entry.push(value, false);
          }
        } finally {
          reader.releaseLock();
        }
        // Signal end of this entry
        await lastWrite;
        entry.push(new Uint8Array(0), true);
      } else {
        // Single Uint8Array — push all at once
        await lastWrite;
        if (errored) throw new Error('ZIP stream errored during write');
        entry.push(data, true);
      }
      // Wait for the data to be flushed before returning
      await lastWrite;
    } catch (pushErr) {
      // Ensure entry is finalized even on error to avoid corrupt ZIP headers
      try { entry.push(new Uint8Array(0), true); } catch { /* entry may already be finalized */ }
      throw pushErr;
    }
  }

  function end(): void {
    if (!errored) {
      zip.end();
    }
  }

  function terminate(reason?: string): void {
    errored = true;
    writer.abort(reason ?? 'ZIP stream terminated').catch(() => {});
  }

  return { readable, addFile, end, terminate };
}
