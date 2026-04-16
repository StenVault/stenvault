/**
 * useTurnstile - Cloudflare Turnstile invisible CAPTCHA hook.
 *
 * Loads the script dynamically and renders a widget that auto-solves in the
 * background. The token is cached so `getToken()` returns instantly when
 * the user clicks Send — no visible delay.
 *
 * If siteKey is undefined/empty, hook is a no-op (getToken returns undefined).
 */
import { useRef, useEffect, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          size?: "normal" | "compact" | "flexible";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
        },
      ) => string;
      getResponse: (widgetId: string) => string | undefined;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/** Tokens expire at 5 min — use within 4 min to be safe. */
const TOKEN_MAX_AGE_MS = 4 * 60 * 1000;

let scriptLoaded = false;
let scriptLoading = false;

function loadScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (scriptLoaded) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  scriptLoading = true;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
}

export function useTurnstile(siteKey?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenTimeRef = useRef<number>(0);
  const pendingRef = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let mounted = true;

    loadScript().then(() => {
      if (!mounted || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return; // already rendered

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          tokenRef.current = token;
          tokenTimeRef.current = Date.now();
          // Resolve any pending getToken() call
          if (pendingRef.current) {
            pendingRef.current(token);
            pendingRef.current = null;
          }
        },
      });
    });

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!siteKey) return undefined;

    await loadScript();
    if (!window.turnstile || !widgetIdRef.current) return undefined;

    // Return cached token if fresh — zero delay for the user.
    // Tokens are single-use, so clear cache and kick off a background
    // refresh so the next getToken() call is also instant.
    if (tokenRef.current && Date.now() - tokenTimeRef.current < TOKEN_MAX_AGE_MS) {
      const token = tokenRef.current;
      tokenRef.current = null;
      window.turnstile.reset(widgetIdRef.current);
      return token;
    }

    // No cached token — reset widget and wait for the callback.
    tokenRef.current = null;
    window.turnstile.reset(widgetIdRef.current);

    return new Promise<string | undefined>((resolve) => {
      const timeout = setTimeout(() => {
        pendingRef.current = null;
        resolve(undefined);
      }, 10_000);

      pendingRef.current = (token: string) => {
        clearTimeout(timeout);
        resolve(token);
      };
    });
  }, [siteKey]);

  return { containerRef, getToken };
}
