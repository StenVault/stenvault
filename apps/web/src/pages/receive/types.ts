export type PageState = "loading" | "preview" | "password" | "downloading" | "decrypting" | "done" | "error" | "missing_key";

export interface ManifestEntry {
  fileIndex: number;
  name: string;
  size: number;
  type: string;
}
