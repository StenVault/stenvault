import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type PluginOption } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { visualizer } from "rollup-plugin-visualizer";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// Build plugins list
// wasm() + topLevelAwait() handle @stenvault/pqc-wasm's .wasm imports
const plugins: PluginOption[] = [
    wasm(),
    topLevelAwait(),
    react(),
    tailwindcss(),
    jsxLocPlugin(),
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
