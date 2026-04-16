import { useEffect, useRef, useCallback } from "react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { formatBytes, SEND_PASSWORD_MIN_LENGTH } from "@stenvault/shared";
import { FilePreviewIcon } from "./FilePreviewIcon";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

interface PasswordStateProps {
  fileName: string | null;
  fileSize: number | undefined;
  thumbnailUrl: string | null;
  thumbnailFailed: boolean;
  isBundle: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  handleDownload: () => void;
  verifyPassword: (pwd: string) => Promise<void>;
  verifying: boolean;
  rateLimitedUntil: number | null;
}

export function PasswordState({
  fileName,
  fileSize,
  thumbnailUrl,
  thumbnailFailed,
  isBundle,
  error,
  setError,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  handleDownload,
  verifyPassword,
  verifying,
  rateLimitedUntil,
}: PasswordStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const prevErrorRef = useRef<string | null>(null);
  const verifyRef = useRef(verifyPassword);
  verifyRef.current = verifyPassword;

  // Shake animation on new error
  useEffect(() => {
    if (error && error !== prevErrorRef.current && shakeRef.current) {
      shakeRef.current.classList.remove("animate-shake");
      // Force reflow to restart animation
      void shakeRef.current.offsetWidth;
      shakeRef.current.classList.add("animate-shake");
    }
    prevErrorRef.current = error;
  }, [error]);

  // Auto-verify: debounce password when >= min length
  const debouncedPassword = useDebounce(password, 300);
  const isRateLimited = rateLimitedUntil !== null && Date.now() < rateLimitedUntil;
  const initialMountRef = useRef(true);

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (
      debouncedPassword.length >= SEND_PASSWORD_MIN_LENGTH &&
      !verifying &&
      !isRateLimited
    ) {
      verifyRef.current(debouncedPassword);
    }
  }, [debouncedPassword, verifying, isRateLimited]);

  // Enter key: immediate verify (bypass debounce)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (password.length >= SEND_PASSWORD_MIN_LENGTH && !verifying && !isRateLimited) {
        verifyPassword(password);
      } else if (password.length > 0) {
        // Fallback for legacy sessions with shorter passwords
        handleDownload();
      }
    },
    [password, verifying, isRateLimited, verifyPassword, handleDownload],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <FilePreviewIcon thumbnailUrl={thumbnailUrl} thumbnailFailed={thumbnailFailed} isBundle={isBundle} />
        <div className="min-w-0">
          <p className="font-semibold truncate" style={{ color: LANDING_COLORS.textPrimary }}>
            {fileName || "Encrypted file"}
          </p>
          <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
            {fileSize ? formatBytes(fileSize) : ""}
          </p>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
          style={{ backgroundColor: `${LANDING_COLORS.danger}10`, color: LANDING_COLORS.danger }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="receive-file-password"
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: LANDING_COLORS.textSecondary }}
        >
          This file is password protected
          {verifying && (
            <Loader2 className="w-3 h-3 animate-spin ml-auto" style={{ color: LANDING_COLORS.accent }} />
          )}
        </label>
        <div ref={shakeRef} className="relative">
          <input
            ref={inputRef}
            id="receive-file-password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            disabled={verifying}
            autoFocus
            required
            aria-required="true"
            aria-label="File password"
            aria-describedby={error ? "pw-error" : undefined}
            className="w-full h-10 rounded-lg border px-3 pr-10 text-sm outline-none transition-colors focus:ring-1 disabled:opacity-60"
            style={{
              backgroundColor: LANDING_COLORS.bg,
              borderColor: error ? LANDING_COLORS.danger : LANDING_COLORS.border,
              color: LANDING_COLORS.textPrimary,
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: LANDING_COLORS.textMuted }}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px]" style={{ color: LANDING_COLORS.textMuted }}>
          {isRateLimited
            ? "Too many attempts. Try again in 30s."
            : "Auto-verifies as you type"}
        </p>
      </div>

      {/* Shake keyframes injected via style tag (no CSS module needed) */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
