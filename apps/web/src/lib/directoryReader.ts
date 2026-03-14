/**
 * Directory Reader - Recursive folder reading from drag & drop.
 * Uses File System Access API (webkitGetAsEntry) with fallback.
 * Uses Promise.allSettled for tolerance to unreadable files.
 */

/**
 * Read all files from a DataTransfer, recursively traversing directories.
 * Preserves relative paths via webkitRelativePath where available.
 * Tolerates individual file read failures (logs warnings, continues with rest).
 */
export async function readDroppedEntries(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;

  // Try using the entry API for directory support
  if (items && items.length > 0) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i]?.webkitGetAsEntry?.() ?? (items[i] as any)?.getAsEntry?.();
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      const files: File[] = [];
      let skipped = 0;
      const results = await Promise.allSettled(
        entries.map((entry) => traverseEntry(entry, "", files))
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          skipped++;
          console.warn('[DirectoryReader] Failed to read entry:', result.reason);
        }
      }
      if (skipped > 0) {
        console.warn(`[DirectoryReader] ${skipped} top-level entry(ies) could not be read.`);
      }
      return files;
    }
  }

  // Fallback: return files directly (no directory support)
  return Array.from(dataTransfer.files);
}

async function traverseEntry(entry: FileSystemEntry, basePath: string, files: File[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    try {
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      // Reconstruct path: create a new File with the relative path in the name
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      // We can't modify webkitRelativePath, so store path in file name for zip
      const fileWithPath = new File([file], relativePath, {
        type: file.type,
        lastModified: file.lastModified,
      });
      files.push(fileWithPath);
    } catch (err) {
      console.warn(`[DirectoryReader] Skipping unreadable file: ${basePath}/${entry.name}`, err);
    }
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dirReader = dirEntry.createReader();
    const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    // readEntries may not return all entries at once — must loop until empty
    let batch: FileSystemEntry[];
    do {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirReader.readEntries(resolve, reject);
      });
      const results = await Promise.allSettled(
        batch.map((e) => traverseEntry(e, dirPath, files))
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn(`[DirectoryReader] Failed to read entry in ${dirPath}:`, result.reason);
        }
      }
    } while (batch.length > 0);
  }
}
