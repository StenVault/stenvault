/**
 * Route chunk prefetching for instant navigation.
 *
 * Lazy-loaded pages require a chunk download on first visit (~100-500ms).
 * This module pre-downloads those chunks during idle time so that
 * navigation feels instant.
 */

const routeImports: Record<string, () => Promise<unknown>> = {
  "/home": () => import("@/pages/Home"),
  "/drive": () => import("@/pages/Drive"),
  "/favorites": () => import("@/pages/Favorites"),
  "/shares": () => import("@/pages/Shares"),
  "/chat": () => import("@/pages/Chat"),
  "/trash": () => import("@/pages/Trash"),
  "/sends": () => import("@/pages/SendHistory"),
  "/settings": () => import("@/pages/Settings"),
  "/dashboard": () => import("@/pages/Dashboard"),
  "/quantum-mesh": () => import("@/pages/QuantumMesh"),
  "/transfers": () => import("@/pages/TransferHistory"),
};

const prefetched = new Set<string>();

/** Prefetch a single route chunk (no-op if already cached). */
export function prefetchRoute(path: string) {
  if (prefetched.has(path)) return;
  const loader = routeImports[path];
  if (loader) {
    prefetched.add(path);
    loader();
  }
}

/** Prefetch all core route chunks during browser idle time. */
export function prefetchCoreRoutes() {
  const run = () => {
    for (const [path, loader] of Object.entries(routeImports)) {
      if (!prefetched.has(path)) {
        prefetched.add(path);
        loader();
      }
    }
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(run);
  } else {
    setTimeout(run, 2000);
  }
}
