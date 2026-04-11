import { useState, useEffect } from "react";

const STORAGE_KEY = "stenvault-cookie-consent";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-center p-3 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50">
      <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl text-xs text-slate-400">
        <p>
          We use essential cookies only for authentication and preferences.{" "}
          <a href="/privacy" className="underline hover:text-slate-200 transition-colors">
            See our Privacy Policy
          </a>
          .
        </p>
        <button
          onClick={accept}
          className="shrink-0 px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
