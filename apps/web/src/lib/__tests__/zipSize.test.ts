import { describe, it, expect } from "vitest";
import { Zip, ZipPassThrough } from "fflate";
import { calculateZipSize, deduplicateFilenames } from "../zipBundle";

/**
 * Reference implementation: run fflate's streaming Zip + ZipPassThrough to
 * measure the actual byte count. Used to validate the analytical formula.
 */
function measureStreamingZipSize(
  entries: ReadonlyArray<{ name: string; data: Uint8Array }>,
): number {
  let total = 0;
  const zip = new Zip((_err, chunk, _final) => {
    total += chunk.length;
  });

  for (const entry of entries) {
    const pass = new ZipPassThrough(entry.name);
    zip.add(pass);
    pass.push(entry.data, true);
  }
  zip.end();
  return total;
}

describe("calculateZipSize", () => {
  it("matches fflate streaming output for 2 small files", () => {
    const entries = [
      { name: "hello.txt", data: new Uint8Array([72, 101, 108, 108, 111]) },
      { name: "world.txt", data: new Uint8Array([87, 111, 114, 108, 100]) },
    ];

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("matches fflate for a single file", () => {
    const entries = [
      { name: "only.bin", data: new Uint8Array(1024) },
    ];

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("matches fflate for many files", () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      name: `file-${String(i).padStart(3, "0")}.dat`,
      data: new Uint8Array(100 + i * 37),
    }));

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("matches fflate for Unicode filenames (multi-byte UTF-8)", () => {
    const entries = [
      { name: "文档.txt", data: new Uint8Array(256) },
      { name: "résumé.pdf", data: new Uint8Array(512) },
      { name: "🔒secret.enc", data: new Uint8Array(128) },
    ];

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("matches fflate for zero-byte files", () => {
    const entries = [
      { name: "empty.txt", data: new Uint8Array(0) },
      { name: ".gitkeep", data: new Uint8Array(0) },
    ];

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("matches fflate for large file sizes", () => {
    // Don't allocate huge buffers — just verify the formula for large sizes.
    // Use a 1 MiB file to spot-check the actual output against the formula.
    const entries = [
      { name: "big.bin", data: new Uint8Array(1024 * 1024) },
    ];

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("handles long filenames", () => {
    const longName = "a".repeat(255) + ".txt";
    const entries = [
      { name: longName, data: new Uint8Array(64) },
    ];

    const actual = measureStreamingZipSize(entries);
    const calculated = calculateZipSize(
      entries.map((e) => ({ name: e.name, size: e.data.byteLength })),
    );

    expect(calculated).toBe(actual);
  });

  it("returns correct size for empty entry list", () => {
    // ZIP with no files: just ZIP64 EOCD + locator + EOCD
    const actual = measureStreamingZipSize([]);
    const calculated = calculateZipSize([]);
    expect(calculated).toBe(actual);
  });
});

describe("deduplicateFilenames", () => {
  it("returns names unchanged when no collisions", () => {
    const files = [{ name: "a.txt" }, { name: "b.txt" }, { name: "c.txt" }];
    expect(deduplicateFilenames(files)).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("appends (N) on collision with extension", () => {
    const files = [{ name: "doc.pdf" }, { name: "doc.pdf" }, { name: "doc.pdf" }];
    expect(deduplicateFilenames(files)).toEqual(["doc.pdf", "doc (2).pdf", "doc (3).pdf"]);
  });

  it("appends (N) on collision without extension", () => {
    const files = [{ name: "README" }, { name: "README" }];
    expect(deduplicateFilenames(files)).toEqual(["README", "README (2)"]);
  });

  it("handles mixed collisions", () => {
    const files = [
      { name: "photo.jpg" },
      { name: "notes.txt" },
      { name: "photo.jpg" },
      { name: "notes.txt" },
      { name: "photo.jpg" },
    ];
    expect(deduplicateFilenames(files)).toEqual([
      "photo.jpg",
      "notes.txt",
      "photo (2).jpg",
      "notes (2).txt",
      "photo (3).jpg",
    ]);
  });

  it("avoids collision between generated name and existing original name", () => {
    // "doc (2).pdf" exists as an original, so "doc.pdf" dup must skip (2) and use (3)
    const files = [
      { name: "doc (2).pdf" },
      { name: "doc.pdf" },
      { name: "doc.pdf" },
    ];
    const result = deduplicateFilenames(files);
    expect(new Set(result).size).toBe(3); // all unique
    expect(result[0]).toBe("doc (2).pdf");
    expect(result[1]).toBe("doc.pdf");
    expect(result[2]).toBe("doc (3).pdf");
  });
});
