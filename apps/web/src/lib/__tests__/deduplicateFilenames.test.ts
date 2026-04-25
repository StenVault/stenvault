import { describe, it, expect } from "vitest";
import { deduplicateFilenames } from "../zipBundle";

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
