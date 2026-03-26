/**
 * useTurnstile - Cloudflare Turnstile invisible CAPTCHA hook.
 *
 * Loads the script dynamically and renders an invisible widget.
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
          size: "invisible" | "normal" | "compact";
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

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let mounted = true;

    loadScript().then(() => {
      if (!mounted || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return; // already rendered

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        size: "invisible",
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

    window.turnstile.reset(widgetIdRef.current);

    const widgetId = widgetIdRef.current;
    return new Promise<string | undefined>((resolve) => {
      const start = Date.now();
      const poll = setInterval(() => {
        const token = window.turnstile?.getResponse(widgetId);
        if (token) {
          clearInterval(poll);
          resolve(token);
        } else if (Date.now() - start > 10_000) {
          clearInterval(poll);
          resolve(undefined);
        }
      }, 100);
    });
  }, [siteKey]);

  return { containerRef, getToken };
}
