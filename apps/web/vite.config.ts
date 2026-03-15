import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig, type PluginOption } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { visualizer } from "rollup-plugin-visualizer";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

/**
 * Vite plugin to copy @openforge-sh/liboqs WASM modules to the build output.
 *
 * liboqs uses `import(variable)` internally which Rollup cannot statically resolve.
 * At runtime, the browser resolves these to `/dist/ml-kem-768.min.js` etc.
 * This plugin copies the self-contained WASM modules (base64-embedded) so
 * express.static can serve them in production.
 */
const LIBOQS_FILES = ["ml-kem-768.min.js", "ml-dsa-65.min.js"] as const;
const LIBOQS_PROBE: string = LIBOQS_FILES[0];

function findLiboqsDist(): string | null {
    // Strategy 1: Walk up from apps/web/ checking node_modules at each level
    // (handles pnpm hoisting to workspace root)
    let dir = import.meta.dirname;
    while (dir !== path.dirname(dir)) {
        const candidate = path.join(dir, "node_modules/@openforge-sh/liboqs/dist");
        if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, LIBOQS_PROBE))) {
            return candidate;
        }
        dir = path.dirname(dir);
    }

    // Strategy 2: Search pnpm .pnpm store directly (Docker resolves symlinks
    // during COPY, so the package may only exist in .pnpm/)
    const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
    const pnpmStore = path.join(workspaceRoot, "node_modules/.pnpm");
    if (fs.existsSync(pnpmStore)) {
        try {
            const entries = fs.readdirSync(pnpmStore);
            for (const entry of entries) {
                if (entry.startsWith("@openforge-sh+liboqs")) {
                    const candidate = path.join(pnpmStore, entry, "node_modules/@openforge-sh/liboqs/dist");
                    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, LIBOQS_PROBE))) {
                        return candidate;
                    }
                }
            }
        } catch { /* ignore readdir failures */ }
    }

    return null;
}

function copyLiboqsFiles(liboqsDist: string, outputDir: string): boolean {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let allCopied = true;
    for (const file of LIBOQS_FILES) {
        const src = path.join(liboqsDist, file);
        const dest = path.join(outputDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[liboqs] Copied ${file} (${fs.statSync(src).size} bytes) to ${path.relative(import.meta.dirname, outputDir)}/`);
        } else {
            console.error(`[liboqs] ${file} not found at ${src}`);
            allCopied = false;
        }
    }
    return allCopied;
}

function liboqsCopyPlugin(): PluginOption {
    return {
        name: "copy-liboqs-wasm",
        apply: "build",
        writeBundle() {
            const liboqsDist = findLiboqsDist();
            if (!liboqsDist) {
                console.error("[liboqs] Package @openforge-sh/liboqs not found — V4/PQC encryption will be unavailable");
                return;
            }
            console.log(`[liboqs] Found package at ${liboqsDist}`);

            const outputDir = path.resolve(import.meta.dirname, "dist/dist");
            copyLiboqsFiles(liboqsDist, outputDir);
        },
    };
}

// Build plugins list
const plugins: PluginOption[] = [
    wasm(),
    topLevelAwait(),
    react(),
    tailwindcss(),
    jsxLocPlugin(),
    liboqsCopyPlugin(),
];

// Manus runtime injects a large inline <script> that violates production CSP
// (script-src 'self' blocks inline scripts). Only include during dev server.
if (process.env.NODE_ENV !== "production") {
    plugins.push(vitePluginManusRuntime());
}

// Only add visualizer in analyze mode
if (process.env.ANALYZE) {
    plugins.push(
        visualizer({
            filename: "dist/stats.html",
            open: false,
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
        }) as PluginOption
    );
}

export default defineConfig({
    plugins,
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            "@stenvault/shared": path.resolve(import.meta.dirname, "..", "..", "packages", "shared", "src"),
            "@shared": path.resolve(import.meta.dirname, "..", "..", "packages", "shared", "src"),
            "@stenvault/api": path.resolve(import.meta.dirname, "..", "api", "src"),
        },
    },
    envDir: path.resolve(import.meta.dirname, "..", ".."),
    root: path.resolve(import.meta.dirname),
    publicDir: path.resolve(import.meta.dirname, "public"),
    worker: {
        format: 'es',
    },
    build: {
        outDir: path.resolve(import.meta.dirname, "dist"),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (id.includes("node_modules")) {
                        if (id.includes("recharts") || id.includes("d3-")) {
                            return "vendor-charts";
                        }
                        if (id.includes("framer-motion")) {
                            return "vendor-animation";
                        }
                        if (id.includes("react-dom")) {
                            return "vendor-react-dom";
                        }
                        if (id.includes("@radix-ui")) {
                            return "vendor-radix";
                        }
                        if (id.includes("lucide-react")) {
                            return "vendor-icons";
                        }
                        if (
                            id.includes("react-markdown") ||
                            id.includes("react-syntax-highlighter") ||
                            id.includes("remark") ||
                            id.includes("rehype") ||
                            id.includes("refractor") ||
                            id.includes("prismjs")
                        ) {
                            return "vendor-markdown";
                        }
                        if (id.includes("@trpc") || id.includes("@tanstack")) {
                            return "vendor-query";
                        }
                        if (id.includes("date-fns")) {
                            return "vendor-date";
                        }
                        if (id.includes("react-hook-form") || id.includes("zod")) {
                            return "vendor-forms";
                        }
                        if (id.includes("@transcend-io")) {
                            return "vendor-crypto";
                        }
                    }
                    return undefined;
                },
            },
        },
    },
    server: {
        port: 5173,
        strictPort: false,
        host: true,
        allowedHosts: [
            ".manuspre.computer",
            ".manus.computer",
            ".manus-asia.computer",
            ".manuscomputer.ai",
            ".manusvm.computer",
            "localhost",
            "127.0.0.1",
        ],
        fs: {
            strict: true,
            deny: ["**/.*"],
        },
        proxy: {
            // SSE endpoint needs special handling — disable buffering
            "/api/local-send/events": {
                target: "http://localhost:3000",
                changeOrigin: true,
                headers: { "X-Accel-Buffering": "no" },
            },
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
            "/trpc": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
});
