/**
 * Mutation error contract
 *
 * Guards against `useMutation({ onError: ... toast.error(...) })` co-existing
 * with `await mutation.mutateAsync(...)` inside a `try/catch` whose catch also
 * toasts. The mutation lifecycle and the rejected promise both fire on a
 * single failure. Fixed for ShamirSetupDialog / ShamirRevokeDialog; the sweep
 * below scans every web component for the same shape.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const WEB_SRC = path.resolve(import.meta.dirname, "..");

function walkSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip generated and test directories — false-positive heavy and not user-facing.
            if (entry.name === "node_modules" || entry.name === "__tests__") continue;
            walkSourceFiles(full, out);
        } else if (
            (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
            !entry.name.includes(".test.") &&
            !entry.name.includes(".spec.")
        ) {
            out.push(full);
        }
    }
    return out;
}

describe("Mutation error contract — single source of toast per failure", () => {
    // The bug we're guarding: a useMutation({ onError: toast.error(...) }) coexisting
    // with `await mutation.mutateAsync(...)` inside try { } catch { toast.error(...) }
    // for the SAME mutation. Both lifecycle paths fire on a single FORBIDDEN/network
    // failure, producing a doubled notification (see ShamirSetupDialog 2026-04-26).
    //
    // Precision matters here: a coarse "file has both onError-toast and catch-toast"
    // check produces false positives where the catch wraps a different mutation
    // (or non-mutation work like utils.X.fetch). We extract try/catch blocks via
    // brace counting and only flag the catch if its preceding try awaits a
    // mutation whose declaration in the same file toasts inside onError.

    /** Walk a balanced { ... } block starting at `start` (which must point at `{`). */
    function findMatchingBrace(src: string, start: number): number {
        let depth = 1;
        for (let i = start + 1; i < src.length; i++) {
            const c = src.charAt(i);
            if (c === '"' || c === "'" || c === '`') {
                const quote = c;
                i++;
                while (i < src.length && src.charAt(i) !== quote) {
                    if (src.charAt(i) === '\\') i++;
                    i++;
                }
            } else if (c === '/' && src.charAt(i + 1) === '/') {
                while (i < src.length && src.charAt(i) !== '\n') i++;
            } else if (c === '/' && src.charAt(i + 1) === '*') {
                i += 2;
                while (i < src.length - 1 && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) i++;
                i++;
            } else if (c === '{') {
                depth++;
            } else if (c === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    interface TryCatch { tryBody: string; catchBody: string; }

    function extractTryCatchBlocks(src: string): TryCatch[] {
        const out: TryCatch[] = [];
        const tryRe = /\btry\s*\{/g;
        let m: RegExpExecArray | null;
        while ((m = tryRe.exec(src))) {
            const openBrace = m.index + m[0].length - 1;
            const tryEnd = findMatchingBrace(src, openBrace);
            if (tryEnd < 0) continue;
            const tryBody = src.slice(openBrace + 1, tryEnd);

            // Look for matching `catch (...) { ... }` after the try.
            let k = tryEnd + 1;
            while (k < src.length && /\s/.test(src.charAt(k))) k++;
            if (src.slice(k, k + 5) !== "catch") continue;
            k += 5;
            while (k < src.length && /\s/.test(src.charAt(k))) k++;
            if (src.charAt(k) === '(') {
                let depth = 1;
                k++;
                while (k < src.length && depth > 0) {
                    if (src.charAt(k) === '(') depth++;
                    else if (src.charAt(k) === ')') depth--;
                    k++;
                }
            }
            while (k < src.length && /\s/.test(src.charAt(k))) k++;
            if (src.charAt(k) !== '{') continue;
            const catchEnd = findMatchingBrace(src, k);
            if (catchEnd < 0) continue;
            const catchBody = src.slice(k + 1, catchEnd);

            out.push({ tryBody, catchBody });
            tryRe.lastIndex = catchEnd + 1;
        }
        return out;
    }

    /** Names of mutations whose `useMutation({...})` declaration has onError calling toast.error. */
    function mutationsThatToastInOnError(src: string): Set<string> {
        const out = new Set<string>();
        // const NAME = ...useMutation({ ... onError: ... toast.error ... })
        const declRe = /const\s+(\w+)\s*=\s*[^;]*?\.useMutation\s*(?:<[^>]*>)?\s*\(\s*\{/g;
        let m: RegExpExecArray | null;
        while ((m = declRe.exec(src))) {
            const name = m[1];
            if (!name) continue;
            const openBrace = m.index + m[0].length - 1;
            const closeBrace = findMatchingBrace(src, openBrace);
            if (closeBrace < 0) continue;
            const body = src.slice(openBrace + 1, closeBrace);
            // onError property — match its arrow body roughly.
            if (/onError\s*:[^,}]*?toast\.error/s.test(body)) {
                out.add(name);
            }
        }
        return out;
    }

    it("no try{await X.mutateAsync}catch{toast.error} where X also toasts in onError", () => {
        const offenders: Array<{ file: string; mutation: string }> = [];

        for (const file of walkSourceFiles(WEB_SRC)) {
            const content = fs.readFileSync(file, "utf-8");
            if (!content.includes("mutateAsync") || !content.includes("toast.error")) continue;

            const toastingMutations = mutationsThatToastInOnError(content);
            if (toastingMutations.size === 0) continue;

            for (const block of extractTryCatchBlocks(content)) {
                if (!/toast\.error/.test(block.catchBody)) continue;
                // Find any `await NAME.mutateAsync` in the try body.
                const asyncRe = /\bawait\s+(\w+)\s*\.mutateAsync\b/g;
                let am: RegExpExecArray | null;
                while ((am = asyncRe.exec(block.tryBody))) {
                    const name = am[1];
                    if (name && toastingMutations.has(name)) {
                        offenders.push({ file: path.relative(WEB_SRC, file).replace(/\\/g, "/"), mutation: name });
                    }
                }
            }
        }

        expect(offenders).toEqual([]);
    });
});
