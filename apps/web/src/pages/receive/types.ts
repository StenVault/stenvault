export type PageState = "loading" | "preview" | "password" | "downloading" | "decrypting" | "done" | "error" | "missing_key";

export interface ManifestEntry {
  name: string;
  size: number;
  type: string;
}
