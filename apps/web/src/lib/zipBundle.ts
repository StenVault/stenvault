/**
 * Zip Bundle - Multi-file to zip using fflate.
 * Used when sending multiple files via /send.
 */
import { zipSync } from "fflate";

export interface ZipManifest {
  files: Array<{ name: string; size: number; type: string }>;
}

/**
 * Deduplicate filenames for ZIP entries — appends " (N)" on collision.
 * Returns names in the same order as input.
 */
export function deduplicateFilenames(files: ReadonlyArray<{ name: string }>): string[] {
  const usedNames = new Set<string>();
  const result: string[] = [];

  for (const file of files) {
    let name = file.name;
    let counter = 1;
    while (usedNames.has(name)) {
      counter++;
      const ext = file.name.lastIndexOf(".");
      if (ext > 0) {
        name = `${file.name.slice(0, ext)} (${counter})${file.name.slice(ext)}`;
      } else {
        name = `${file.name} (${counter})`;
      }
    }
    usedNames.add(name);
    result.push(name);
  }

  return result;
}

const ZIP_TEXT_ENCODER = new TextEncoder();

/**
 * Calculate the exact byte size of a store-mode ZIP archive produced by
 * fflate's streaming Zip + ZipPassThrough (level 0, no compression).
 *
 * fflate streaming writes data descriptors (16 bytes) after each file
 * because sizes/CRC aren't known when the local header is emitted. No
 * extra fields are added for ZipPassThrough entries.
 *
 * Validated by unit tests against fflate's actual streaming Zip output.
 */
export function calculateZipSize(
  entries: ReadonlyArray<{ name: string; size: number }>,
): number {
  // Per-file layout (fflate streaming, store mode):
  //   Local file header:   30 + nameLen  (no extra fields)
  //   File data:           fileSize      (uncompressed = compressed for store)
  //   Data descriptor:     16            (signature 4 + CRC 4 + compSize 4 + uncompSize 4)
  //   Central dir entry:   46 + nameLen  (no extra fields)
  //
  // fflate switches to ZIP64 EOCD when the central directory offset exceeds
  // 0xFFFFFFFF (~4 GiB) or entry count exceeds 0xFFFF.

  let localAndDataSize = 0;
  let centralDirSize = 0;

  for (const entry of entries) {
    const nameLen = ZIP_TEXT_ENCODER.encode(entry.name).byteLength;
    localAndDataSize += 30 + nameLen + entry.size + 16;
    centralDirSize += 46 + nameLen;
  }

  // fflate's streaming Zip class always emits a standard 22-byte EOCD.
  // It has no ZIP64 extension logic (verified in fflate 0.8.2 source).
  // If fflate adds ZIP64 in a future version, the unit tests against
  // real fflate output will catch the mismatch.
  return localAndDataSize + centralDirSize + 22;
}

function formatSizeStr(totalSize: number): string {
  if (totalSize >= 1e9) return `${(totalSize / 1e9).toFixed(1)} GB`;
  if (totalSize >= 1e6) return `${(totalSize / 1e6).toFixed(1)} MB`;
  return `${(totalSize / 1e3).toFixed(1)} KB`;
}

/**
 * Prepare metadata for a streaming multi-file ZIP upload without creating
 * the actual ZIP blob. Returns everything the caller needs to initiate the
 * upload session and drive the streaming pipeline.
 */
export function prepareStreamingBundle(
  files: File[],
): { zipEntryNames: string[]; manifest: ZipManifest; zipSize: number; mimeType: string; displayName: string } {
  if (files.length < 2) {
    throw new Error("prepareStreamingBundle requires at least 2 files");
  }

  const zipEntryNames = deduplicateFilenames(files);

  const manifest: ZipManifest = {
    files: files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    })),
  };

  const entries = zipEntryNames.map((name, i) => ({ name, size: files[i]!.size }));
  const zipSize = calculateZipSize(entries);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const sizeStr = formatSizeStr(totalSize);

  return {
    zipEntryNames,
    manifest,
    zipSize,
    mimeType: "application/zip",
    displayName: `bundle.zip (${files.length} files, ${sizeStr})`,
  };
}

/**
 * Bundle multiple files into a single zip (in-memory, synchronous).
 * If only 1 file, returns it as-is (no zip overhead).
 *
 * For multi-file sends, prefer prepareStreamingBundle() + uploadStreamingZip()
 * to avoid loading all files into memory at once.
 */
export async function bundleFilesToZip(
  files: File[],
): Promise<{ blob: Blob; manifest: ZipManifest | null; mimeType: string; displayName: string }> {
  if (files.length === 0) {
    throw new Error("No files to bundle");
  }

  // Single file — no zip needed
  if (files.length === 1) {
    const file = files[0]!;
    return {
      blob: file,
      manifest: null,
      mimeType: file.type || "application/octet-stream",
      displayName: file.name,
    };
  }

  // Multiple files — create zip
  const zipEntryNames = deduplicateFilenames(files);
  const manifest: ZipManifest = {
    files: files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    })),
  };

  const zipData: Record<string, Uint8Array> = {};
  for (let i = 0; i < files.length; i++) {
    const buffer = await files[i]!.arrayBuffer();
    zipData[zipEntryNames[i]!] = new Uint8Array(buffer);
  }

  const zipped = zipSync(zipData, { level: 0 });

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const sizeStr = formatSizeStr(totalSize);

  return {
    blob: new Blob([zipped as BlobPart], { type: "application/zip" }),
    manifest,
    mimeType: "application/zip",
    displayName: `bundle.zip (${files.length} files, ${sizeStr})`,
  };
}
