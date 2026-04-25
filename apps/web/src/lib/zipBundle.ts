/**
 * Deduplicate filenames for multi-file Send bundles.
 *
 * Why: two identical names inside a bundle break the client-zip receiver
 * path — one entry would silently overwrite the other on disk when the
 * browser saves the streamed ZIP. `deduplicateFilenames` appends " (N)"
 * on collision so every entry in the generated archive is unique.
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
