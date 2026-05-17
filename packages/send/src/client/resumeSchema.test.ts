/**
 * Schema pin for SendResumeRecord (V2 per-file).
 *
 * This record is the contract between the upload orchestrator and the
 * resume flow. If a field gets renamed, removed, or added without a
 * version bump in `resume.ts`, users with in-flight records stop
 * resuming. Pinning `keyof SendResumeRecord` here forces any change
 * to be deliberate.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { SendResumeRecord, SendResumeFileEntry } from "./resume";

describe("SendResumeRecord schema", () => {
    it("pins the set of persisted fields", () => {
        expectTypeOf<keyof SendResumeRecord>().toEqualTypeOf<
            | "v"
            | "sessionId"
            | "uploadSecret"
            | "fragment"
            | "baseIv"
            | "totalBytes"
            | "fileCount"
            | "files"
            | "partSize"
            | "createdAt"
            | "expiresAt"
        >();
    });

    it("pins the set of per-file fields", () => {
        expectTypeOf<keyof SendResumeFileEntry>().toEqualTypeOf<
            | "fileIndex"
            | "name"
            | "size"
            | "mimeType"
            | "totalParts"
            | "completedParts"
        >();
    });

    it("locks the version literal to 2", () => {
        expectTypeOf<SendResumeRecord["v"]>().toEqualTypeOf<2>();
    });
});
