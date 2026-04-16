import { useState, useCallback } from "react";
import { Eye, EyeOff, Lock, X, Check, Loader2 } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { SEND_PASSWORD_MIN_LENGTH } from "@stenvault/shared";

interface SendPasswordInputProps {
  onProtect: (password: string) => Promise<void>;
  onRemove: () => Promise<void>;
  isProtected: boolean;
  disabled?: boolean;
}

export function SendPasswordInput({
  onProtect,
  onRemove,
  isProtected,
  disabled = false,
}: SendPasswordInputProps) {
  const [value, setValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = value.length >= SEND_PASSWORD_MIN_LENGTH;

  const handleProtect = useCallback(async () => {
    if (!isValid || saving || disabled) return;
    setSaving(true);
    setError(null);
    try {
      await onProtect(value);
    } catch {
      setError("Failed to set password");
    } finally {
      setSaving(false);
    }
  }, [value, isValid, saving, disabled, onProtect]);

  const handleRemove = useCallback(async () => {
    if (removing || disabled) return;
    setRemoving(true);
    setError(null);
    try {
      await onRemove();
      setValue("");
    } catch {
      setError("Failed to remove password");
    } finally {
      setRemoving(false);
    }
  }, [removing, disabled, onRemove]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && isValid && !saving && !isProtected) {
        e.preventDefault();
        handleProtect();
      }
    },
    [isValid, saving, isProtected, handleProtect],
  );

  // Protected state — compact confirmation with remove
  if (isProtected) {
    return (
      <div className="space-y-2">
        <label
          className="flex items-center gap-1.5 text-xs font-medium"
          style={{ color: LANDING_COLORS.textSecondary }}
        >
          <Lock className="w-3.5 h-3.5" />
          Password protection
        </label>
        <div
          className="flex items-center gap-3 h-10 rounded-lg border px-3"
          style={{
            backgroundColor: `${LANDING_COLORS.success}08`,
            borderColor: `${LANDING_COLORS.success}30`,
          }}
        >
          <Check className="w-4 h-4 shrink-0" style={{ color: LANDING_COLORS.success }} />
          <span
            className="text-sm font-medium flex-1"
            style={{ color: LANDING_COLORS.success }}
          >
            Protected
          </span>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing || disabled}
            className="p-1 rounded transition-colors hover:bg-white/5 cursor-pointer disabled:opacity-40"
            aria-label="Remove password"
            style={{ color: LANDING_COLORS.textMuted }}
          >
            {removing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {error && (
          <p className="text-xs" style={{ color: LANDING_COLORS.danger }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // Input state — idle / typing / valid / saving
  return (
    <div className="space-y-2">
      <label
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: LANDING_COLORS.textSecondary }}
      >
        <Lock className="w-3.5 h-3.5" />
        Password protection
        {value.length > 0 && value.length < SEND_PASSWORD_MIN_LENGTH && (
          <span className="ml-auto" style={{ color: LANDING_COLORS.textMuted }}>
            {SEND_PASSWORD_MIN_LENGTH - value.length} more
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Set a download password"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            disabled={disabled || saving}
            className="w-full h-10 rounded-lg border px-3 pr-10 text-sm outline-none transition-colors focus:ring-1 disabled:opacity-50"
            style={{
              backgroundColor: LANDING_COLORS.bg,
              borderColor: LANDING_COLORS.border,
              color: LANDING_COLORS.textPrimary,
            }}
            aria-label="File password"
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
        <button
          type="button"
          onClick={handleProtect}
          disabled={!isValid || saving || disabled}
          className="h-10 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          style={{
            backgroundColor: isValid ? LANDING_COLORS.accent : `${LANDING_COLORS.accent}30`,
            color: isValid ? "#fff" : LANDING_COLORS.textMuted,
          }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Protect"
          )}
        </button>
      </div>
      {error && (
        <p className="text-xs" style={{ color: LANDING_COLORS.danger }}>
          {error}
        </p>
      )}
    </div>
  );
}
