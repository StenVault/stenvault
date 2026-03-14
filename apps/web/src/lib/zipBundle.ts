/**
 * Zip Bundle - Multi-file to zip using fflate.
 * Used when sending multiple files via /send.
 */
import { zipSync } from "fflate";

export interface ZipManifest {
  files: Array<{ name: string; size: number; type: string }>;
}

/**
 * Bundle multiple files into a single zip.
 * If only 1 file, returns it as-is (no zip overhead).
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
  const manifest: ZipManifest = { files: [] };
  const zipData: Record<string, Uint8Array> = {};

  // Track name collisions
  const nameCount = new Map<string, number>();

  for (const file of files) {
    let name = file.name;

    // Deduplicate filenames
    const count = nameCount.get(name) ?? 0;
    if (count > 0) {
      const ext = name.lastIndexOf(".");
      if (ext > 0) {
        name = `${name.slice(0, ext)} (${count + 1})${name.slice(ext)}`;
      } else {
        name = `${name} (${count + 1})`;
      }
    }
    nameCount.set(file.name, count + 1);

    manifest.files.push({
      name: file.name, // original name for display
      size: file.size,
      type: file.type || "application/octet-stream",
    });

    const buffer = await file.arrayBuffer();
    zipData[name] = new Uint8Array(buffer);
  }

  // Create zip (synchronous — runs in main thread, fine for < 2GB)
  const zipped = zipSync(zipData, { level: 0 }); // level 0 = store only, no compression (already encrypted)

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const sizeStr = totalSize >= 1e9
    ? `${(totalSize / 1e9).toFixed(1)} GB`
    : totalSize >= 1e6
      ? `${(totalSize / 1e6).toFixed(1)} MB`
      : `${(totalSize / 1e3).toFixed(1)} KB`;

  return {
    blob: new Blob([zipped as BlobPart], { type: "application/zip" }),
    manifest,
    mimeType: "application/zip",
    displayName: `bundle.zip (${files.length} files, ${sizeStr})`,
  };
}
